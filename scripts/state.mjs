import { MODULE_ID, speciesKey } from "./constants.mjs";

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

async function writeLists(trainer, seenArr, caughtArr) {
  await trainer.update({
    [`flags.${MODULE_ID}.seen`]: seenArr,
    [`flags.${MODULE_ID}.caught`]: caughtArr,
    "system.pokedex.seen": seenArr.length,
    "system.pokedex.caught": caughtArr.length
  });
}

/**
 * Mark the given pokemon as seen on the trainer's pokédex log.
 * Returns true if the list changed.
 */
export async function markSeen(trainer, pokemon) {
  const key = speciesKey(pokemon);
  if (!trainer || !key) return false;
  const seen = new Set(getSeenList(trainer));
  if (seen.has(key)) return false;
  seen.add(key);
  await writeLists(trainer, Array.from(seen), getCaughtList(trainer));
  return true;
}

/**
 * Mark the given pokemon as caught (and therefore also seen). Returns true if
 * anything changed.
 */
export async function markCaught(trainer, pokemon) {
  const key = speciesKey(pokemon);
  if (!trainer || !key) return false;
  const seen = new Set(getSeenList(trainer));
  const caught = new Set(getCaughtList(trainer));
  let changed = false;
  if (!seen.has(key)) { seen.add(key); changed = true; }
  if (!caught.has(key)) { caught.add(key); changed = true; }
  if (!changed) return false;
  await writeLists(trainer, Array.from(seen), Array.from(caught));
  return true;
}
