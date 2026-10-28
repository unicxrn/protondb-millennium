import { parseCachedTiers, parseEnvelope } from '../shared/types';
import { LIST_BADGE_CLASS, createListBadge, styleBadgeAsOverlay } from '../shared/dom';
import type { Settings } from '../shared/settings';
import { groupRowsByAppId, resolveRowAppId } from '../shared/list-row';
import { FetchQueue } from '../shared/queue';
import { lsSet } from './cache';
import { getAppIdFromUrl } from './steam-dom';

// Re-exported for convenience; the logic lives in shared/types.ts beside
// parseEnvelope, which is where the envelope contract belongs.
//
// It was moved there originally because this module imported `callable` from
// `@steambrew/webkit`, whose build re-exports ambient globals and so cannot be
// loaded outside a running Steam client, which made everything here
// untestable. The starlight migration replaced that import with the `backend`
// global, so this module now loads fine under vitest.
export { parseCachedTiers };


/**
 * How much each badge shows. Narrower than the setting: decorateLists()
 * returns before decorating anything when the setting is 'off', so no badge
 * is ever built in that mode.
 */
let badgeMode: Exclude<Settings['listBadges'], 'off'> = 'label';

/** A long scroll must never turn into more than this many on-demand fetches. */
const FETCH_BUDGET = 40;

/**
 * Rows Steam might let us identify.
 *
 * Search results and capsules carry `data-ds-appid`; wishlist rows use
 * `data-app-id`. Anything matching is still filtered by resolveRowAppId,
 * which rejects bundles, multi-app rows and anything it cannot read.
 */
const ROW_SELECTOR = '[data-ds-appid], [data-app-id]';

/**
 * Reads a row's appid from whichever attribute or link it offers, or null if
 * the element is not a game row at all.
 *
 * Steam puts `data-ds-appid` on things that are not games: the front page's
 * takeover banner carries one, and so does the "Customize, Explore by Tag"
 * button, whose appid belongs to a game it does not link to. Steam marks every
 * one of those with `ds_no_flags`, its own "do not decorate this" class, and
 * the same marker it uses to keep its wishlist and ignore flags off them. That
 * is what is honoured here rather than a list of banner class names.
 */
function identify(row: Element): string | null {
	if (row.classList.contains('ds_no_flags')) return null;

	return resolveRowAppId({
		dsAppId: row.getAttribute('data-ds-appid'),
		appId: row.getAttribute('data-app-id'),
		itemKey: row.getAttribute('data-ds-itemkey'),
		href: row.getAttribute('href'),
	});
}

/** How long to let a page render before judging whether decoration worked. */
const REPORT_DELAY_MS = 6000;

/** How long to let late-arriving rows (infinite scroll) batch up before re-scanning. */
const RESCAN_DEBOUNCE_MS = 300;

interface CandidateRow {
	row: Element;
	appId: string;
}

/**
 * Own page-view counter, bumped by resetLists(). Mirrors the generation guard
 * webview/preload.ts uses for the widget: any async work started under an older
 * generation checks this before touching the DOM, so a previous page's
 * in-flight cache lookup or per-row fetch can never decorate the page the
 * user has since navigated to. resetLists() is called by index.tsx at the
 * start of every page view, immediately before decorateLists(), so this stays
 * in lockstep with the page-view lifecycle without either module reaching
 * into the other's private state.
 */
let generation = 0;

/** Queues rows scrolled into view. Lives in module state so resetLists() can
 * drop a still-abandoned page's pending work instead of letting it keep
 * draining the blocking Lua HTTP thread after the user has navigated away. */
let queue: FetchQueue | null = null;

let intersectionObserver: IntersectionObserver | null = null;

/**
 * Rows the link pass found, as opposed to the attribute pass.
 *
 * Kept here rather than marked on the element so nothing of this plugin's is
 * written into Steam's own DOM beyond the badge itself.
 */
let linkFoundRows = new WeakSet<Element>();

/** One-shot timer for the end-of-page-view diagnostic. */
let reportTimer: ReturnType<typeof setTimeout> | null = null;

/** Watches for rows added after the initial scan (infinite scroll, late-rendered lists). */
let mutationObserver: MutationObserver | null = null;

/** appId -> every row currently on the page showing that app, so a duplicate
 * (the same game in two carousels) is never left undecorated. */
let rowsByAppId = new Map<string, Element[]>();

function debounce(fn: () => void, ms: number): () => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return () => {
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(fn, ms);
	};
}

function findBadge(row: Element): HTMLElement | null {
	return row.querySelector<HTMLElement>(`.${LIST_BADGE_CLASS}`);
}

/**
 * True when `row` already carries a badge for `appId`. A carousel or
 * virtualised list can recycle a row node and swap its `data-ds-appid`
 * without removing the badge from the previous game. The mismatch is
 * caught here and the stale badge removed so the row gets re-decorated
 * with the right tier instead of silently keeping the wrong one.
 */
function hasBadgeFor(row: Element, appId: string): boolean {
	const badge = findBadge(row);
	if (!badge) return false;
	if (badge.dataset.protondbAppid === appId) return true;
	badge.remove();
	return false;
}

/**
 * Where a badge goes, in order of preference.
 *
 * Steam uses a different row shape on every surface, and each of these was
 * read off a live page rather than guessed: search results put the platform
 * icons in `.search_platforms` and the name in `.title`, the front page's
 * carousels use `.tab_item_title`, and an app page's DLC table uses
 * `.game_area_dlc_name`. A row matching none of them gets an overlay instead.
 */
const BADGE_SLOTS = [
	'.search_platforms',
	'.tab_item_title',
	'.match_name',
	'.title',
	'.search_name',
	'.game_area_dlc_name',
];

/** Per-page-view tallies, for the one-line diagnostic at the end of a scan. */
const stats = { rows: 0, fromCache: 0, queued: 0 };

/**
 * Reports what a page view actually decorated, but only when the numbers look
 * wrong: rows found and none of them badged or even queued.
 *
 * This goes to the plugin log rather than the console because a webkit
 * context's console is not somewhere a user can reasonably be asked to look,
 * and "badges do not appear on this page" is otherwise indistinguishable from
 * "none of these games have a rating". Silent on a healthy page.
 */
function reportScan(): void {
	const healthy = stats.rows === 0 || stats.fromCache > 0 || stats.queued > 0;
	if (healthy) return;

	const line =
		`lists: ${stats.rows} rows found on ${location.pathname}, ` +
		'none badged and none queued';
	console.log('[protondb]', line);
	try {
		void backend.log_frontend(line).catch(() => {});
	} catch {
		/* the console line still stands */
	}
}

function insertBadge(row: Element, tier: string, appId: string): void {
	if (hasBadgeFor(row, appId)) return;
	const badge = createListBadge(tier, appId, badgeMode);

	for (const slot of BADGE_SLOTS) {
		const host = row.querySelector(slot);
		if (host) {
			host.appendChild(badge);
			return;
		}
	}

	// No known slot. A row Steam marks with an appid and gives no text slot is
	// a store capsule, every row with a real label matched above, so it is
	// a tile regardless of how it measures. That matters because a capsule in
	// a carousel measures nothing until its slide is shown, and deciding by
	// size put a bar across whichever ones happened to be off screen when the
	// page was scanned.
	//
	// A row the link pass found could be either: a wishlist title and a search
	// dropdown row are lines of text, while a single-page-app offer capsule is
	// artwork. Those are told apart by how much of the row the artwork covers.
	const isTile = !linkFoundRows.has(row) || isArtworkTile(row as HTMLElement);

	if (!isTile && (row.textContent ?? '').trim()) {
		row.appendChild(badge);
		return;
	}

	styleBadgeAsOverlay(badge, row as HTMLElement);
	row.appendChild(badge);
}

/** Share of a row's area its artwork must cover for the row to be a tile. */
const ARTWORK_AREA_SHARE = 0.5;

/**
 * True when a row is an artwork tile rather than a line of text.
 *
 * What separates them is how much of the row the artwork takes, not the row's
 * shape. Store capsules are mostly picture whichever way round they are: a
 * tall offer capsule is 277x357 with a 277x321 image, and a wide one gives all
 * but a price strip to the image. Appending to any of them puts a bar across
 * the bottom of the artwork and makes the card taller. A search dropdown row
 * is 346x56 with a 56x56 thumbnail and is mostly text, so a badge appended
 * after the label reads correctly and an overlay would cover the price.
 *
 * Orientation is still accepted as a second signal, for a tall tile that
 * paints its artwork as a background rather than an `<img>`.
 *
 * A row that has not been laid out measures zero and counts as text, which is
 * the safer of the two: an inline badge in the wrong place is visible, where
 * an overlay anchored to nothing may not be.
 */
function isArtworkTile(row: HTMLElement): boolean {
	try {
		const rect = row.getBoundingClientRect();
		const area = rect.width * rect.height;

		// Taller than it is wide: a tile whatever paints it, including one
		// whose artwork is a background rather than an `<img>`.
		if (area > 0 && rect.height > rect.width) return true;

		const images = row.querySelectorAll('img');
		// Nothing but text. A wishlist title keeps its artwork in a separate
		// link, so this is how that row is recognised.
		if (!images.length) return false;

		// Carrying artwork but not laid out. A carousel slide waiting its
		// turn, which measures zero until it is shown. Those have to be read
		// from content: deciding by size here is what put a bar across some
		// capsules and not others, depending only on which happened to be
		// on screen when the page was scanned.
		if (area <= 0) return true;

		// The largest single image, not the sum: capsules stack ribbons and
		// discount flags over the artwork, and adding those up overshoots.
		let artwork = 0;
		images.forEach(image => {
			const bounds = image.getBoundingClientRect();
			artwork = Math.max(artwork, bounds.width * bounds.height);
		});
		if (artwork <= 0) return true;

		return artwork / area >= ARTWORK_AREA_SHARE;
	} catch {
		return false;
	}
}

/** Reads a tier string out of a loosely-typed cached/fetched payload. */
function tierOf(payload: unknown): string | null {
	if (payload && typeof payload === 'object' && typeof (payload as { tier?: unknown }).tier === 'string') {
		return (payload as { tier: string }).tier;
	}
	return null;
}

/**
 * Surfaces where every text-bearing game link is a row.
 *
 * Steam's current wishlist is a single-page app that renders rows as plain
 * divs with build-hashed class names and no `data-ds-appid`, `data-app-id` or
 * item key anywhere, so there is nothing for a selector to match. Each row
 * also links to its game only once, so the sibling test below cannot see it
 * as a list.
 */
const LINK_ONLY_SURFACES = /^\/wishlist(\/|$)/;

/** A link to a game's store page. */
const APP_LINK_SELECTOR = 'a[href*="/app/"]';

/** Distinct games that must share an ancestor before it counts as a list. */
const MIN_SIBLINGS_FOR_LIST = 2;

/**
 * How far above a link to look for the list it belongs to.
 *
 * Measured, not picked: the store front's offer capsules are each wrapped in
 * their own carousel slide, so their links only share an ancestor four levels
 * up, while on a game page nothing a link points at is shared within four,
 * because the stray links there sit in the description, the news block and a
 * promo, far apart. Five levels reaches the shared page container and would
 * let all of them back in.
 */
const LIST_ANCESTOR_DEPTH = 4;

/**
 * Rows found by following links rather than by reading an attribute.
 *
 * Steam is migrating its store to a single-page app whose rows carry no appid
 * attribute at all. The search box's autocomplete is already one, and so is
 * the wishlist. The only stable handle on those is the link to the game.
 *
 * Following every game link would be too much, though: an app page links to
 * other games from its description and its announcements, and a badge on a
 * link reading "Learn More" is just noise. So a link counts as a row only when
 * it sits among sibling links to *other* games, which is what separates a list
 * from a mention in prose. Measured against live pages, that keeps every
 * autocomplete result and drops all three stray links on a game page.
 *
 * Only anchors that show text are taken. A row often links to the same game
 * twice, once from the artwork and once from the title; the artwork link holds
 * nothing but an `<img>`, so skipping it also stops the row collecting two
 * badges.
 */
function linkedRows(): CandidateRow[] {
	const everyLinkIsARow = LINK_ONLY_SURFACES.test(location.pathname);
	const ownAppId = getAppIdFromUrl(location.href);
	const candidates: CandidateRow[] = [];

	document.querySelectorAll(APP_LINK_SELECTOR).forEach(anchor => {
		// A link inside a row the attribute pass already owns would put a
		// second badge on that row.
		if (anchor.closest(ROW_SELECTOR)) return;
		if (!(anchor.textContent ?? '').trim()) return;
		const appId = resolveRowAppId({ href: anchor.getAttribute('href') });
		if (appId) candidates.push({ row: anchor, appId });
	});

	// Distinct games under each ancestor within reach, so a row in a list can
	// be told from a mention in prose.
	const gamesUnder = new Map<Element, Set<string>>();
	for (const { row, appId } of candidates) {
		let node = row.parentElement;
		for (let depth = 0; node && depth < LIST_ANCESTOR_DEPTH; depth++) {
			const ids = gamesUnder.get(node) ?? new Set<string>();
			ids.add(appId);
			gamesUnder.set(node, ids);
			node = node.parentElement;
		}
	}

	const inAList = (row: Element): boolean => {
		let node = row.parentElement;
		for (let depth = 0; node && depth < LIST_ANCESTOR_DEPTH; depth++) {
			if ((gamesUnder.get(node)?.size ?? 0) >= MIN_SIBLINGS_FOR_LIST) return true;
			node = node.parentElement;
		}
		return false;
	};

	const out: CandidateRow[] = [];
	const seen = new Set<string>();
	for (const { row, appId } of candidates) {
		if (seen.has(appId)) continue;
		if (!everyLinkIsARow && !inAList(row)) continue;
		linkFoundRows.add(row);
		// Claimed either way, so a second link to the same game elsewhere on
		// the page does not pick up a badge of its own.
		seen.add(appId);
		// A game's own page links back to itself from its header, its news
		// block and its community links, and already carries the full panel
		// above the buy cards. A badge on "View all" helps nobody. Those
		// links still counted towards the list test above, because removing
		// them would shrink a genuine list of results down below it.
		if (appId === ownAppId) continue;
		if (hasBadgeFor(row, appId)) continue;
		out.push({ row, appId });
	}

	return out;
}

/** Every element on the page that could carry a badge and does not yet. */
function candidateRows(): CandidateRow[] {
	const out: CandidateRow[] = [];
	document.querySelectorAll(ROW_SELECTOR).forEach(row => {
		const appId = identify(row);
		if (!appId) return;
		if (hasBadgeFor(row, appId)) return;
		out.push({ row, appId });
	});

	out.push(...linkedRows());

	return out;
}

/** FetchQueue worker: fetches one app, caches a clean answer, decorates every row showing it. */
async function fetchOne(appId: string, gen: number): Promise<void> {
	// Checked both before and after the IPC call: the call itself reaches the
	// synchronous, blocking Lua thread, so a page the user has since left
	// must never even issue it, not just be prevented from rendering its result.
	if (gen !== generation) return;
	const envelope = parseEnvelope(await backend.fetch_app_data(appId, false));
	if (gen !== generation || !envelope) return;

	// Only cache answers worth reusing. See webview/preload.ts's resolve().
	if (!envelope.meta.error && !envelope.meta.stale) {
		lsSet(appId, envelope);
	}

	const tier = envelope.protondb ? tierOf(envelope.protondb) : null;
	if (!tier) return;

	const rows = rowsByAppId.get(appId);
	if (rows) for (const row of rows) insertBadge(row, tier, appId);
}

/**
 * Scans the page for undecorated rows, decorates whatever the cache already
 * knows, and hands the rest to the IntersectionObserver / fetch queue set up
 * by decorateLists(). Re-entrant and safe to call multiple times within the
 * same generation. The mutation observer calls it again whenever new rows
 * appear (infinite scroll, late-rendered lists).
 *
 * Wrapped in its own try/catch rather than relying on decorateLists()'s:
 * the mutation observer's debounced callback calls this directly, on its own
 * timer, well after decorateLists()'s original call (and try/catch) have
 * already returned.
 */
async function scan(gen: number): Promise<void> {
	try {
		const rows = candidateRows();
		if (!rows.length) return;
		stats.rows += rows.length;

		for (const [appId, newRows] of groupRowsByAppId(rows)) {
			const existing = rowsByAppId.get(appId);
			if (existing) existing.push(...newRows);
			else rowsByAppId.set(appId, newRows);
		}

		try {
			const raw = await backend.fetch_cached_tiers(JSON.stringify(rows.map(r => r.appId)));
			if (gen !== generation) return;

			const tiers = parseCachedTiers(raw);
			for (const { row, appId } of rows) {
				const tier = tierOf(tiers[appId]);
				if (!tier) continue;
				stats.fromCache++;
				insertBadge(row, tier, appId);
			}
		} catch (e) {
			console.error('[protondb] fetch_cached_tiers failed', e);
		}

		if (gen !== generation) return;

		for (const { row, appId } of rows) {
			if (hasBadgeFor(row, appId)) continue;
			stats.queued++;
			intersectionObserver?.observe(row);
		}
	} catch (e) {
		console.error('[protondb] scan failed', e);
	}
}

/**
 * Decorates every eligible row on the current page.
 *
 * Watches before it scans. Rows arrive at different times on different
 * surfaces, and the search box's autocomplete has none at all until the user
 * types, so the MutationObserver goes up first and a debounced rescan picks up
 * whatever appears later, infinite scroll included.
 *
 * The first pass is a single cache-only IPC call covering every row at once,
 * which is cheap and never touches the network. After it, an
 * IntersectionObserver queues whatever is still undecorated, one fetch at a
 * time, only for rows the user actually scrolls to, under FETCH_BUDGET.
 *
 * Never throws into the page. A failure anywhere in this async flow must
 * not break Steam's own UI, so the whole body is wrapped in its own
 * try/catch rather than relying on the caller's.
 */
export async function decorateLists(mode: Settings['listBadges'] = 'label'): Promise<void> {
	if (mode === 'off') return;
	badgeMode = mode;
	const gen = generation;
	try {
		queue = new FetchQueue(id => fetchOne(id, gen), FETCH_BUDGET);

		const io = new IntersectionObserver(entries => {
			if (gen !== generation) return;
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				intersectionObserver?.unobserve(entry.target);
				const appId = identify(entry.target);
				if (!appId || hasBadgeFor(entry.target, appId)) continue;
				queue?.add(appId);
			}
		});
		intersectionObserver = io;

		// Watch for rows BEFORE scanning for them, not after finding the
		// first one. Waiting for a row to exist and giving up when none
		// appeared in time meant a surface that renders late was never
		// decorated and never retried. The search box's autocomplete, which
		// has no rows until the user types, could not work at all, and a
		// slow-loading list only worked if it beat the timeout.
		const mo = new MutationObserver(debounce(() => {
			if (gen !== generation) return;
			void scan(gen);
		}, RESCAN_DEBOUNCE_MS));
		mo.observe(document.body, { childList: true, subtree: true });
		mutationObserver = mo;

		await scan(gen);
		if (gen !== generation) return;

		// Judge the page once it has had time to render, not at first paint,
		// when finding nothing is normal.
		reportTimer = setTimeout(() => {
			if (gen === generation) reportScan();
		}, REPORT_DELAY_MS);
	} catch (e) {
		console.error('[protondb] decorateLists failed', e);
	}
}

/** Disconnects both observers, drops queued work, and clears per-page state. Call on navigation. */
export function resetLists(): void {
	generation++;
	intersectionObserver?.disconnect();
	intersectionObserver = null;
	mutationObserver?.disconnect();
	mutationObserver = null;
	queue?.clear();
	queue = null;
	if (reportTimer !== null) clearTimeout(reportTimer);
	reportTimer = null;
	rowsByAppId = new Map();
	linkFoundRows = new WeakSet();
	stats.rows = 0;
	stats.fromCache = 0;
	stats.queued = 0;
}
