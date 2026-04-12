# ProtonDB for Millennium

A [Millennium](https://github.com/SteamClientHomebrew/Millennium) plugin that shows [ProtonDB](https://www.protondb.com) compatibility ratings directly on Steam store pages - no browser extension required.

![License](https://img.shields.io/github/license/unicxrn/protondb-millennium)
![Version](https://img.shields.io/github/v/release/unicxrn/protondb-millennium?style=flat)

![Screenshot](https://raw.githubusercontent.com/unicxrn/protondb-millennium/main/screenshot.png)

---

## What it does

When you open any game's store page in the Steam client, a **ProtonDB Compatibility** section appears above the buy/download cards - styled to match Steam's native UI sections like Steam Deck Compatibility.

It shows:
- **Tier** (Platinum / Gold / Silver / Bronze / Borked / Native) with a color-coded icon
- **Score ring** - community percentage score
- **Trending tier** - whether the game's rating is improving
- **Confidence indicator** - colored dot showing how well-supported the rating is (green = high, yellow = medium, red = low)
- **Report freshness** - how recently the data was last updated
- **Linux native badge** - detected from the store page's platform icons
- **No reports state** - a subtle prompt to submit a report for games with no ProtonDB data
- **Borked warning** - distinct red-tinted row for games confirmed not to run under Proton

### Navigation support
Updates automatically as you browse between store pages - no reload needed.

### Performance
Results are cached in `localStorage` for 1 hour and survive Steam restarts, so repeat visits are instant. DLC pages are silently skipped.

---

## Installation

### Via Millennium plugin manager
Once listed, install directly from the **Plugins** tab in Steam.

### From a release (no build step)
1. Install [Millennium](https://github.com/SteamClientHomebrew/Millennium)
2. Download the latest `protondb-vX.X.X.zip` from the [Releases](https://github.com/unicxrn/protondb-millennium/releases) page
3. Extract into your plugins folder so the path is `~/.local/share/millennium/plugins/protondb/`
4. Enable **ProtonDB** in Steam → Settings → Millennium → Plugins

### From source
1. Install [Millennium](https://github.com/SteamClientHomebrew/Millennium)
2. Clone into your plugins folder:
   ```sh
   git clone https://github.com/unicxrn/protondb-millennium ~/.local/share/millennium/plugins/protondb
   ```
3. Build:
   ```sh
   cd ~/.local/share/millennium/plugins/protondb
   pnpm install && pnpm run build
   ```
4. Enable **ProtonDB** in Steam → Settings → Millennium → Plugins

---

## Building from source

Requires [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io).

```sh
pnpm install

pnpm run build   # production build
pnpm run dev     # watch mode for development
```

Output is written to `.millennium/Dist/`.

---

## How it works

- **Backend** - a Lua module (`backend/main.lua`) fetches data from the [ProtonDB API](https://www.protondb.com/api/v1/reports/summaries/<appId>.json) via Millennium's HTTP client. This avoids CORS restrictions that would block a direct browser fetch from Steam's store domain.
- **Frontend** - a webkit script (`webkit/index.tsx`) is automatically injected into Steam store page browser contexts by Millennium. It calls the Lua backend via IPC, builds the widget as native DOM elements, and injects it above the purchase cards.

---

## License

MIT - see [LICENSE](LICENSE)

---

## Credits

Data provided by [ProtonDB](https://www.protondb.com). Built with [Millennium](https://github.com/SteamClientHomebrew/Millennium).
