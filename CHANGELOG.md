# Changelog

## 2.0.0

A large update. The plugin now covers the library and store lists as well as store pages, knows about anticheat, and has real settings.

### Installing this version is different

The plugin ships as a single `.star` file instead of a folder. Drop `protondb-v2.0.0.star` into `~/.local/share/millennium/plugins/`. There is nothing to extract.

**If you installed 1.x from source or a zip, delete the old `protondb/` folder from your plugins directory first.** Leaving it there makes Millennium load the plugin twice.

Requires Millennium 3.x.

### New

- **Library pages.** A game's ProtonDB rating now appears on its library page too, in the same panel the store page uses, above the play bar.
- **Badges in lists.** Search results, category rows and wishlist rows carry a tier badge, so you can judge a list without opening every game. Games with no rating stay blank, so a missing badge never means a bad one.
- **Anticheat status.** For the roughly 680 games that use anticheat, the widget shows whether it actually works under Proton, from [AreWeAntiCheatYet](https://github.com/AreWeAntiCheatYet/AreWeAntiCheatYet).
- **A warning when multiplayer is blocked.** ProtonDB tiers lean on singleplayer reports, so a game can sit at Gold while its multiplayer cannot launch. When a Platinum or Gold rating meets a blocked anticheat, the widget says so plainly.
- **Settings.** Steam → Settings → Millennium → Plugins → ProtonDB turns each surface on or off, chooses how much list badges show, and can clear cached data.

### Changed

- **The store panel was rebuilt.** One headline row (tier, score, link) over labelled details, replacing a layout that stated the verdict three times over in three different visual languages.
- **Ratings survive a restart.** Results are cached to disk rather than held in memory, so reopening Steam no longer refetches everything.
- **Offline behaviour is honest.** When ProtonDB is unreachable you get the last known rating with its age and a retry, instead of the section silently not appearing.

### Fixed

- **Badges were missing from most of the store.** They only appeared where a row had Steam's search-results markup, so search worked and the store front, its carousels and the wishlist did not. On the front page that meant 160 rows found and then silently skipped. Badges now go into whichever text slot a row offers, or onto the artwork when it offers none.
- **The store front's offer capsules showed no badges.** Those are single-page-app tiles with no appid attribute, each wrapped in its own carousel slide, so neighbouring games sit several levels away rather than beside them.
- **Some capsules wore the badge as a bar under the artwork instead of on it.** Which ones depended on whether their carousel slide happened to be on screen when the page was scanned. An off-screen capsule measures nothing, and placement was decided by measuring.
- **The wishlist showed no badges.** Steam's current wishlist is a single-page app whose rows carry no appid attribute of any kind, so there was nothing for the plugin to match. Rows there are now found by following their store links.
- **The search box's autocomplete showed no badges.** Steam's current dropdown renders results as plain links with no appid attribute at all; its rows are now found by their links, as the wishlist's are. (The older dropdown, which identifies rows as `0_<appid>` where every other surface writes `App_<appid>`, was being rejected as a bundle. That is fixed too.)
- **A surface that rendered late was never decorated.** The plugin waited for a row to appear and gave up for good if none did within five seconds, then started watching. It now watches first, so the autocomplete, which has no rows at all until you type, can work, and a slow list no longer has to beat a timer.
- **Settings toggles rendered as grey blocks.** They were Steam's own `ToggleField`, which Millennium's SDK locates by matching a marker in Steam's minified bundles that its source dates to October 2024. The panel now draws its own switches, picker and button, so a Steam reshuffle cannot break them again.
- **The "Store pages" setting did nothing.** It was read and never checked.
- Games ProtonDB has not rated yet showed a lowercase `pending` badge beside Title Case tiers. That is a real tier, meaning a game too new or too quiet to rate, and it now reads as one.
- Promo banners and nav buttons no longer get a badge. Steam gives them an appid (one of them an appid belonging to a game it does not link to), and they were being treated as games.
- Settings changes no longer need a Steam restart. The library starts or stops at once, and store pages pick them up on the next page.
- A missing space in the details line (`confidence· best`).
- The widget vanishing entirely on any network or parsing failure.
- Stale badges on recycled list rows, which could show one game's rating on another.
- Rapid navigation between store pages showing the previous game's rating.

### Under the hood

- Rebuilt on Millennium's current plugin format (`millennium.toml`, compiled by starlight).
- Repeated failures now back off instead of refetching on every page view, for both data sources.
- 218 automated tests, from none, and `pnpm test` now typechecks every TypeScript project before running them. The frontend had not been typechecked at all.
