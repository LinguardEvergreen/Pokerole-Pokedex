# Pokerole-Pokedex

<p align="center">
  <strong>Foundry VTT v13 module for the Pok-Role-Module system</strong><br>
  Animated clamshell Pokédex overlay, per-trainer seen / caught tracking, full species catalog with form cycler, and a capture-driven unlock flow wired directly into the PokeRole 3.0 data pipeline.
</p>

<p align="center">
  <img alt="Foundry VTT v13" src="https://img.shields.io/badge/Foundry-v13-f36f24?style=for-the-badge">
  <img alt="Module version 1.0.0" src="https://img.shields.io/badge/Module-1.0.0-2d7ff9?style=for-the-badge">
  <img alt="Requires Pok-Role-Module" src="https://img.shields.io/badge/System-pok--role--system-d94b3d?style=for-the-badge">
  <img alt="Languages EN and IT" src="https://img.shields.io/badge/Languages-EN%20%7C%20IT-00a7c4?style=for-the-badge">
</p>

---

## Overview

`Pokerole-Pokedex` is a Foundry VTT v13 **module** (not a system) that layers a full Pokédex experience on top of [Pok-Role-Module](https://github.com/RiccardoMont1/Pok-Role-Module).

It ships with:

- an animated clamshell Pokédex overlay with two pages (entry + learnset)
- a scene-controls button wired into the Tokens toolbar
- a trainer-sheet button that opens the full species catalog
- per-trainer **seen / caught / forms** tracking stored as actor flags
- automatic capture + evolution detection via the system's data pipeline
- a form cycler for alternate species (Mega, regional variants, Gigantamax, etc.) gated by what the trainer has actually unlocked
- a moves page locked behind capture — scan first, then catch

## Highlights

| Area | What is already implemented |
| --- | --- |
| Overlay | Animated clamshell device, two-page flow (entry + moves), page dots, red/blue close buttons, ESC / backdrop dismiss |
| Single view | Species portrait, primary + secondary type chips with system type colours, cleaned-up biography, learnset grouped by rank |
| Catalog view | Full National-Dex list (compendium-driven) with silhouettes for locked entries, hover preview on the left shell, caught / seen counters |
| Form cycler | Right-shell pill with prev / next arrows for alternate forms; variants the trainer hasn't unlocked stay hidden |
| Seen / Caught log | Per-trainer flags (`seen`, `caught`, `forms`) with mirrored `system.pokedex.seen` / `system.pokedex.caught` counters |
| Capture hook | Fires on `system.caughtBy` being set; auto-marks species + variant as caught and auto-opens the overlay on the owning client |
| Evolution hook | Fires on `system.species` change; marks the new species as caught on the evolver so the catalog updates live |
| Moves gate | Learnset page is locked until the active trainer has caught that species |
| Localization | English + Italian |
| Primary-owner guard | Write-side hooks de-duplicate across clients so the flag update runs exactly once |

## How It Works

### Two ways to open the Pokédex

1. **Single-view** — Target a Pokémon token (press `T`) and click the **Pokédex** button in the Tokens toolbar. Opens straight to that Pokémon's entry.
2. **Catalog** — Open your trainer's sheet and click the Pokédex icon next to the Pokédex counter field. Browse all species, click a row to drill in.

### Seen vs Caught

The overlay treats the two states distinctly, Pokédex-style:

- **Seen**: you targeted the token and opened its entry. Silhouette unlocks, name reveals, bio and types become visible.
- **Caught**: the Pok-Role capture flow set `system.caughtBy` to your trainer. Full colour portrait, name badge, and — most importantly — the **moves page unlocks**.

Trying to open the moves page for a species you've only seen leaves the right arrow disabled and the second page-dot hidden.

### Form cycler

Species that have multiple compendium entries sharing the same National-Dex number (Mega, Alolan, Galarian, Hisuian, Paldean, Gigantamax, etc.) are grouped into a single catalog row. The single view exposes a prev / next pill on the right shell to cycle between them.

Alternate forms only appear in the cycler after the trainer has actually seen or caught that specific variant. The base form is always visible — everything else is hidden until unlocked, so browsing the cycler can't spoil forms the player hasn't earned yet.

### Live refresh

When any of the trainer's `seen` / `caught` / `forms` flags change, clients currently displaying that trainer's Pokédex re-render automatically (no need to close and reopen the overlay).

## Installation

### Manifest URL

Use this in Foundry's **Install Module** dialog:

```text
https://github.com/LinguardEvergreen/Pokerole-Pokedex/releases/latest/download/module.json
```

### Direct download

```text
https://github.com/LinguardEvergreen/Pokerole-Pokedex/releases/latest/download/module.zip
```

### Local development install

1. Clone the repository into your Foundry `Data/modules/` directory.
2. Ensure the folder name matches the module id in [module.json](module.json): `pokerole-pokedex`.
3. Launch Foundry and enable **Poké Role - Pokédex** in your world's module settings.

### Requirements

- Foundry VTT **v13** (verified on build 351)
- [Pok-Role-Module](https://github.com/RiccardoMont1/Pok-Role-Module) system (`pok-role-system`) active on the world

## Usage

### Opening the single-view

1. Target a Pokémon token with `T`.
2. Click the **Pokédex** button in the left Tokens toolbar.
3. Right arrow → learnset page (only if the species is caught).
4. Left arrow → back to the entry, or back to the catalog if you opened it from there.
5. Close with the red / blue button, `Esc`, or by clicking outside the device.

### Opening the catalog

1. Open your trainer's actor sheet.
2. Click the Pokédex icon next to the Pokédex counter.
3. Hover a row to preview on the left shell, click to drill in.

### Macros / programmatic API

After `ready`, a small API is exposed on `game.pokerole-pokedex`:

```js
// Open the single-view for an actor (marks it as seen)
game["pokerole-pokedex"].openSingle(actor);

// Open the catalog for a specific trainer
game["pokerole-pokedex"].openCatalog(trainer);

// Close whatever is currently open
game["pokerole-pokedex"].close();
```

## Data Model

Tracking data is stored as flags on each **trainer** actor:

| Flag | Contents |
| --- | --- |
| `flags.pokerole-pokedex.seen` | Array of species keys the trainer has inspected |
| `flags.pokerole-pokedex.caught` | Array of species keys the trainer has captured |
| `flags.pokerole-pokedex.forms` | Array of compendium entry ids for specific variants the trainer has unlocked (Mega, regional forms, Gmax) |
| `system.pokedex.seen` | Count mirror of the `seen` flag, for display on sheet widgets |
| `system.pokedex.caught` | Count mirror of the `caught` flag |

Species keys are the normalized, lower-cased species name (`speciesKey()` in `scripts/constants.mjs`) so they match across world actors, tokens, and compendium entries.

## Repository Layout

| Path | Purpose |
| --- | --- |
| [module.json](module.json) | Foundry module manifest |
| [scripts/main.mjs](scripts/main.mjs) | entry point: scene-control button, capture / evolution hooks, trainer-sheet injection, ready-time API |
| [scripts/pokedex-app.mjs](scripts/pokedex-app.mjs) | overlay lifecycle, single / catalog rendering, page flow, form cycler |
| [scripts/species.mjs](scripts/species.mjs) | compendium catalog loader, National-Dex number parsing, form-variant grouping |
| [scripts/state.mjs](scripts/state.mjs) | trainer resolution, primary-owner guard, seen / caught / forms flag management |
| [scripts/constants.mjs](scripts/constants.mjs) | module ids, type colours / icons, localization helpers, biography cleanup |
| [styles/pokedex.css](styles/pokedex.css) | clamshell device styling, scanlines, catalog list, form cycler pill |
| [lang/en.json](lang/en.json) | English strings |
| [lang/it.json](lang/it.json) | Italian strings |

## Known Boundaries

This README is intentionally honest about what is still incomplete.

Current boundaries include:

- the catalog reads straight from the `pokemon-actors` compendium shipped by Pok-Role-Module; entries without a `Corebook Pokedex import #NNN.` biography tag are dropped from the catalog
- there's no per-variant differentiation for species whose forms share a compendium `species` key and name (the cycler uses name + compendium id to disambiguate — forms that share both collapse into a single entry)
- pre-1.0 campaigns where the starter was never captured via the Pok-Role flow (no `system.caughtBy`) won't auto-mark that starter as caught; evolving it later, or re-running the capture flow, triggers the auto-log
- the project does not ship an automated test suite yet

## Credits

Built to complement [Pok-Role-Module](https://github.com/RiccardoMont1/Pok-Role-Module) by **RiccardoMont1** — all system data, compendia, and sprite pipelines the module reads from are provided by that system.

Also relies on:

- Foundry VTT v13 application / hooks API
- Font Awesome icons for the scene-control button and nav arrows

## License / project state

This repository is maintained as an active companion module for the Pok-Role system.

If you want to contribute or open issues:

- repo: `https://github.com/LinguardEvergreen/Pokerole-Pokedex`
- issues: `https://github.com/LinguardEvergreen/Pokerole-Pokedex/issues`
