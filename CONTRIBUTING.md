# Contributing

Thanks for looking. This file covers how the plugin is put together, how to
build it, and how to run its tests. The [README](README.md) covers what it
does and how to install it.

## Layout

| Path | What lives there |
|---|---|
| `backend/` | Lua. Fetches ProtonDB and AreWeAntiCheatYet, caches to disk, holds the settings store and the `[patches]` entry. |
| `frontend/` | React, running in Steam's own UI. The settings panel, its controls, and the library page watcher. |
| `webview/` | Plain TypeScript, injected into Steam's store browser contexts. The store panel and list badges. |
| `shared/` | Vocabulary, widget builders and the pure decision logic the other three agree on. |
| `tests/` | vitest for TypeScript, a luajit harness for the backend. |
| `types/` | Lua type stubs for Millennium's C modules, for editor completion. |

Each of `frontend/`, `webview/` and the root has its own `tsconfig.json`; the
root one is only their shared base, and `tsconfig.check.json` covers `tests/`.
`pnpm run typecheck` runs all three.

## Building from source

Requires [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io). The plugin is compiled by [starlight](https://docs.steambrew.app/plugins/), Millennium's plugin compiler, driven by `millennium.toml`.

```sh
pnpm install

pnpm run build   # pack into a .star
pnpm run dev     # watch mode: rebuilds and hot-reloads the plugin in Steam
```

`pnpm run build` writes `<plugin id>.star` into your Millennium plugins folder (`output_path = "auto"`). `pnpm run dev` additionally restarts the backend and reloads the Steam UI on save, so changes do not need a Steam restart.

## Tests

```sh
pnpm test        # TypeScript (vitest) and Lua (luajit) suites
pnpm run test:ts # TypeScript only
pnpm run test:lua
```

`pnpm test` typechecks all three TypeScript projects first, then runs both suites. The Lua suite stubs Millennium's C modules so the backend's cache and failure paths can run outside Steam. Badge placement is tested against markup copied from live Steam pages (`tests/badge-placement.test.ts`), because a wrong guess there fails silently - the rows are found and then quietly skipped. The store panel's own injection is still verified in the client rather than unit tested.

## How it works

- **Backend** - Lua modules under `backend/` fetch from the [ProtonDB API](https://www.protondb.com) (`/api/v1/reports/summaries/<appId>.json`) and the [AreWeAntiCheatYet](https://github.com/AreWeAntiCheatYet/AreWeAntiCheatYet) dataset via Millennium's HTTP client, avoiding the CORS restrictions that would block a direct browser fetch from Steam's store domain. Both sources resolve independently and merge into a single versioned payload, so one being down never hides the other.
- **Frontend** - a webview preload script (`webview/preload.ts`) is automatically injected into Steam store page browser contexts by Millennium. It calls the Lua backend via IPC, builds the widget as native DOM elements, and injects it above the purchase cards.
- **Library** - `frontend/library.tsx` watches the client window for a game page and inserts the panel above the play bar. It deliberately patches no route and wraps no Steam component; an earlier version wrapped the library route's component and React remounted the whole page on every pass, resetting scroll. A `[patches]` entry in `backend/main.lua` also offers the rating to Steam's own stats row as a compact stat, and the observer stands down whenever that appears - on current builds it does not, so the panel is what you see.
- **Shared** - tier and anticheat vocabulary, the widget builders, and the pure decision logic in `shared/widget-model.ts` live in `shared/`, so every surface describes compatibility the same way.
- **Lists** - Millennium's Lua `http` is synchronous and blocks the plugin thread, and ProtonDB has no bulk endpoint, so a list can never become one request per row. `webview/lists.ts` decorates from the disk cache on first paint - a single cache-only IPC call covers the whole visible page - then fetches on demand for whatever the user actually scrolls into view, one request at a time, capped at 40 apps per page view. Two further problems come from Steam's markup rather than from ProtonDB:
  - **Finding the rows.** Every surface uses a different shape, and Steam is migrating the store to a single-page app whose rows carry no appid attribute at all - the wishlist and the search box's dropdown are already there. Those rows are found by following `/app/<id>/` links, but only where another game's link sits within a few levels, which is what separates a list from a mention in prose. Rows Steam marks `ds_no_flags` - promo banners and nav buttons, which carry an appid without being games - are skipped, as is any link to the page's own game.
  - **Placing the badge.** It goes into the first text slot the row offers. A store capsule has none, so it takes a corner overlay on the artwork instead; a row that reads as a line of text - a wishlist title, a search dropdown result - takes it inline after the label.

## Releasing

The release workflow fires on a `v*` tag: it runs both suites, packs a release
`.star` (unsigned - nothing in the toolchain signs it yet), verifies the
archive with `starlight verify`, renames it after the tag and attaches it to a
GitHub release. Pushing to `main` separately triggers a workflow that squashes
history to a single commit, so `main` carries no development history by
design.
