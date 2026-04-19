/**
 * Poké Role - Pokédex module entry point.
 * See scripts/pokedex-app.mjs for the overlay, scripts/state.mjs for flag
 * management, scripts/species.mjs for compendium access.
 */

import { MODULE_ID, loc } from "./constants.mjs";
import {
  closePokedex,
  openCatalogPokedex,
  openSinglePokedex,
  refreshPokedexIfOpen
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
/*  Capture + evolution + catalog refresh   */
/* ---------------------------------------- */

Hooks.on("updateActor", async (actor, changes, _options, _userId) => {
  // ── Pokémon updates ──────────────────────────────────────────
  if (actor?.type === "pokemon") {
    // Evolution: the pok-role evolve() pipeline writes the new
    // `system.species` (and name, stats, items, etc.) on the existing actor
    // in a single update. Treat that like a capture for the trainer that
    // owns this Pokémon so the new species appears in their Pokédex.
    const newSpecies = foundry.utils.getProperty(changes, "system.species");
    if (newSpecies) {
      const caughtById = actor.system?.caughtBy ?? "";
      if (caughtById) {
        const evolver = game.actors?.get(caughtById);
        if (evolver && evolver.type === "trainer" && isPrimaryOwner(evolver)) {
          try {
            await markCaught(evolver, actor);
          } catch (err) {
            console.error(`${MODULE_ID} | evolution markCaught failed:`, err);
          }
        }
      }
    }

    // Initial capture: caughtBy was set for the first time.
    const newCaughtBy = foundry.utils.getProperty(changes, "system.caughtBy");
    if (newCaughtBy) {
      const trainer = game.actors?.get(newCaughtBy);
      if (trainer && trainer.type === "trainer") {
        if (isPrimaryOwner(trainer)) {
          try {
            await markCaught(trainer, actor);
          } catch (err) {
            console.error(`${MODULE_ID} | markCaught failed:`, err);
          }
        }
        if (trainer.testUserPermission?.(game.user, "OWNER")) {
          openSinglePokedex(actor, { markSeenOnOpen: false });
        }
      }
    }
    return;
  }

  // ── Trainer updates: refresh an open Pokédex ─────────────────
  // When the seen/caught flag arrays change (capture, evolution, manual
  // tweak), any client currently viewing the Pokédex for this trainer
  // should re-render so counters/silhouettes reflect the new state.
  if (actor?.type === "trainer") {
    const caughtChanged = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.caught`);
    const seenChanged = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.seen`);
    const formsChanged = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.forms`);
    if (caughtChanged || seenChanged || formsChanged) {
      refreshPokedexIfOpen(actor);
    }
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
