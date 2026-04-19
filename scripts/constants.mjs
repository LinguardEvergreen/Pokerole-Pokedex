export const MODULE_ID = "pokerole-pokedex";
export const SYSTEM_ID = "pok-role-system";
export const POKEMON_PACK_ID = `${SYSTEM_ID}.pokemon-actors`;

export const POKEMON_RANKS = Object.freeze([
  "starter",
  "rookie",
  "standard",
  "advanced",
  "expert",
  "ace",
  "master",
  "champion"
]);

export const TYPE_COLORS = Object.freeze({
  normal: "#A8A77A",
  fire: "#EE8130",
  water: "#6390F0",
  electric: "#F7D02C",
  grass: "#7AC74C",
  ice: "#96D9D6",
  fighting: "#C22E28",
  poison: "#A33EA1",
  ground: "#E2BF65",
  flying: "#A98FF3",
  psychic: "#F95587",
  bug: "#A6B91A",
  rock: "#B6A136",
  ghost: "#735797",
  dragon: "#6F35FC",
  dark: "#705746",
  steel: "#B7B7CE",
  fairy: "#D685AD",
  typeless: "#68A090",
  none: "#68A090"
});

export const TYPE_ICON_ROOT = `systems/${SYSTEM_ID}/assets/types`;

export function loc(key, data = {}) {
  return game.i18n.format(key, data);
}

export function getTypeIcon(typeKey) {
  const key = String(typeKey ?? "none").toLowerCase();
  return `${TYPE_ICON_ROOT}/${key}.svg`;
}

export function getTypeColor(typeKey) {
  const key = String(typeKey ?? "none").toLowerCase();
  return TYPE_COLORS[key] ?? TYPE_COLORS.none;
}

export function getTypeLabel(typeKey) {
  const key = String(typeKey ?? "none").toLowerCase();
  const systemLabel = game.i18n.localize(`POKROLE.Types.${key}`);
  if (systemLabel && systemLabel !== `POKROLE.Types.${key}`) return systemLabel;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function getRankLabel(rankKey) {
  const key = String(rankKey ?? "").toLowerCase();
  const cap = key.charAt(0).toUpperCase() + key.slice(1);
  const systemLabel = game.i18n.localize(`POKROLE.Pokemon.TierValues.${cap}`);
  if (systemLabel && !systemLabel.startsWith("POKROLE.")) return systemLabel;
  return cap;
}

/**
 * Canonical species key used for seen/caught tracking. Uses the species name
 * (or actor name as fallback) lowercased and trimmed so it matches across
 * compendium entries, world actors, and synthetic tokens.
 */
export function speciesKey(actorOrEntry) {
  if (!actorOrEntry) return "";
  const raw = actorOrEntry?.system?.species || actorOrEntry?.name || "";
  return String(raw).trim().toLowerCase();
}

/**
 * Clean up a Pok-Role Pokémon biography for pokédex display:
 *   - Strip the "Corebook Pokedex import #NNN." prefix
 *   - Strip the trailing "Abilities: ..." / "Abilità: ..." section
 *   - Insert a paragraph break after "Category: ... Pokémon."
 */
export function cleanBiography(text) {
  let entry = String(text ?? "").trim();
  if (!entry) return "";
  entry = entry.replace(/^\s*Corebook[^.]*\.\s*/i, "");
  entry = entry.replace(/\s*(Abilities|Abilit[àa])\s*:.*$/is, "");
  entry = entry.replace(/((?:Category|Categoria)\s*:\s*[^.]+\.)\s+/i, "$1\n\n");
  return entry.trim();
}

export function escapeHTML(str) {
  if (foundry?.utils?.escapeHTML) return foundry.utils.escapeHTML(String(str ?? ""));
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[m]);
}
