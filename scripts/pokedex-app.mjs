import {
  MODULE_ID,
  POKEMON_RANKS,
  cleanBiography,
  escapeHTML,
  getRankLabel,
  getTypeColor,
  getTypeIcon,
  getTypeLabel,
  loc,
  speciesKey
} from "./constants.mjs";
import {
  getCaughtList,
  getCurrentUserTrainer,
  getSeenList,
  isCaught,
  isPrimaryOwner,
  isSeen,
  markSeen
} from "./state.mjs";
import { getSpeciesActorByKey, getSpeciesIndex } from "./species.mjs";

/* ============================================================
 *  State + lifecycle
 * ============================================================ */

let state = null;
let overlay = null;
let escHandler = null;

/**
 * state shape:
 * {
 *   mode: "single-entry" | "single-moves" | "catalog",
 *   actor: Actor | null,         // for single modes
 *   trainer: Actor | null,
 *   fromCatalog: boolean         // single mode opened from catalog
 * }
 */

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className = "pokerole-pokedex-overlay opening";
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) closePokedex();
  });
  document.body.appendChild(overlay);

  escHandler = (ev) => {
    if (ev.key === "Escape") closePokedex();
    else if (ev.key === "ArrowRight") _nav("right");
    else if (ev.key === "ArrowLeft") _nav("left");
  };
  document.addEventListener("keydown", escHandler);
  return overlay;
}

export function closePokedex() {
  if (!overlay) return;
  const el = overlay;
  overlay = null;
  state = null;
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
  el.classList.add("closing");
  el.addEventListener("animationend", () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 900);
}

export async function openSinglePokedex(actor, { markSeenOnOpen = false } = {}) {
  if (!actor) return;
  const trainer = getCurrentUserTrainer();

  if (markSeenOnOpen && trainer && trainer.isOwner) {
    markSeen(trainer, actor).catch((err) => console.error(MODULE_ID, err));
  }

  state = {
    mode: "single-entry",
    actor,
    trainer,
    fromCatalog: false
  };
  ensureOverlay();
  await _render();
}

export async function openCatalogPokedex(trainer) {
  const resolvedTrainer = trainer ?? getCurrentUserTrainer();
  state = {
    mode: "catalog",
    trainer: resolvedTrainer,
    actor: null,
    fromCatalog: false
  };
  ensureOverlay();
  await _render();
}

function _nav(direction) {
  if (!state) return;
  if (state.mode === "single-entry" && direction === "right") {
    state.mode = "single-moves";
    _render();
  } else if (state.mode === "single-moves" && direction === "left") {
    state.mode = "single-entry";
    _render();
  } else if (state.mode === "single-entry" && direction === "left" && state.fromCatalog) {
    openCatalogPokedex(state.trainer);
  } else if (state.mode === "catalog" && direction === "left") {
    // no-op; catalog is the root
  }
}

/* ============================================================
 *  Rendering
 * ============================================================ */

async function _render() {
  if (!overlay || !state) return;
  let html = "";
  if (state.mode === "single-entry") {
    html = _renderSingle(state.actor, "entry");
  } else if (state.mode === "single-moves") {
    html = _renderSingle(state.actor, "moves");
  } else if (state.mode === "catalog") {
    html = await _renderCatalog(state.trainer);
  }
  const wasEmpty = overlay.children.length === 0;
  if (wasEmpty) {
    overlay.innerHTML = html;
    _attachHandlers();
    return;
  }
  // Swap with a short cross-fade so page changes feel alive
  const current = overlay.firstElementChild;
  const next = document.createElement("div");
  next.innerHTML = html;
  const nextEl = next.firstElementChild;
  nextEl.classList.add("page-enter");
  current.classList.add("page-exit");
  overlay.appendChild(nextEl);
  _attachHandlers();
  setTimeout(() => {
    current?.remove();
    nextEl.classList.remove("page-enter");
  }, 260);
}

function _buildSingleData(actor) {
  const sys = actor?.system ?? {};
  const primary = sys.types?.primary ?? "normal";
  const secondary = sys.types?.secondary ?? "none";
  const entry = cleanBiography(sys.biography) || loc("POKEDEX.NoEntry");

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
  const learnset = POKEMON_RANKS.map((rank) => {
    const raw = `${sys.learnsetByRank?.[rank] ?? ""}`;
    const moves = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return { rank, label: getRankLabel(rank), moves };
  }).filter((g) => g.moves.length > 0);

  return {
    name: actor?.name ?? "???",
    species: sys.species?.trim?.() || actor?.name || "???",
    portrait: actor?.img || "icons/svg/mystery-man.svg",
    types,
    primaryColor: getTypeColor(primary),
    secondaryColor: getTypeColor(secondary !== "none" ? secondary : primary),
    entry,
    learnset
  };
}

function _renderSingle(actor, page) {
  const data = _buildSingleData(actor);
  const typesHTML = data.types.map((t) => `
    <span class="pokedex-type-chip" style="--type-color: ${t.color};">
      <img src="${t.icon}" alt="${escapeHTML(t.label)}" draggable="false" />
      <span>${escapeHTML(t.label)}</span>
    </span>
  `).join("");

  const leftHTML = `
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
            <img class="pokedex-portrait" src="${data.portrait}" alt="${escapeHTML(data.name)}" draggable="false" />
            <div class="pokedex-scanline"></div>
          </div>
        </div>
        <div class="pokedex-screen-caption">
          <div class="pokedex-name">${escapeHTML(data.species)}</div>
        </div>
      </div>
      <div class="pokedex-speaker">
        <span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
    </div>`;

  const rightBody = page === "entry"
    ? `
        <div class="pokedex-info-header">
          <div class="pokedex-info-title">${escapeHTML(data.name)}</div>
          <div class="pokedex-types">${typesHTML}</div>
        </div>
        <div class="pokedex-info-body">
          <div class="pokedex-entry-label">${loc("POKEDEX.EntryLabel")}</div>
          <div class="pokedex-entry">${escapeHTML(data.entry)}</div>
        </div>`
    : `
        <div class="pokedex-info-header">
          <div class="pokedex-info-title">${escapeHTML(data.name)}</div>
          <div class="pokedex-page-subtitle">${loc("POKEDEX.MovesLabel")}</div>
        </div>
        <div class="pokedex-info-body pokedex-moves-body">
          ${
            data.learnset.length === 0
              ? `<div class="pokedex-empty">${loc("POKEDEX.NoMoves")}</div>`
              : data.learnset.map((g) => `
                <div class="pokedex-move-group">
                  <div class="pokedex-move-rank">${escapeHTML(g.label)}</div>
                  <div class="pokedex-move-list">
                    ${g.moves.map((m) => `<span class="pokedex-move-chip">${escapeHTML(m)}</span>`).join("")}
                  </div>
                </div>`).join("")
          }
        </div>`;

  const pageDots = `
    <div class="pokedex-page-dots">
      <span class="${page === "entry" ? "active" : ""}"></span>
      <span class="${page === "moves" ? "active" : ""}"></span>
    </div>`;

  const leftArrowEnabled = (page === "moves") || state?.fromCatalog;
  const rightArrowEnabled = (page === "entry");

  const rightHTML = `
    <div class="pokedex-shell pokedex-shell-right">
      <div class="pokedex-info-screen">
        ${rightBody}
      </div>
      ${pageDots}
      <div class="pokedex-nav-row">
        <button type="button" class="pokedex-nav-btn ${leftArrowEnabled ? "" : "disabled"}" data-action="nav-left" ${leftArrowEnabled ? "" : "disabled"}>
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="pokedex-dpad">
          <div class="pokedex-dpad-v"></div>
          <div class="pokedex-dpad-h"></div>
        </div>
        <button type="button" class="pokedex-nav-btn ${rightArrowEnabled ? "" : "disabled"}" data-action="nav-right" ${rightArrowEnabled ? "" : "disabled"}>
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
      <div class="pokedex-buttons-row">
        <button type="button" class="pokedex-btn pokedex-btn-red" data-action="close" title="${loc("POKEDEX.Close")}"></button>
        <button type="button" class="pokedex-btn pokedex-btn-blue" data-action="close"></button>
      </div>
    </div>`;

  return `
    <div class="pokedex-device single-mode" role="dialog" aria-label="Pokédex"
         style="--primary-color: ${data.primaryColor}; --secondary-color: ${data.secondaryColor};">
      ${leftHTML}
      <div class="pokedex-hinge"></div>
      ${rightHTML}
    </div>`;
}

async function _renderCatalog(trainer) {
  const [list, _resolved] = await Promise.all([getSpeciesIndex(), Promise.resolve(trainer)]);
  const seenSet = new Set(getSeenList(trainer));
  const caughtSet = new Set(getCaughtList(trainer));

  const totalSeen = seenSet.size;
  const totalCaught = caughtSet.size;
  const total = list.length;

  const cardsHTML = list.map((entry, idx) => {
    const seen = seenSet.has(entry.key);
    const caught = caughtSet.has(entry.key);
    const locked = !seen && !caught;
    const primaryColor = getTypeColor(entry.primary);
    const delay = Math.min(idx * 12, 900);

    return `
      <button type="button"
              class="pokedex-card ${locked ? "locked" : ""} ${caught ? "caught" : ""}"
              data-action="open-species"
              data-species-key="${escapeHTML(entry.key)}"
              ${locked ? "aria-disabled='true'" : ""}
              style="--card-color: ${primaryColor}; --delay: ${delay}ms;"
              title="${locked ? loc("POKEDEX.LockedEntry") : escapeHTML(entry.name)}">
        <div class="pokedex-card-portrait">
          <img src="${entry.img || "icons/svg/mystery-man.svg"}"
               alt="${escapeHTML(entry.name)}"
               class="${locked ? "silhouette" : ""}"
               draggable="false" />
          ${caught ? `<span class="pokedex-card-badge" title="${loc("POKEDEX.CaughtBadge")}"><i class="fa-solid fa-circle-check"></i></span>` : ""}
        </div>
        <div class="pokedex-card-name">${locked ? "???" : escapeHTML(entry.name)}</div>
      </button>`;
  }).join("");

  return `
    <div class="pokedex-device catalog-mode" role="dialog" aria-label="Pokédex Catalog">
      <div class="pokedex-catalog-header">
        <div class="pokedex-catalog-title">
          <i class="fa-solid fa-book-atlas"></i>
          <span>${loc("POKEDEX.CatalogTitle")}</span>
        </div>
        <div class="pokedex-catalog-stats">
          <span class="stat seen"><i class="fa-solid fa-eye"></i> ${totalSeen}</span>
          <span class="stat caught"><i class="fa-solid fa-circle-check"></i> ${totalCaught}</span>
          <span class="stat total"><i class="fa-solid fa-hashtag"></i> ${total}</span>
        </div>
        <button type="button" class="pokedex-catalog-close" data-action="close" title="${loc("POKEDEX.Close")}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="pokedex-catalog-grid">
        ${cardsHTML || `<div class="pokedex-empty">${loc("POKEDEX.EmptyCatalog")}</div>`}
      </div>
    </div>`;
}

/* ============================================================
 *  Event handlers
 * ============================================================ */

function _attachHandlers() {
  if (!overlay) return;
  overlay.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", _onAction);
  });
}

async function _onAction(ev) {
  const action = ev.currentTarget.dataset.action;
  ev.preventDefault();
  ev.stopPropagation();
  if (action === "close") {
    closePokedex();
  } else if (action === "nav-left") {
    _nav("left");
  } else if (action === "nav-right") {
    _nav("right");
  } else if (action === "open-species") {
    const key = ev.currentTarget.dataset.speciesKey;
    if (ev.currentTarget.classList.contains("locked")) return;
    const actor = await getSpeciesActorByKey(key);
    if (!actor) {
      ui.notifications.warn(loc("POKEDEX.SpeciesMissing"));
      return;
    }
    state = {
      mode: "single-entry",
      actor,
      trainer: state?.trainer ?? getCurrentUserTrainer(),
      fromCatalog: true
    };
    _render();
  }
}
