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
import {
  getSpeciesActorById,
  getSpeciesActorByKey,
  getSpeciesIndex,
  getVariantsForActor
} from "./species.mjs";

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
 *   fromCatalog: boolean,        // single mode opened from catalog
 *   variants: Array | null,      // all forms sharing this pokédex number
 *   variantIndex: number         // which variant `actor` corresponds to
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
    fromCatalog: false,
    variants: null,
    variantIndex: 0
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
    fromCatalog: false,
    variants: null,
    variantIndex: 0
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
  // Single-mode: make sure we know about any alternate forms so the form
  // cycler can appear. If the pokédex was opened from a targeted token
  // (not from the catalog), we haven't populated variants yet.
  if ((state.mode === "single-entry" || state.mode === "single-moves")
      && state.actor
      && state.variants == null) {
    try {
      const variants = await getVariantsForActor(state.actor);
      if (variants.length > 0) {
        const idx = variants.findIndex((v) => v.id === state.actor.id);
        state.variants = variants;
        state.variantIndex = idx >= 0 ? idx : 0;
      } else {
        state.variants = [];
        state.variantIndex = 0;
      }
    } catch (err) {
      console.warn(MODULE_ID, "variant lookup failed", err);
      state.variants = [];
      state.variantIndex = 0;
    }
  }
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

  const hasForms = Array.isArray(state?.variants) && state.variants.length > 1;
  const formSwitcherHTML = hasForms ? `
    <div class="pokedex-form-switcher" role="group" aria-label="${loc("POKEDEX.FormSwitcher")}">
      <button type="button"
              class="pokedex-form-arrow"
              data-action="form-prev"
              title="${loc("POKEDEX.PrevForm")}">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <span class="pokedex-form-label">
        ${escapeHTML(loc("POKEDEX.FormOf", {
          current: String((state.variantIndex ?? 0) + 1),
          total: String(state.variants.length)
        }))}
      </span>
      <button type="button"
              class="pokedex-form-arrow"
              data-action="form-next"
              title="${loc("POKEDEX.NextForm")}">
        <i class="fa-solid fa-chevron-right"></i>
      </button>
    </div>` : "";

  const rightHTML = `
    <div class="pokedex-shell pokedex-shell-right${hasForms ? " has-forms" : ""}">
      <div class="pokedex-info-screen">
        ${formSwitcherHTML}
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

  const listHTML = list.map((entry) => {
    const seen = seenSet.has(entry.key);
    const caught = caughtSet.has(entry.key);
    const locked = !seen && !caught;
    const numLabel = entry.pokedexNumber
      ? `No. ${String(entry.pokedexNumber).padStart(3, "0")}`
      : "No. ???";
    const displayName = locked ? "?????" : entry.name;
    const portraitSrc = entry.img || "icons/svg/mystery-man.svg";
    const classes = [
      "catalog-list-item",
      locked ? "locked" : "",
      caught ? "caught" : "",
      seen && !caught ? "seen" : ""
    ].filter(Boolean).join(" ");

    return `
      <button type="button"
              class="${classes}"
              data-action="open-species"
              data-species-key="${escapeHTML(entry.key)}"
              data-preview-img="${escapeHTML(portraitSrc)}"
              data-preview-name="${escapeHTML(entry.name)}"
              data-preview-locked="${locked ? "1" : "0"}"
              ${locked ? "aria-disabled='true'" : ""}
              title="${locked ? loc("POKEDEX.LockedEntry") : escapeHTML(entry.name)}">
        <img class="catalog-list-portrait ${locked ? "silhouette" : ""}"
             src="${portraitSrc}"
             alt="${escapeHTML(entry.name)}"
             draggable="false" />
        <span class="catalog-list-num">${numLabel}</span>
        <span class="catalog-list-name">${escapeHTML(displayName)}</span>
        <span class="catalog-list-indicator" aria-hidden="true"></span>
      </button>`;
  }).join("");

  const primaryColor = getTypeColor("normal");

  const leftShell = `
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
            <img class="pokedex-portrait catalog-preview-portrait"
                 src="icons/svg/mystery-man.svg"
                 alt=""
                 draggable="false"
                 data-catalog-preview-img />
            <div class="pokedex-scanline"></div>
          </div>
        </div>
        <div class="pokedex-screen-caption">
          <div class="pokedex-name" data-catalog-preview-name>${loc("POKEDEX.HoverPrompt")}</div>
        </div>
      </div>
      <div class="pokedex-speaker">
        <span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
    </div>`;

  const rightShell = `
    <div class="pokedex-shell pokedex-shell-right catalog-right-shell">
      <div class="pokedex-info-screen catalog-info-screen">
        <div class="catalog-header-bar">
          <div class="catalog-header-title">
            <span class="catalog-pokeball-ico"></span>
            <span>${loc("POKEDEX.CatalogTitle")}</span>
          </div>
          <div class="catalog-header-stats">
            <span class="catalog-stat caught" title="${loc("POKEDEX.CatalogCaught")}">
              <span class="catalog-dot-caught"></span> ${totalCaught}
            </span>
            <span class="catalog-stat seen" title="${loc("POKEDEX.CatalogSeen")}">
              <span class="catalog-dot-seen"></span> ${totalSeen}
            </span>
          </div>
        </div>
        <div class="catalog-sort-bar">
          <span>${loc("POKEDEX.ByNumber")}</span>
          <span class="catalog-sort-count">${total}</span>
        </div>
        <div class="catalog-list">
          ${listHTML || `<div class="catalog-empty">${loc("POKEDEX.EmptyCatalog")}</div>`}
        </div>
      </div>
      <div class="pokedex-buttons-row">
        <button type="button" class="pokedex-btn pokedex-btn-red" data-action="close" title="${loc("POKEDEX.Close")}"></button>
        <button type="button" class="pokedex-btn pokedex-btn-blue" data-action="close"></button>
      </div>
    </div>`;

  return `
    <div class="pokedex-device catalog-mode" role="dialog" aria-label="Pokédex Catalog"
         style="--primary-color: ${primaryColor}; --secondary-color: ${primaryColor};">
      ${leftShell}
      <div class="pokedex-hinge"></div>
      ${rightShell}
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
  overlay.querySelectorAll(".catalog-list-item").forEach((el) => {
    el.addEventListener("mouseenter", _onCatalogPreview);
    el.addEventListener("focus", _onCatalogPreview);
  });
}

function _onCatalogPreview(ev) {
  if (!overlay) return;
  const el = ev.currentTarget;
  const img = el.dataset.previewImg || "icons/svg/mystery-man.svg";
  const name = el.dataset.previewName || "";
  const locked = el.dataset.previewLocked === "1";
  const previewImg = overlay.querySelector("[data-catalog-preview-img]");
  const previewName = overlay.querySelector("[data-catalog-preview-name]");
  if (previewImg) {
    previewImg.src = img;
    previewImg.classList.toggle("silhouette", locked);
    previewImg.alt = locked ? "???" : name;
  }
  if (previewName) {
    previewName.textContent = locked ? "???" : name;
  }
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
    // Use the canonical catalog entry for this species so we can carry its
    // full variants list into the single view (base form + Mega + regional
    // forms etc., enabling the form cycler on the right shell).
    const list = await getSpeciesIndex();
    const catalogEntry = list.find((e) => e.key === key);
    const variants = catalogEntry?.variants ?? [];
    const firstVariant = variants[0];
    const actor = firstVariant
      ? await getSpeciesActorById(firstVariant.id)
      : await getSpeciesActorByKey(key);
    if (!actor) {
      ui.notifications.warn(loc("POKEDEX.SpeciesMissing"));
      return;
    }
    state = {
      mode: "single-entry",
      actor,
      trainer: state?.trainer ?? getCurrentUserTrainer(),
      fromCatalog: true,
      variants,
      variantIndex: 0
    };
    _render();
  } else if (action === "form-prev" || action === "form-next") {
    if (!state?.variants || state.variants.length < 2) return;
    const n = state.variants.length;
    const delta = action === "form-next" ? 1 : -1;
    const next = (((state.variantIndex ?? 0) + delta) % n + n) % n;
    const variant = state.variants[next];
    if (!variant) return;
    const actor = await getSpeciesActorById(variant.id);
    if (!actor) {
      ui.notifications.warn(loc("POKEDEX.SpeciesMissing"));
      return;
    }
    state.actor = actor;
    state.variantIndex = next;
    _render();
  }
}
