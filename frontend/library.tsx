import {
	Router,
	appDetailsClasses,
	basicAppDetailsSectionStylerClasses,
} from 'millennium';
import { DEFAULT_SETTINGS, loadSettings, type Settings } from '../shared/settings';
import { NATIVE_STAT_CLASS } from './library-stat';
import { parseEnvelope, type Envelope } from '../shared/types';
import { WIDGET_ID, createErrorWidget, createNoReportsWidget, createWidget } from '../shared/widget';
import { anchorSelectors, appIdFromArtworkUrl } from '../shared/library-anchor';


const HOST_ID = `${WIDGET_ID}-library-host`;

// Kept in step with the settings panel through applySettings(), which runs in
// this same frontend context, so turning the library widget on or off takes
// effect immediately rather than on the next launch.
let settings: Settings = DEFAULT_SETTINGS;

const SCAN_DEBOUNCE_MS = 400;
const SCAN_INTERVAL_MS = 3000;

/**
 * Reports to Steam's JS console and to Millennium's plugin log panel.
 * The panel only shows what the Lua side logs, so console.log alone is
 * invisible to anyone diagnosing this.
 */
/**
 * Something the user's plugin log should carry: a failure, or a one-off fact
 * about which path the integration took.
 *
 * The log panel belongs to whoever installed the plugin, not to its
 * development, so routine progress goes through trace() instead.
 */
function report(message: string): void {
	console.log('[protondb]', message);
	try {
		void backend.log_frontend(message).catch(() => {});
	} catch {
		/* backend may not be up yet; the console line still stands */
	}
}

/** Development detail: Steam's JS console only, never the user's log panel. */
function trace(message: string): void {
	console.log('[protondb]', message);
}

interface ClientWindow {
	name: string;
	title: string;
	doc: Document;
}

/**
 * Every Steam UI window this plugin can see, with its document.
 *
 * Plugin code runs in SharedJSContext, a different document entirely. Every
 * selector run against the global `document` returns nothing, which looks
 * exactly like a page that has not loaded. `findSP()` does not resolve the
 * real one on every build (it depends on gamepad navigation trees), so this
 * goes through the window store, which is what @steambrew/client's own
 * Navigation helper falls back to.
 */
function clientWindows(): ClientWindow[] {
	const found: ClientWindow[] = [];
	const seen = new Set<Document>();

	const consider = (instance: any) => {
		try {
			const browserWindow = instance?.BrowserWindow;
			const doc = browserWindow?.document;
			// SharedJSContext is where this code runs and holds none of the UI.
			if (!doc || doc === document || !doc.body || seen.has(doc)) return;
			seen.add(doc);
			found.push({ name: String(browserWindow?.name ?? ''), title: String(doc.title ?? ''), doc });
		} catch {
			/* a window can go away mid-enumeration */
		}
	};

	try {
		const store = (Router as any)?.WindowStore;
		consider((window as any).SteamUIStore?.GetFocusedWindowInstance?.());
		consider(store?.GamepadUIMainWindowInstance);
		((store?.SteamUIWindows as any[]) ?? []).forEach(consider);
	} catch (e) {
		report(`window enumeration failed: ${String(e)}`);
	}

	return found;
}

/**
 * The document holding the main client UI.
 *
 * Picking the first window available is wrong: at startup the only one present
 * can be "Sign in to Steam", and latching onto it means watching a window the
 * library will never appear in. Windows are therefore chosen by name, and
 * this is re-evaluated on every tick rather than resolved once. The main
 * window appears later, and can be replaced.
 */
function clientDocument(): Document | null {
	const windows = clientWindows();
	if (!windows.length) return null;

	const named =
		windows.find(w => w.name.indexOf('SP Desktop') === 0) ??
		windows.find(w => w.name.indexOf('SP ') === 0);
	if (named) return named.doc;

	// No recognisable name: fall back to whichever document actually contains
	// library markup, which is the thing we care about anyway.
	const selectors = candidateAnchors();
	for (const candidate of windows) {
		try {
			if (selectors.some(s => candidate.doc.querySelector(s))) return candidate.doc;
		} catch {
			/* ignore a document that has gone away */
		}
	}

	return null;
}

/**
 * Anchors to try, most specific first. Steam's own class names, resolved at
 * runtime from its webpack modules so they survive Steam's class hashing.
 */
function candidateAnchors(): string[] {
	return anchorSelectors([
		basicAppDetailsSectionStylerClasses?.GameInfoContainer,
		basicAppDetailsSectionStylerClasses?.AppDetailsContent,
		appDetailsClasses?.AppDetailsOverviewPanel,
		basicAppDetailsSectionStylerClasses?.AppDetailsContainer,
	]);
}

let knownAnchorSelector: string | null = null;

function findAnchorIn(doc: Document): Element | null {
	const candidates = candidateAnchors();
	const ordered = knownAnchorSelector
		? [knownAnchorSelector, ...candidates.filter(s => s !== knownAnchorSelector)]
		: candidates;

	for (const selector of ordered) {
		const found = doc.querySelector(selector);
		if (found) {
			if (selector !== knownAnchorSelector) trace(`library anchor: ${selector}`);
			knownAnchorSelector = selector;
			return found;
		}
	}
	return null;
}

/**
 * Reads the appid from artwork inside the app-details container.
 *
 * Scoped to that container deliberately: the library home grid is full of
 * other games' artwork, and matching any of it would pin the wrong rating to
 * whatever page the user is on.
 */
function appIdFromContainer(scope: Element): string | null {
	const images = scope.querySelectorAll('img[src]');
	for (let i = 0; i < images.length; i++) {
		const found = appIdFromArtworkUrl((images[i] as HTMLImageElement).src);
		if (found) return found;
	}

	const styled = scope.querySelectorAll('[style*="url("]');
	for (let i = 0; i < styled.length; i++) {
		const found = appIdFromArtworkUrl(styled[i].getAttribute('style') ?? '');
		if (found) return found;
	}

	return null;
}

function buildWidget(appId: string, envelope: Envelope | null, onRetry: () => void): HTMLElement {
	const options = {
		isNative: false,
		showAnticheat: settings.anticheat,
		showConflictWarning: settings.conflictWarning,
	};

	if (!envelope) return createErrorWidget(onRetry);
	if (envelope.protondb) return createWidget(appId, envelope, onRetry, options);
	if (envelope.meta.protondbError) return createErrorWidget(onRetry, `backend reported: ${envelope.meta.protondbError}`);
	return createNoReportsWidget(appId, envelope, options);
}

function removeHost(doc: Document): void {
	doc.getElementById(HOST_ID)?.remove();
}

let renderedAppId: string | null = null;

async function renderInto(doc: Document, anchor: Element, appId: string, force: boolean): Promise<void> {
	let envelope: Envelope | null = null;
	try {
		envelope = parseEnvelope(await backend.fetch_app_data(appId, force));
	} catch (e) {
		report(`library backend call failed: ${String(e)}`);
	}

	// The user may have navigated while that was in flight.
	if (renderedAppId !== appId || !anchor.isConnected) return;

	removeHost(doc);

	const host = doc.createElement('div');
	host.id = HOST_ID;
	host.appendChild(buildWidget(appId, envelope, () => void renderInto(doc, anchor, appId, true)));
	anchor.insertAdjacentElement('afterbegin', host);
}

let standDownReported = false;

function scan(doc: Document): void {
	try {
		// When the [patches] entry applied, Steam renders the stat itself and
		// this fallback has nothing to do. Checked every scan rather than once,
		// because the patch's stat appears with the page, not before it.
		if (doc.querySelector(`.${NATIVE_STAT_CLASS}`)) {
			if (!standDownReported) {
				standDownReported = true;
				report('native stat is present; the DOM fallback is standing down');
			}
			if (renderedAppId !== null) {
				renderedAppId = null;
				removeHost(doc);
			}
			return;
		}

		const anchor = findAnchorIn(doc);

		if (!anchor) {
			// Not on a game page. Drop anything left from the last one.
			if (renderedAppId !== null) {
				renderedAppId = null;
				removeHost(doc);
			}
			return;
		}

		const appId = appIdFromContainer(anchor);
		if (!appId) return;

		// Already showing this game, and the node is still in the tree.
		if (appId === renderedAppId && doc.getElementById(HOST_ID)) return;

		renderedAppId = appId;
		void renderInto(doc, anchor, appId, false);
	} catch (e) {
		report(`library scan failed: ${String(e)}`);
	}
}

function debounce(fn: () => void, ms: number): () => void {
	let timer: any = null;
	return () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(fn, ms);
	};
}

let installed = false;
let observer: MutationObserver | null = null;
let interval: any = null;
let watchedDoc: Document | null = null;
let reportedWindows = false;

/** Attaches the observer to `doc`, replacing any previous one. */
function attachTo(doc: Document): void {
	observer?.disconnect();
	observer = null;
	watchedDoc = doc;
	renderedAppId = null;

	trace(`watching client window (title=${doc.title || 'untitled'})`);

	try {
		// Construct the observer from the target document's own window, so it
		// belongs to that context rather than this one.
		const Ctor = (doc.defaultView as any)?.MutationObserver ?? MutationObserver;
		observer = new Ctor(debounce(() => scan(doc), SCAN_DEBOUNCE_MS));
		observer!.observe(doc.body, { childList: true, subtree: true });
	} catch (e) {
		report(`could not observe the client window: ${String(e)}`);
	}

	scan(doc);
}

/**
 * Re-resolves the client window and rescans.
 *
 * The window is re-resolved every tick on purpose: the first one Steam offers
 * can be the sign-in window, and the main UI window appears only afterwards.
 */
function tick(): void {
	try {
		const doc = clientDocument();

		if (!doc) {
			if (!reportedWindows) {
				reportedWindows = true;
				const names = clientWindows().map(w => `${w.name || '(unnamed)'}:"${w.title}"`);
				trace(`no main client window yet; visible windows: ${names.join(' ') || '(none)'}`);
			}
			return;
		}

		if (doc !== watchedDoc) {
			attachTo(doc);
			return;
		}

		scan(doc);
	} catch (e) {
		report(`library tick failed: ${String(e)}`);
	}
}

/**
 * Watches the Steam client's library for a game page and injects the widget.
 *
 * Deliberately does NOT patch any route or wrap any Steam component. An
 * earlier version wrapped the /library route's component, and because
 * Millennium rebuilds that wrapper on every pass of its route list, React saw
 * a new component type each time and remounted the whole library page,
 * resetting scroll and making it appear to refresh continuously. Observing the
 * DOM and appending one node cannot do that.
 */
export function installLibraryWidget(): void {
	if (installed) return;
	installed = true;

	void (async () => {
		applySettings(await loadSettings());
	})();
}

/**
 * Adopts a new settings set, starting or stopping the watcher to match.
 *
 * The settings panel renders in this same frontend context, so it can hand
 * changes straight over instead of this module polling for them or the user
 * restarting Steam to see the toggle take effect.
 */
export function applySettings(next: Settings): void {
	const was = settings;
	settings = next;

	if (!settings.libraryPages) {
		trace('library widget disabled in settings');
		stop();
		return;
	}

	// Anything already on screen was built from the old settings, so drop it
	// and let the next scan rebuild it. Without this, turning the anticheat
	// chip or the multiplayer warning off leaves it visible until the user
	// navigates away and back.
	if (was.anticheat !== settings.anticheat || was.conflictWarning !== settings.conflictWarning) {
		renderedAppId = null;
		const doc = clientDocument();
		if (doc) removeHost(doc);
	}

	start();
}

let watching = false;

function start(): void {
	if (watching) return;
	watching = true;
	trace('watching for the Steam client window');

	// A single timer does both jobs: find the main window whenever it appears
	// (it is not necessarily the first one Steam offers), and rescan the page
	// it is showing. One querySelector every few seconds.
	tick();
	interval = setInterval(tick, SCAN_INTERVAL_MS);
}

/** Stops watching and removes anything injected. */
function stop(): void {
	if (!watching) return;
	watching = false;

	observer?.disconnect();
	observer = null;
	if (interval) clearInterval(interval);
	interval = null;
	watchedDoc = null;
	renderedAppId = null;
	standDownReported = false;

	const doc = clientDocument();
	if (doc) removeHost(doc);
}

/** Stops watching and removes anything injected. Exported for completeness. */
export function uninstallLibraryWidget(): void {
	stop();
	installed = false;
}
