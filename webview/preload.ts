import { DEFAULT_SETTINGS, loadSettings, type Settings } from '../shared/settings';
import { parseEnvelope, type Envelope } from '../shared/types';
import { createSkeletonWidget, waitForElement } from '../shared/dom';
import { WIDGET_ID, createErrorWidget, createNoReportsWidget, createWidget } from '../shared/widget';
import { lsGet, lsRemove, lsSet, lsSweep } from './cache';
import { decorateLists, resetLists } from './lists';
import { PURCHASE_SELECTORS, getAppIdFromUrl, isDlcPage, isLinuxNative } from './steam-dom';


// Incremented per page view. An async render that resolves after the user
// has navigated on must not touch the newer page's DOM.
let generation = 0;

// Re-read at the top of every page view, so a settings change takes effect as
// soon as the user navigates rather than needing Steam restarted. The read is
// a local file in the Lua backend, and one per navigation is nothing next to
// the page load it accompanies.
let settings: Settings = DEFAULT_SETTINGS;

function removeWidget(): void {
	document.getElementById(WIDGET_ID)?.remove();
}

async function resolve(appId: string, force: boolean): Promise<Envelope | null> {
	if (!force) {
		const cached = lsGet(appId);
		if (cached) return cached;
	}

	const raw = await backend.fetch_app_data(appId, force);
	const envelope = parseEnvelope(raw);
	if (!envelope) {
		// A reply that arrived but could not be read is a different failure
		// from one that never arrived, and the two need different fixes.
		throw new Error(
			typeof raw === 'string'
				? `backend replied with something unreadable: ${raw.slice(0, 120)}`
				: `backend replied with ${typeof raw}`,
		);
	}
	// Only cache answers worth reusing: a stale or failed response should be
	// retried on the next visit rather than pinned for an hour.
	if (envelope && !envelope.meta.error && !envelope.meta.stale) {
		lsSet(appId, envelope);
	} else if (force) {
		// The forced answer is worse than what we stored; drop the stored
		// entry so the next view does not contradict what the user just saw.
		lsRemove(appId);
	}
	return envelope;
}

async function render(appId: string, anchor: Element | null, force: boolean, gen: number): Promise<void> {
	let envelope: Envelope | null = null;
	let failure: string | null = null;
	try {
		envelope = await resolve(appId, force);
	} catch (e) {
		failure = e instanceof Error ? e.message : String(e);
		console.error('[protondb] backend call failed', e);
	}

	if (gen !== generation) return;

	removeWidget();

	const retry = () => { void render(appId, anchor, true, gen); };

	let widget: HTMLElement;
	if (!envelope) {
		widget = createErrorWidget(retry, failure);
	} else if (envelope.protondb) {
		widget = createWidget(appId, envelope, retry, {
			isNative: isLinuxNative(),
			showAnticheat: settings.anticheat,
			showConflictWarning: settings.conflictWarning,
		});
	} else if (envelope.meta.protondbError) {
		widget = createErrorWidget(retry, `backend reported: ${envelope.meta.protondbError}`);
	} else {
		widget = createNoReportsWidget(appId, envelope, { showAnticheat: settings.anticheat });
	}

	if (anchor) {
		anchor.insertAdjacentElement('beforebegin', widget);
		return;
	}

	// Fallback when no purchase section was found: a corner overlay.
	widget.style.position = 'fixed';
	widget.style.bottom = '20px';
	widget.style.right = '20px';
	widget.style.zIndex = '9999';
	widget.style.maxWidth = '420px';
	widget.style.background = '#1b2838';
	widget.style.padding = '14px';
	document.body.appendChild(widget);
}

/** The widget half of a page view. Only reached for a non-DLC app page. */
async function runAppPage(appId: string, gen: number): Promise<void> {
	let anchor: Element | null = null;
	for (const selector of PURCHASE_SELECTORS) {
		anchor = await waitForElement(selector, 3000);
		if (anchor) break;
	}

	// The wait above yields, so the page may have changed underneath us.
	if (gen !== generation) return;

	// Re-check once the DOM has settled; DLC markers can arrive late.
	if (isDlcPage()) return;

	const skeleton = createSkeletonWidget();
	if (anchor) anchor.insertAdjacentElement('beforebegin', skeleton);

	await render(appId, anchor, false, gen);
}

async function runForPage(url: string): Promise<void> {
	const gen = ++generation;
	// A previous page's observer/queue must not survive into this one.
	resetLists();
	removeWidget();

	try {
		settings = await loadSettings();
	} catch {
		/* keep whatever was last read; defaults on the very first failure */
	}
	if (gen !== generation) return;

	const appId = getAppIdFromUrl(url);
	// settings.storePages gates only the panel, not the list badges below: a
	// user who turns the panel off on store pages still sees badges in that
	// page's carousels, which is a separate setting.
	if (appId && settings.storePages && !isDlcPage()) {
		await runAppPage(appId, gen);
	}

	// List decoration runs on every page view: app pages have "More like this"
	// capsules alongside the widget, and search or category pages have only the
	// lists. Never for a page view a later navigation has already replaced.
	if (gen === generation) void decorateLists(settings.listBadges);
}

export default async function WebkitMain(): Promise<void> {
	lsSweep();

	try { await runForPage(window.location.href); } catch (e) { console.error('[protondb]', e); }

	let lastUrl = window.location.href;
	const onNav = async () => {
		const url = window.location.href;
		if (url === lastUrl) return;
		lastUrl = url;
		try { await runForPage(url); } catch (e) { console.error('[protondb]', e); }
	};

	const origPush = history.pushState.bind(history);
	const origReplace = history.replaceState.bind(history);
	history.pushState = (...args: Parameters<typeof history.pushState>) => { origPush(...args); onNav(); };
	history.replaceState = (...args: Parameters<typeof history.replaceState>) => { origReplace(...args); onNav(); };
	window.addEventListener('popstate', onNav);
}
