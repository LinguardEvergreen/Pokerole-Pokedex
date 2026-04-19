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
const _FORM_MARKER_RE = /\b(mega|primal|gigantamax|g[ -]?max|dynamax|alolan?|galarian?|hisuian?|paldean?|ultra|origin|therian|white|black|sky|speed|defense|attack|shiny)\b/i;

function _isBaseForm(name) {
  if (!name) return false;
  if (/[()]/.test(name)) return false;
  if (_FORM_MARKER_RE.test(name)) return false;
  return true;
}

/**
 * Pick the better representative when two entries share a Pokédex number.
 * Base forms win over marked forms; among peers, the shortest name wins
 * (base forms virtually always have shorter names than their variants).
 */
function _pickBetter(existing, candidate) {
  const eb = _isBaseForm(existing.name);
  const cb = _isBaseForm(candidate.name);
  if (cb && !eb) return candidate;
  if (eb && !cb) return existing;
  if (candidate.name.length < existing.name.length) return candidate;
  return existing;
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
  const raw = Array.from(index.values()).map((e) => {
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
  });

  // Collapse alternate forms (Mega, regional variants, Gigantamax, etc.)
  // that share the same National Dex number into a single catalog slot,
  // preferring the entry that looks like the base form.
  const byNumber = new Map();
  const unnumbered = [];
  for (const entry of raw) {
    if (entry.pokedexNumber == null) {
      unnumbered.push(entry);
      continue;
    }
    const existing = byNumber.get(entry.pokedexNumber);
    byNumber.set(entry.pokedexNumber, existing ? _pickBetter(existing, entry) : entry);
  }
  unnumbered.sort((a, b) => a.name.localeCompare(b.name));
  const list = [
    ...Array.from(byNumber.values()).sort((a, b) => a.pokedexNumber - b.pokedexNumber),
    ...unnumbered
  ];
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
