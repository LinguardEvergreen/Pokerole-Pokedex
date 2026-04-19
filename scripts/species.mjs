import { POKEMON_PACK_ID, speciesKey } from "./constants.mjs";

/**
 * Lightweight catalog loader for the system's pokemon-actors compendium.
 * Results are cached for the life of the world session.
 */

let _indexCache = null;

/**
 * Parse the National Dex number embedded in the Corebook biography import tag.
 * Returns an integer or null when the tag is missing or malformed.
 */
function _parsePokedexNumber(bio) {
  if (!bio) return null;
  const m = String(bio).match(/Corebook\s+Pokedex\s+Import\s*#\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Heuristic: does a name look like a regional/mega/dynamax form rather than
 * the canonical base species? Used to collapse the catalog when the compendium
 * stores multiple entries under the same Pokédex number.
 */
const _FORM_MARKER_RE = /\b(mega|primal|gigantamax|g[ -]?max|dynamax|alolan?|galarian?|hisuian?|paldean?|ultra|origin|therian|incarnate|white|black|sky|speed|defense|attack|shiny|shadow|zen|pirouette|blade|shield|resolute|dusk|dawn|midnight|midday|crowned|rider|eternamax|teal|wellspring|hearthflame|cornerstone)\b/i;

function _normalize(s) {
  return String(s ?? "").trim().toLowerCase();
}

function _isBaseForm(entry) {
  const name = entry?.name || "";
  if (!name) return false;
  // Parentheses almost always indicate an alternate form
  if (/[()]/.test(name)) return false;
  // Common hyphen notations: "Exeggutor-Alola", "Rotom-Wash", "Charizard-Mega-X"
  if (/[-–]\s*(alola|galar|hisui|paldea|mega|primal|gmax|gigantamax|therian|incarnate|origin|crowned|rider|zen|attack|defense|speed|sky|white|black|ultra|dusk|dawn|midnight|midday|shadow)/i.test(name)) return false;
  if (_FORM_MARKER_RE.test(name)) return false;
  // If the compendium tags a canonical species (e.g. system.species = "exeggutor")
  // and the entry name differs, we're looking at a form rather than the base.
  const species = entry?.species || "";
  if (species) {
    const n = _normalize(name);
    const s = _normalize(species);
    if (n && s && n !== s) return false;
  }
  return true;
}

/**
 * Sort two variants so the "most base" one lands first. Within a Pokédex
 * number, this is the entry we show in the catalog; cycling picks the rest.
 */
function _compareVariants(a, b) {
  const ba = _isBaseForm(a);
  const bb = _isBaseForm(b);
  if (ba && !bb) return -1;
  if (!ba && bb) return 1;
  // Prefer the shorter name ("Exeggutor" before "Exeggutor-Alolan")
  if (a.name.length !== b.name.length) return a.name.length - b.name.length;
  return a.name.localeCompare(b.name);
}

export async function getSpeciesIndex() {
  if (_indexCache) return _indexCache;
  const pack = game.packs?.get(POKEMON_PACK_ID);
  if (!pack) {
    _indexCache = [];
    return _indexCache;
  }
  // Request system.biography (Pokédex number source) and system.species
  // (canonical species name used for dedup). We deliberately avoid deeper
  // paths like system.types.primary because the server-side walk crashes on
  // malformed entries with "Cannot use 'in' operator in X". Single-level
  // lookups under `system` are safe, and we try/catch anyway so the catalog
  // stays functional even if the compendium is misshapen.
  let index;
  try {
    index = await pack.getIndex({ fields: ["system.biography", "system.species"] });
  } catch (err) {
    console.warn("pokerole-pokedex: indexed fetch failed, falling back to default index", err);
    index = await pack.getIndex();
  }
  const raw = Array.from(index.values()).map((e) => {
    const bio = e?.system?.biography ?? "";
    const species = e?.system?.species ?? "";
    return {
      id: e._id,
      uuid: `Compendium.${POKEMON_PACK_ID}.${e._id}`,
      name: e.name,
      species,
      // Species key groups all variants (Mega, regional, etc.) under the same
      // seen/caught slot — what the rest of the module already uses.
      key: speciesKey(e),
      img: e.img,
      pokedexNumber: _parsePokedexNumber(bio),
      primary: "normal",
      secondary: "none"
    };
  });

  // Group alternate forms (Mega, regional variants, Gigantamax, etc.) that
  // share the same National Dex number into a single catalog slot with a
  // `variants` list. The first variant is the "most base" form and becomes
  // the slot's display; the rest are reachable via the single-view form
  // cycler.
  const byNumber = new Map();
  const unnumbered = [];
  for (const entry of raw) {
    if (entry.pokedexNumber == null) {
      unnumbered.push(entry);
      continue;
    }
    const existing = byNumber.get(entry.pokedexNumber);
    if (existing) {
      existing.push(entry);
    } else {
      byNumber.set(entry.pokedexNumber, [entry]);
    }
  }

  const numbered = [];
  for (const [num, variants] of byNumber.entries()) {
    variants.sort(_compareVariants);
    const base = variants[0];
    numbered.push({
      ...base,
      pokedexNumber: num,
      variants
    });
  }
  numbered.sort((a, b) => a.pokedexNumber - b.pokedexNumber);

  unnumbered.sort((a, b) => a.name.localeCompare(b.name));
  const unnumberedWrapped = unnumbered.map((e) => ({ ...e, variants: [e] }));

  _indexCache = [...numbered, ...unnumberedWrapped];
  return _indexCache;
}

/**
 * Fetch a full species document from the compendium (or the world) by key.
 * Returns the first match whose species key equals the given key. Falls back
 * to name-only matching when the compendium is unavailable.
 */
export async function getSpeciesActorByKey(key) {
  if (!key) return null;
  const worldHit = game.actors?.find?.(
    (a) => a.type === "pokemon" && speciesKey(a) === key
  );
  if (worldHit) return worldHit;

  const pack = game.packs?.get(POKEMON_PACK_ID);
  if (!pack) return null;
  const list = await getSpeciesIndex();
  const entry = list.find((e) => e.key === key);
  if (!entry) return null;
  return pack.getDocument(entry.id);
}

/**
 * Fetch a full species document by its compendium id. Used by the form
 * cycler so each variant load targets exactly that entry (not the species
 * group it belongs to).
 */
export async function getSpeciesActorById(id) {
  if (!id) return null;
  const pack = game.packs?.get(POKEMON_PACK_ID);
  if (!pack) return null;
  return pack.getDocument(id);
}

/**
 * Find the variants list that best matches the given actor. Used when the
 * Pokédex is opened directly from a targeted token (not from the catalog):
 * we still want to know if the species has alternate forms so the cycler
 * can appear. Matches by Pokédex number first (from biography), falling
 * back to species key.
 */
export async function getVariantsForActor(actor) {
  if (!actor) return [];
  const list = await getSpeciesIndex();
  const bio = actor?.system?.biography ?? "";
  const num = _parsePokedexNumber(bio);
  if (num != null) {
    const hit = list.find((e) => e.pokedexNumber === num);
    if (hit) return hit.variants ?? [hit];
  }
  const key = speciesKey(actor);
  const hit = list.find((e) => e.key === key);
  return hit?.variants ?? [];
}
