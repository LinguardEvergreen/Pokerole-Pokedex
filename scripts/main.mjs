/**
 * Poké Role - Pokédex module
 * Injects a Pokédex button into the left scene controls column and opens a
 * modern, animated Pokédex overlay showing the targeted Pokémon's portrait,
 * types and biography/pokédex entry.
 */

const MODULE_ID = "pokerole-pokedex";
const SYSTEM_ID = "pok-role-system";

const TYPE_ICON_ROOT = `systems/${SYSTEM_ID}/assets/types`;

const TYPE_COLORS = Object.freeze({
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

const loc = (key, data = {}) => game.i18n.format(key, data);

function getTypeIcon(typeKey) {
  const key = String(typeKey ?? "none").toLowerCase();
  return `${TYPE_ICON_ROOT}/${key}.svg`;
}

function getTypeColor(typeKey) {
  const key = String(typeKey ?? "none").toLowerCase();
  return TYPE_COLORS[key] ?? TYPE_COLORS.none;
}

function getTypeLabel(typeKey) {
  const key = String(typeKey ?? "none").toLowerCase();
  const systemLabel = game.i18n.localize(`POKROLE.Types.${key}`);
  if (systemLabel && systemLabel !== `POKROLE.Types.${key}`) return systemLabel;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Resolve the first currently targeted Pokémon actor for the local user.
 * Falls back to `game.user.targets` (Set<Token>) in v13.
 */
function getTargetedPokemonActor() {
  const targets = Array.from(game.user?.targets ?? []);
  for (const token of targets) {
    const actor = token?.actor;
    if (!actor) continue;
    if (actor.type === "pokemon") return actor;
  }
  // Fallback: any targeted actor (in case user wants to inspect a trainer too)
  const firstAny = targets[0]?.actor;
  return firstAny ?? null;
}

/**
 * Build the data payload used by the Pokédex template.
 */
function buildPokedexData(actor) {
  const sys = actor.system ?? {};
  const primary = sys.types?.primary ?? "normal";
  const secondary = sys.types?.secondary ?? "none";

  const entry = sys.biography?.trim?.() || loc("POKEDEX.NoEntry");

  const types = [{
    key: primary,
    label: getTypeLabel(primary),
    icon: getTypeIcon(primary),
    color: getTypeColor(primary)
  }];
  if (secondary && secondary !== "none") {
    types.push({
      key: secondary,
      label: getTypeLabel(secondary),
      icon: getTypeIcon(secondary),
      color: getTypeColor(secondary)
    });
  }

  return {
    name: actor.name,
    species: sys.species?.trim?.() || actor.name,
    portrait: actor.img || "icons/svg/mystery-man.svg",
    types,
    primaryColor: getTypeColor(primary),
    secondaryColor: getTypeColor(secondary !== "none" ? secondary : primary),
    entry,
    dexNumber: sys.dexNumber ?? null
  };
}

/* ---------------------------------------- */
/*  Scene Control Button Injection          */
/* ---------------------------------------- */

function injectPokedexButton() {
  const column = document.getElementById("ui-left-column-1");
  if (!column) return;
  if (column.querySelector(".pokerole-pokedex-btn")) return;

  // Locate the Token controls button (fa-user-large) inside the column.
  const tokenBtn = column.querySelector(
    "[data-control='tokens'], button.fa-user-large, li.fa-user-large, .control.fa-user-large"
  );
  const host = tokenBtn?.parentElement ?? column.querySelector("menu, ol, ul, nav, .scene-controls") ?? column;

  const tag = tokenBtn?.tagName?.toLowerCase() === "li" ? "li" : "button";
  const btn = document.createElement(tag);
  if (tag === "button") btn.type = "button";
  btn.className = "control ui-control layer icon fa-solid fa-book-atlas pokerole-pokedex-btn";
  btn.dataset.tool = `${MODULE_ID}-open`;
  btn.dataset.tooltip = loc("POKEDEX.ButtonTooltip");
  btn.setAttribute("aria-label", loc("POKEDEX.ButtonTooltip"));

  // Use pointerdown + click; stopPropagation/stopImmediatePropagation keep
  // ApplicationV2's delegated action handler from complaining about an
  // unregistered action.
  const handler = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
    if (ev.type === "click") openPokedex();
  };
  btn.addEventListener("pointerdown", handler);
  btn.addEventListener("click", handler);

  if (tokenBtn && tokenBtn.parentElement === host) {
    tokenBtn.after(btn);
  } else {
    host.prepend(btn);
  }
}

// v13 renders scene controls multiple times; re-inject on every render.
Hooks.on("renderSceneControls", () => {
  // Delay slightly so the DOM is fully settled after ApplicationV2 render
  requestAnimationFrame(injectPokedexButton);
});

Hooks.once("ready", () => {
  injectPokedexButton();
  console.log(`${MODULE_ID} | ready`);
});

/* ---------------------------------------- */
/*  Pokédex Overlay                         */
/* ---------------------------------------- */

let activeOverlay = null;

function closePokedex() {
  if (!activeOverlay) return;
  const el = activeOverlay;
  activeOverlay = null;
  el.classList.add("closing");
  el.addEventListener("animationend", () => el.remove(), { once: true });
  // Safety fallback
  setTimeout(() => el.remove(), 900);
}

function openPokedex() {
  const actor = getTargetedPokemonActor();
  if (!actor) {
    ui.notifications.warn(loc("POKEDEX.NoTarget"));
    return;
  }

  // If already open, close then reopen with new actor
  if (activeOverlay) {
    closePokedex();
  }

  const data = buildPokedexData(actor);

  const overlay = document.createElement("div");
  overlay.className = "pokerole-pokedex-overlay opening";
  overlay.innerHTML = renderPokedexHTML(data);

  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) closePokedex();
  });
  overlay.querySelector("[data-action='close']")?.addEventListener("click", closePokedex);

  document.body.appendChild(overlay);
  activeOverlay = overlay;

  // Escape closes the dex
  const escHandler = (ev) => {
    if (ev.key === "Escape") {
      closePokedex();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

function renderPokedexHTML(data) {
  const typesHTML = data.types.map((t) => `
    <span class="pokedex-type-chip" style="--type-color: ${t.color};">
      <img src="${t.icon}" alt="${t.label}" draggable="false" />
      <span>${t.label}</span>
    </span>
  `).join("");

  const dexNumber = data.dexNumber
    ? `<div class="pokedex-number">N° ${String(data.dexNumber).padStart(3, "0")}</div>`
    : "";

  return `
  <div class="pokedex-device" role="dialog" aria-label="Pokédex"
       style="--primary-color: ${data.primaryColor}; --secondary-color: ${data.secondaryColor};">
    <div class="pokedex-shell pokedex-shell-left">
      <div class="pokedex-top-bar">
        <span class="pokedex-big-light"></span>
        <span class="pokedex-small-light pl-red"></span>
        <span class="pokedex-small-light pl-yellow"></span>
        <span class="pokedex-small-light pl-green"></span>
      </div>
      <div class="pokedex-screen">
        <div class="pokedex-screen-frame">
          <div class="pokedex-screen-inner">
            <div class="pokedex-portrait-bg"></div>
            <img class="pokedex-portrait" src="${data.portrait}" alt="${data.name}" draggable="false" />
            <div class="pokedex-scanline"></div>
          </div>
        </div>
        <div class="pokedex-screen-caption">
          <div class="pokedex-name">${data.species}</div>
          ${dexNumber}
        </div>
      </div>
      <div class="pokedex-speaker">
        <span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
    </div>

    <div class="pokedex-hinge"></div>

    <div class="pokedex-shell pokedex-shell-right">
      <div class="pokedex-info-screen">
        <div class="pokedex-info-header">
          <div class="pokedex-info-title">${data.name}</div>
          <div class="pokedex-types">${typesHTML}</div>
        </div>
        <div class="pokedex-info-body">
          <div class="pokedex-entry-label">${loc("POKEDEX.EntryLabel")}</div>
          <div class="pokedex-entry">${foundry.utils.escapeHTML ? foundry.utils.escapeHTML(data.entry) : escapeBasic(data.entry)}</div>
        </div>
      </div>
      <div class="pokedex-dpad">
        <div class="pokedex-dpad-v"></div>
        <div class="pokedex-dpad-h"></div>
      </div>
      <div class="pokedex-buttons-row">
        <button type="button" class="pokedex-btn pokedex-btn-red" data-action="close" title="${loc("POKEDEX.Close")}"></button>
        <button type="button" class="pokedex-btn pokedex-btn-blue" data-action="close"></button>
      </div>
    </div>
  </div>
  `;
}

function escapeBasic(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[m]);
}
