# ProtonDB for Millennium

A [Millennium](https://github.com/SteamClientHomebrew/Millennium) plugin that shows [ProtonDB](https://www.protondb.com) compatibility ratings throughout the Steam client - store pages, library pages and game lists - with no browser extension required.

![License](https://img.shields.io/github/license/unicxrn/protondb-millennium)
![Version](https://img.shields.io/github/v/release/unicxrn/protondb-millennium?style=flat)

![The ProtonDB compatibility panel on a Steam store page](https://raw.githubusercontent.com/unicxrn/protondb-millennium/main/screenshot.png)

---

## What it does

When you open any game's store page in the Steam client, a **ProtonDB Compatibility** section appears above the buy/download cards - styled to match Steam's native UI sections like Steam Deck Compatibility. The same section appears on a game's **library** page, above the play bar.

![The same panel on a game's library page, above the play bar](https://raw.githubusercontent.com/unicxrn/protondb-millennium/main/screenshot-library.png)

**Lists** get a small tier badge on each game, so you don't have to open a row to see its rating: search results and the search box's autocomplete, the store front's carousels and offer capsules, category rows, the wishlist, and a game page's own DLC table. Rows with a text slot carry the badge inline beside the name or platform icons; a bare artwork capsule gets it as a corner overlay. A game with no rating stays blank, so a missing badge never reads as a bad one, and a sale or bundle capsule never takes one at all.

![Tier badges on the store front's offer capsules](https://raw.githubusercontent.com/unicxrn/protondb-millennium/main/screenshot-lists.png)

The panel shows:
- **Tier** (Platinum / Gold / Silver / Bronze / Borked / Native, or Pending when a game is too new to have been rated) as a colour-coded chip
- **Score meter** - the community percentage score
- **Details** - report count, confidence, how recently the data changed, the best tier anyone has reported, whether the rating is trending up, and the Proton version it works best with
- **Linux native badge** - detected from the store page's platform icons
- **Anticheat status** - for games that use anticheat, whether it actually works under Proton, from [AreWeAntiCheatYet](https://github.com/AreWeAntiCheatYet/AreWeAntiCheatYet)
- **Multiplayer warning** - ProtonDB tiers lean on singleplayer reports, so a game can sit at Gold while its multiplayer cannot launch at all. When a Platinum or Gold rating meets a blocked anticheat, the panel says so
- **Offline resilience** - when ProtonDB is unreachable, the last known result is shown with its age rather than nothing at all
- **No reports state** - a prompt to submit a report for games with no ProtonDB data

### Not covered
The library **grid** carries no badges. Only a game's own library page shows its rating. Big Picture and Steam Deck's gaming mode use a different UI, which this plugin does not target; it stays out of the way there rather than drawing anything. Tested against Millennium 3.6.2 on desktop Linux.

### Settings
**Steam → Settings → Millennium → Plugins → ProtonDB** turns each surface on or off: store pages, library pages, badge style in lists (tier name, coloured dot, or off), anticheat status, and the blocked-multiplayer warning. Changes apply straight away. The library stops or starts at once, and store pages pick the new settings up on the next page you open. The same panel shows what the cache holds and can clear it.

### Navigation support
Updates automatically as you browse between store pages - no reload needed.

### Performance
The backend caches results to disk, and the store page mirrors them in `localStorage` to avoid an IPC round trip while you browse. A source install writes to `backend/cache/`. A packed `.star` has no directory of its own, so it falls back to `<Steam>/config/protondb-millennium/`. Repeat visits are instant and survive a Steam restart. The anticheat dataset is a single download refreshed once a day. DLC pages are silently skipped.

---

## Installation

### Via Millennium plugin manager
Once listed, install directly from the **Plugins** tab in Steam.

### From a release (no build step)
1. Install [Millennium](https://github.com/SteamClientHomebrew/Millennium)
2. Download the latest `protondb-vX.X.X.star` from the [Releases](https://github.com/unicxrn/protondb-millennium/releases) page
3. Drop it into `~/.local/share/millennium/plugins/`. A `.star` is one packaged file, so there is nothing to extract
4. Enable **ProtonDB** in Steam → Settings → Millennium → Plugins

### From source
1. Install [Millennium](https://github.com/SteamClientHomebrew/Millennium)
2. Clone and build:
   ```sh
   git clone https://github.com/unicxrn/protondb-millennium
   cd protondb-millennium
   pnpm install && pnpm run build
   ```
   `output_path = "auto"` in `millennium.toml` installs the built `.star` straight into your Millennium plugins folder.
3. Enable **ProtonDB** in Steam → Settings → Millennium → Plugins

---

## Contributing

How the plugin is put together, how to build it, and how to run its tests are
in [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT - see [LICENSE](LICENSE)

---

## Credits

Data provided by [ProtonDB](https://www.protondb.com). Anticheat data from [AreWeAntiCheatYet](https://github.com/AreWeAntiCheatYet/AreWeAntiCheatYet). Built with [Millennium](https://github.com/SteamClientHomebrew/Millennium).
