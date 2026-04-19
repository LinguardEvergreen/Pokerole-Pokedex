import { POKEMON_PACK_ID, speciesKey } from "./constants.mjs";

/**
 * Lightweight catalog loader for the system's pokemon-actors compendium.
 * Results are cached for the life of the world session.
 */

let _indexCache = null;

export async function getSpeciesIndex() {
  if (_indexCache) return _indexCache;
  const pack = game.packs?.get(POKEMON_PACK_ID);
  if (!pack) {
    _indexCache = [];
    return _indexCache;
  }
  // Use only the default index fields (name, img, type). Requesting nested
  // system.* paths triggers a server-side walk that crashes on malformed
  // entries with "Cannot use 'in' operator". Type accents in the catalog
  // grid fall back to a neutral color, which is fine aesthetically.
  const index = await pack.getIndex();
  const list = Array.from(index.values()).map((e) => ({
    id: e._id,
    uuid: `Compendium.${POKEMON_PACK_ID}.${e._id}`,
    name: e.name,
    key: speciesKey(e),
    img: e.img,
    primary: "normal",
    secondary: "none"
  })).sort((a, b) => a.name.localeCompare(b.name));
  _indexCache = list;
  return list;
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
