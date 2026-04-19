import { MODULE_ID, speciesKey } from "./constants.mjs";
import { getSpeciesIndex } from "./species.mjs";

/* ---------------------------------------- */
/*  Trainer resolution                      */
/* ---------------------------------------- */

/**
 * Return the trainer actor associated with the current user:
 *   1. user.character (if it's a trainer)
 *   2. first owned trainer actor in the world
 */
export function getCurrentUserTrainer() {
  const char = game.user?.character;
  if (char?.type === "trainer") return char;
  const owned = game.actors?.filter?.((a) => a.type === "trainer" && a.isOwner) ?? [];
  return owned[0] ?? null;
}

/**
 * The single client that should perform world-state writes when the same
 * update hook fires on every connected client. We pick the first active
 * non-GM owner of the document, falling back to the active GM.
 */
export function isPrimaryOwner(doc) {
  const owners = game.users.filter(
    (u) => u.active && doc.testUserPermission?.(u, "OWNER")
  );
  const primary = owners.find((u) => !u.isGM) ?? owners.find((u) => u.isGM);
  return primary?.id === game.user.id;
}

/* ---------------------------------------- */
/*  Seen / caught flag arrays               */
/* ---------------------------------------- */

export function getSeenList(trainer) {
  return Array.isArray(trainer?.getFlag?.(MODULE_ID, "seen"))
    ? trainer.getFlag(MODULE_ID, "seen")
    : [];
}

export function getCaughtList(trainer) {
  return Array.isArray(trainer?.getFlag?.(MODULE_ID, "caught"))
    ? trainer.getFlag(MODULE_ID, "caught")
    : [];
}

export function isSeen(trainer, key) {
  if (!trainer || !key) return false;
  return getSeenList(trainer).includes(key);
}

export function isCaught(trainer, key) {
  if (!trainer || !key) return false;
  return getCaughtList(trainer).includes(key);
}

/**
 * Per-variant unlock list. Stores the compendium-entry ids of the specific
 * forms (base / Mega / regional / Gmax) a trainer has seen or caught. This is
 * what gates the form cycler on the single-view shell so players can only
 * browse variants they've actually encountered.
 */
export function getFormsList(trainer) {
  return Array.isArray(trainer?.getFlag?.(MODULE_ID, "forms"))
    ? trainer.getFlag(MODULE_ID, "forms")
    : [];
}

export function isFormUnlocked(trainer, variantId) {
  if (!trainer || !variantId) return false;
  return getFormsList(trainer).includes(variantId);
}

/**
 * Extract the compendium document id from an actor that was created from a
 * pokemon-actors compendium entry. Foundry v13 stores the origin in
 * `_stats.compendiumSource`; older data lives in `flags.core.sourceId`. Note
 * that after a pok-role evolution this id still points to the *pre*-evolution
 * species, so callers must validate the match against the current species.
 */
function _compendiumIdFromActor(actor) {
  const src = actor?._stats?.compendiumSource || actor?.flags?.core?.sourceId;
  if (!src) return null;
  const parts = String(src).split(".");
  return parts[parts.length - 1] || null;
}

/**
 * Resolve which catalog variant corresponds to a live Pokémon actor. Tries,
 * in order:
 *   1. Compendium source id (if it still matches the current species)
 *   2. Exact name match (catches Mega/regional variants whose display name
 *      differs from the base species, e.g. "Charizard-Mega-X")
 *   3. Species key match (falls through to the base form, since the catalog
 *      sorts variants base-first)
 * Returns the variant's compendium id, or null if no match.
 */
async function _resolveVariantId(pokemon) {
  try {
    const list = await getSpeciesIndex();
    const liveSpecies = String(pokemon?.system?.species ?? "").trim().toLowerCase();
    const liveName = String(pokemon?.name ?? "").trim().toLowerCase();

    const cid = _compendiumIdFromActor(pokemon);
    if (cid) {
      for (const entry of list) {
        for (const v of entry.variants ?? [entry]) {
          if (v.id !== cid) continue;
          const vSpecies = String(v.species ?? "").trim().toLowerCase();
          // Trust compendiumSource only if the species still matches — an
          // evolved actor keeps the pre-evolution source but is now a
          // different variant entirely.
          if (!liveSpecies || !vSpecies || vSpecies === liveSpecies) return cid;
        }
      }
    }

    for (const entry of list) {
      for (const v of entry.variants ?? [entry]) {
        const vn = String(v.name ?? "").trim().toLowerCase();
        if (vn && vn === liveName) return v.id;
      }
    }

    for (const entry of list) {
      for (const v of entry.variants ?? [entry]) {
        const vs = String(v.species ?? "").trim().toLowerCase();
        if (vs && vs === liveSpecies) return v.id;
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | variant resolution failed`, err);
  }
  return null;
}

async function writeLists(trainer, seenArr, caughtArr, formsArr) {
  const payload = {
    [`flags.${MODULE_ID}.seen`]: seenArr,
    [`flags.${MODULE_ID}.caught`]: caughtArr,
    "system.pokedex.seen": seenArr.length,
    "system.pokedex.caught": caughtArr.length
  };
  if (Array.isArray(formsArr)) {
    payload[`flags.${MODULE_ID}.forms`] = formsArr;
  }
  await trainer.update(payload);
}

/**
 * Mark the given pokemon as seen on the trainer's pokédex log. Also unlocks
 * the specific variant (Mega / regional / Gmax) so it becomes browsable in
 * the form cycler. Returns true if anything changed.
 */
export async function markSeen(trainer, pokemon) {
  const key = speciesKey(pokemon);
  if (!trainer || !key) return false;
  const seen = new Set(getSeenList(trainer));
  const forms = new Set(getFormsList(trainer));
  const variantId = await _resolveVariantId(pokemon);

  let changed = false;
  if (!seen.has(key)) { seen.add(key); changed = true; }
  if (variantId && !forms.has(variantId)) { forms.add(variantId); changed = true; }
  if (!changed) return false;

  await writeLists(
    trainer,
    Array.from(seen),
    getCaughtList(trainer),
    Array.from(forms)
  );
  return true;
}

/**
 * Mark the given pokemon as caught (and therefore also seen), and unlock its
 * specific variant so the form cycler can show it. Returns true if anything
 * changed.
 */
export async function markCaught(trainer, pokemon) {
  const key = speciesKey(pokemon);
  if (!trainer || !key) return false;
  const seen = new Set(getSeenList(trainer));
  const caught = new Set(getCaughtList(trainer));
  const forms = new Set(getFormsList(trainer));
  const variantId = await _resolveVariantId(pokemon);

  let changed = false;
  if (!seen.has(key)) { seen.add(key); changed = true; }
  if (!caught.has(key)) { caught.add(key); changed = true; }
  if (variantId && !forms.has(variantId)) { forms.add(variantId); changed = true; }
  if (!changed) return false;

  await writeLists(
    trainer,
    Array.from(seen),
    Array.from(caught),
    Array.from(forms)
  );
  return true;
}
