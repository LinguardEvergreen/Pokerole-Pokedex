/**
 * Poké Role - Pokédex module entry point.
 * See scripts/pokedex-app.mjs for the overlay, scripts/state.mjs for flag
 * management, scripts/species.mjs for compendium access.
 */

import { MODULE_ID, loc } from "./constants.mjs";
import {
  closePokedex,
  openCatalogPokedex,
  openSinglePokedex
} from "./pokedex-app.mjs";
import { isPrimaryOwner, markCaught } from "./state.mjs";

/* ---------------------------------------- */
/*  Target helpers                          */
/* ---------------------------------------- */

function getTargetedPokemonActor() {
  const targets = Array.from(game.user?.targets ?? []);
  for (const token of targets) {
    const actor = token?.actor;
    if (!actor) continue;
    if (actor.type === "pokemon") return actor;
  }
  return targets[0]?.actor ?? null;
}

/* ---------------------------------------- */
/*  Scene control tool (Tokens > Pokédex)   */
/* ---------------------------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  const tokens = controls?.tokens;
  if (!tokens?.tools) return;

  const weatherTool = tokens.tools["pokrole-set-weather"];
  const weatherOrder = Number.isFinite(weatherTool?.order) ? weatherTool.order : null;
  const nextOrder = weatherOrder !== null
    ? weatherOrder + 0.5
    : Object.keys(tokens.tools).length;

  tokens.tools[`${MODULE_ID}-open`] = {
    name: `${MODULE_ID}-open`,
    title: "POKEDEX.ButtonTooltip",
    icon: "fa-solid fa-book-atlas",
    order: nextOrder,
    button: true,
    visible: true,
    onChange: () => {
      const actor = getTargetedPokemonActor();
      if (!actor) {
        ui.notifications.warn(loc("POKEDEX.NoTarget"));
        return;
      }
      openSinglePokedex(actor, { markSeenOnOpen: true });
    }
  };
});

/* ---------------------------------------- */
/*  Capture auto-open + caught tracking     */
/* ---------------------------------------- */

Hooks.on("updateActor", async (actor, changes, _options, _userId) => {
  if (actor?.type !== "pokemon") return;
  const newCaughtBy = foundry.utils.getProperty(changes, "system.caughtBy");
  if (!newCaughtBy) return;

  const trainer = game.actors?.get(newCaughtBy);
  if (!trainer || trainer.type !== "trainer") return;

  // Single writer does the flag write to avoid races across clients.
  if (isPrimaryOwner(trainer)) {
    try {
      await markCaught(trainer, actor);
    } catch (err) {
      console.error(`${MODULE_ID} | markCaught failed:`, err);
    }
  }

  // Any user who owns the trainer sees the Pokédex pop up.
  if (trainer.testUserPermission?.(game.user, "OWNER")) {
    openSinglePokedex(actor, { markSeenOnOpen: false });
  }
});

/* ---------------------------------------- */
/*  Trainer sheet – catalog open button     */
/* ---------------------------------------- */

function injectCatalogButton(app, rootEl) {
  const actor = app.actor;
  if (actor?.type !== "trainer") return;
  const field = rootEl.querySelector(".trainer-pokedex-field");
  if (!field || field.querySelector(".pokerole-pokedex-open-catalog")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pokerole-pokedex-open-catalog";
  btn.innerHTML = `<i class="fa-solid fa-book-atlas"></i>`;
  btn.title = loc("POKEDEX.OpenCatalog");
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    openCatalogPokedex(actor);
  });

  const pair = field.querySelector(".pair-input");
  (pair ?? field).appendChild(btn);
}

Hooks.on("renderActorSheet", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  injectCatalogButton(app, root);
});

// v13 ApplicationV2 sheets may also fire renderActorSheetV2
Hooks.on("renderActorSheetV2", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  injectCatalogButton(app, root);
});

/* ---------------------------------------- */
/*  Ready                                   */
/* ---------------------------------------- */

Hooks.once("ready", () => {
  // Expose a small API on game for macros / other modules.
  game[MODULE_ID] = {
    openSingle: (actor) => openSinglePokedex(actor, { markSeenOnOpen: true }),
    openCatalog: (trainer) => openCatalogPokedex(trainer),
    close: () => closePokedex()
  };
  console.log(`${MODULE_ID} | ready`);
});
