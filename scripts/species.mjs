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

export async function getSpeciesIndex() {
  if (_indexCache) return _indexCache;
  const pack = game.packs?.get(POKEMON_PACK_ID);
  if (!pack) {
    _indexCache = [];
    return _indexCache;
  }
  // Request system.biography so the catalog can be sorted by the National Dex
  // number embedded in the "Corebook Pokedex Import #NNN." tag. We deliberately
  // avoid deeper paths like system.types.primary because the server-side walk
  // crashes on malformed entries with "Cannot use 'in' operator in X". A single
  // lookup under the system object is safe, and we try/catch anyway so the
  // catalog stays functional even if the compendium is misshapen.
  let index;
  try {
    index = await pack.getIndex({ fields: ["system.biography"] });
  } catch (err) {
    console.warn("pokerole-pokedex: biography index fetch failed, falling back to default index", err);
    index = await pack.getIndex();
  }
  const list = Array.from(index.values()).map((e) => {
    const bio = e?.system?.biography ?? "";
    return {
      id: e._id,
      uuid: `Compendium.${POKEMON_PACK_ID}.${e._id}`,
      name: e.name,
      key: speciesKey(e),
      img: e.img,
      pokedexNumber: _parsePokedexNumber(bio),
      primary: "normal",
      secondary: "none"
    };
  }).sort((a, b) => {
    const ax = a.pokedexNumber ?? Number.POSITIVE_INFINITY;
    const bx = b.pokedexNumber ?? Number.POSITIVE_INFINITY;
    if (ax !== bx) return ax - bx;
    return a.name.localeCompare(b.name);
  });
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
