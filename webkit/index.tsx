import { callable } from '@steambrew/webkit';

const fetchProtonDBData = callable<[{ appId: string }], string>('fetch_protondb_data');

// ── Types ─────────────────────────────────────────────────────────────────

interface ProtonDBData {
	tier: string;
	bestReportedTier?: string;
	trendingTier?: string;
	score?: number;
	confidence?: string;
	total?: number;
	lastUpdated?: string | number;
	bestSteamVersion?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<string, { color: string; label: string; description: string }> = {
	platinum: { color: '#b4c7dc', label: 'Platinum', description: 'Works perfectly out of the box'      },
	gold:     { color: '#cfb53b', label: 'Gold',     description: 'Works great with only minor issues'  },
	silver:   { color: '#a8a9ad', label: 'Silver',   description: 'Works with workarounds'              },
	bronze:   { color: '#cd7f32', label: 'Bronze',   description: 'Runs but with significant issues'    },
	borked:   { color: '#ff4444', label: 'Borked',   description: 'Does not run under Proton'           },
	native:   { color: '#4caf50', label: 'Native',   description: 'Has a native Linux build'            },
};

const TIER_ICONS: Record<string, string> = {
	platinum: '✦', gold: '★', silver: '●', bronze: '◆', borked: '✕', native: '🐧',
};

const CONFIDENCE_COLORS: Record<string, string> = {
	high: '#4caf50', medium: '#cfb53b', low: '#ff4444',
};

const LS_PREFIX = 'protondb:';
const LS_TTL    = 3_600_000; // 1 hour in ms

// ── Utility helpers ───────────────────────────────────────────────────────

function getAppIdFromUrl(url: string): string | null {
	const match = url.match(/\/app\/(\d+)/);
	return match ? match[1] : null;
}

function tierCfg(tier: string) {
	return TIER_CONFIG[tier?.toLowerCase()] ?? { color: '#888888', label: tier, description: '' };
}

function relativeTime(ts: string | number): string {
	const epoch = typeof ts === 'number' ? ts * 1000 : new Date(ts).getTime();
	const ms    = Date.now() - epoch;
	if (isNaN(ms) || ms < 0) return '';
	const days  = Math.floor(ms / 86_400_000);
	if (days < 1)   return 'today';
	if (days < 7)   return `${days}d ago`;
	if (days < 30)  return `${Math.floor(days / 7)}wk ago`;
	if (days < 365) return `${Math.floor(days / 30)}mo ago`;
	return `${Math.floor(days / 365)}yr ago`;
}

// ── localStorage cache ────────────────────────────────────────────────────

function lsGet(appId: string): ProtonDBData | null {
	try {
		const s = localStorage.getItem(LS_PREFIX + appId);
		if (!s) return null;
		const { ts, data } = JSON.parse(s);
		if (Date.now() - ts > LS_TTL) { localStorage.removeItem(LS_PREFIX + appId); return null; }
		return data;
	} catch { return null; }
}

function lsSet(appId: string, data: ProtonDBData): void {
	try { localStorage.setItem(LS_PREFIX + appId, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

// ── Page-state detectors ──────────────────────────────────────────────────

function isDlcPage(): boolean {
	return !!document.querySelector('.game_area_dlc_bubble');
}

function isLinuxNative(): boolean {
	return !!document.querySelector('.platform_img.linux');
}

// ── DOM element builders ──────────────────────────────────────────────────

function createConfidenceDot(confidence: string): HTMLElement {
	const color = CONFIDENCE_COLORS[confidence?.toLowerCase()] ?? '#888888';
	const dot = document.createElement('span');
	dot.title = `${confidence} confidence`;
	dot.style.cssText = `
		display:inline-block; width:7px; height:7px; border-radius:50%;
		background:${color}; flex-shrink:0; vertical-align:middle; margin-right:3px;
	`;
	return dot;
}

function createTierPill(tier: string): HTMLElement {
	const cfg = tierCfg(tier);
	const pill = document.createElement('div');
	pill.style.cssText = `
		display: inline-block;
		padding: 3px 10px;
		background: ${cfg.color}25;
		border: 1px solid ${cfg.color};
		border-radius: 2px;
		color: ${cfg.color};
		font-size: 11px;
		font-weight: bold;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	`;
	pill.textContent = cfg.label;
	return pill;
}

function createScoreRing(score: number): SVGElement {
	const pct    = Math.round(score <= 1 ? score * 100 : score);
	const r      = 26;
	const circ   = 2 * Math.PI * r;
	const offset = circ * (1 - pct / 100);
	const color  = pct >= 75 ? '#4caf50' : pct >= 50 ? '#cfb53b' : '#ff4444';

	const ns  = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(ns, 'svg');
	svg.setAttribute('width', '68'); svg.setAttribute('height', '68');
	svg.setAttribute('viewBox', '0 0 68 68');

	const track = document.createElementNS(ns, 'circle');
	track.setAttribute('cx', '34'); track.setAttribute('cy', '34'); track.setAttribute('r', String(r));
	track.setAttribute('fill', 'none'); track.setAttribute('stroke', '#2a3f5a'); track.setAttribute('stroke-width', '6');

	const arc = document.createElementNS(ns, 'circle');
	arc.setAttribute('cx', '34'); arc.setAttribute('cy', '34'); arc.setAttribute('r', String(r));
	arc.setAttribute('fill', 'none'); arc.setAttribute('stroke', color); arc.setAttribute('stroke-width', '6');
	arc.setAttribute('stroke-linecap', 'round');
	arc.setAttribute('stroke-dasharray', String(circ));
	arc.setAttribute('stroke-dashoffset', String(offset));
	arc.setAttribute('transform', 'rotate(-90 34 34)');

	const label = document.createElementNS(ns, 'text');
	label.setAttribute('x', '34'); label.setAttribute('y', '39');
	label.setAttribute('text-anchor', 'middle');
	label.setAttribute('fill', '#c6d4df');
	label.setAttribute('font-size', '15');
	label.setAttribute('font-weight', 'bold');
	label.setAttribute('font-family', 'Arial, sans-serif');
	label.textContent = `${pct}%`;

	svg.appendChild(track); svg.appendChild(arc); svg.appendChild(label);
	return svg;
}

// Inject the pulse keyframe once
let _animInjected = false;
function ensureAnimation() {
	if (_animInjected) return;
	_animInjected = true;
	const style = document.createElement('style');
	style.textContent = `@keyframes protondb-pulse { 0%,100%{opacity:.3} 50%{opacity:.6} }`;
	document.head.appendChild(style);
}

function createSkeletonWidget(): HTMLElement {
	ensureAnimation();

	const w = document.createElement('div');
	w.id = 'protondb-badge';
	w.style.cssText = `
		padding: 14px 0 10px;
		border-top: 1px solid rgba(255,255,255,0.1);
		margin-bottom: 14px;
		font-family: "Motiva Sans", Arial, sans-serif;
	`;

	// Real header (stays visible while loading)
	const heading = document.createElement('div');
	heading.style.cssText = `
		display: flex; align-items: center; gap: 6px;
		font-size: 11px; color: #8f98a0; font-weight: bold;
		letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 10px;
	`;
	const logo = document.createElement('img');
	logo.src = 'https://www.protondb.com/sites/protondb/images/touch-icon.png';
	logo.style.cssText = 'width:12px; height:12px; opacity:0.6; flex-shrink:0;';
	logo.alt = '';
	heading.appendChild(logo);
	heading.appendChild(document.createTextNode('ProtonDB Compatibility'));
	w.appendChild(heading);

	// Shimmer row
	const row = document.createElement('div');
	row.style.cssText = `
		display: flex; align-items: center; gap: 12px;
		background: rgba(0,0,0,0.2); padding: 10px 14px;
	`;
	const ph = (width: string, height: string, extra = '') => {
		const d = document.createElement('div');
		d.style.cssText = `width:${width}; height:${height}; background:#2a3f5a; border-radius:3px;
			animation:protondb-pulse 1.5s ease-in-out infinite; ${extra}`;
		return d;
	};
	row.appendChild(ph('24px', '24px', 'border-radius:50%; flex-shrink:0;'));
	const lines = document.createElement('div');
	lines.style.cssText = 'display:flex; flex-direction:column; gap:6px; flex:1;';
	lines.appendChild(ph('80px',  '13px', 'animation-delay:0.1s'));
	lines.appendChild(ph('130px', '10px', 'animation-delay:0.2s'));
	row.appendChild(lines);
	row.appendChild(ph('110px', '28px', 'flex-shrink:0; border-radius:2px; animation-delay:0.15s'));
	w.appendChild(row);

	return w;
}

// ── DOM wait helper ───────────────────────────────────────────────────────

function waitForElement(selector: string, timeout = 6000): Promise<Element | null> {
	return new Promise(resolve => {
		const el = document.querySelector(selector);
		if (el) { resolve(el); return; }
		const obs = new MutationObserver(() => {
			const found = document.querySelector(selector);
			if (found) { obs.disconnect(); resolve(found); }
		});
		obs.observe(document.documentElement, { childList: true, subtree: true });
		setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
	});
}

// ── Main page runner ──────────────────────────────────────────────────────

const PURCHASE_SELECTORS = ['#game_area_purchase', '.game_area_purchase', '.game_area_already_owned'];

async function runForPage(url: string) {
	const appId = getAppIdFromUrl(url);
	document.getElementById('protondb-badge')?.remove();
	if (!appId) return;

	// DLC pages have no ProtonDB entry — skip silently
	if (isDlcPage()) return;

	// Find anchor element and show skeleton immediately
	let anchor: Element | null = null;
	for (const sel of PURCHASE_SELECTORS) {
		anchor = await waitForElement(sel, 3000);
		if (anchor) break;
	}

	// Still a DLC page even if we found a purchase section (check after DOM settles)
	if (isDlcPage()) return;

	const skeleton = createSkeletonWidget();
	if (anchor) anchor.insertAdjacentElement('beforebegin', skeleton);

	// Resolve data — localStorage first, then backend
	let data: ProtonDBData;
	const cached = lsGet(appId);
	if (cached) {
		data = cached;
	} else {
		const raw = await fetchProtonDBData({ appId });
		data = JSON.parse(raw);
		if (data.tier && data.tier !== 'error') lsSet(appId, data);
	}

	// Remove skeleton regardless of outcome
	document.getElementById('protondb-badge')?.remove();

	if (!data.tier || data.tier === 'error') return;

	// ── "No reports" state ────────────────────────────────────────────────
	if (data.tier === 'unknown') {
		const noReport = document.createElement('div');
		noReport.id = 'protondb-badge';
		noReport.style.cssText = `
			padding: 14px 0 10px;
			border-top: 1px solid rgba(255,255,255,0.1);
			margin-bottom: 14px;
			font-family: "Motiva Sans", Arial, sans-serif;
		`;
		const row = document.createElement('div');
		row.style.cssText = `
			display: flex; align-items: center; justify-content: space-between;
			background: rgba(0,0,0,0.15); padding: 10px 14px; gap: 12px;
		`;
		const left = document.createElement('div');
		left.style.cssText = 'display:flex; align-items:center; gap:8px; flex:1; min-width:0;';
		const logo = document.createElement('img');
		logo.src = 'https://www.protondb.com/sites/protondb/images/touch-icon.png';
		logo.style.cssText = 'width:13px; height:13px; opacity:0.4; flex-shrink:0;';
		logo.alt = '';
		const msg = document.createElement('div');
		msg.style.cssText = 'font-size:12px; color:#6a7480;';
		msg.textContent = 'No ProtonDB reports yet — be the first to submit';
		left.appendChild(logo); left.appendChild(msg);
		const btn = document.createElement('a');
		btn.href = `https://www.protondb.com/app/${appId}`;
		btn.target = '_blank'; btn.rel = 'noopener noreferrer';
		btn.style.cssText = `
			color:#4c6b8a; font-size:11px; font-weight:bold;
			text-decoration:none; white-space:nowrap; flex-shrink:0;
		`;
		btn.textContent = 'Submit report ↗';
		btn.addEventListener('mouseenter', () => { btn.style.color = '#5d7fa3'; });
		btn.addEventListener('mouseleave', () => { btn.style.color = '#4c6b8a'; });
		row.appendChild(left); row.appendChild(btn);
		noReport.appendChild(row);
		if (anchor) { anchor.insertAdjacentElement('beforebegin', noReport); return; }
		return;
	}

	// ── Main widget ───────────────────────────────────────────────────────
	const cfg      = tierCfg(data.tier);
	const isBorked = data.tier.toLowerCase() === 'borked';

	const widget = document.createElement('div');
	widget.id = 'protondb-badge';
	widget.style.cssText = `
		padding: 14px 0 10px;
		border-top: 1px solid rgba(255,255,255,0.1);
		margin-bottom: 14px;
		font-family: "Motiva Sans", Arial, sans-serif;
	`;

	// Section header
	const heading = document.createElement('div');
	heading.style.cssText = `
		display: flex; align-items: center; gap: 6px;
		font-size: 11px; color: #8f98a0; font-weight: bold;
		letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 10px;
	`;
	const logo = document.createElement('img');
	logo.src = 'https://www.protondb.com/sites/protondb/images/touch-icon.png';
	logo.style.cssText = 'width:12px; height:12px; opacity:0.6; flex-shrink:0;';
	logo.alt = '';
	heading.appendChild(logo);
	heading.appendChild(document.createTextNode('ProtonDB Compatibility'));
	widget.appendChild(heading);

	// Content row — borked gets a subtle red tint + left border
	const row = document.createElement('div');
	row.style.cssText = `
		display: flex; align-items: center; justify-content: space-between;
		background: ${isBorked ? 'rgba(255,68,68,0.07)' : 'rgba(0,0,0,0.2)'};
		${isBorked ? 'border-left: 2px solid #ff444466;' : ''}
		padding: 10px 14px; gap: 12px;
	`;

	// Left: tier dot + info
	const left = document.createElement('div');
	left.style.cssText = 'display:flex; align-items:center; gap:10px; flex:1; min-width:0;';

	const dot = document.createElement('div');
	dot.title = cfg.description;
	dot.style.cssText = `
		width:24px; height:24px; border-radius:50%; flex-shrink:0;
		background:${cfg.color}; color:rgba(0,0,0,0.7);
		display:flex; align-items:center; justify-content:center;
		font-size:12px; font-weight:bold; cursor:default;
	`;
	dot.textContent = TIER_ICONS[data.tier.toLowerCase()] ?? '?';

	const textBlock = document.createElement('div');

	// Tier name row (+ Linux native badge if applicable)
	const tierRow = document.createElement('div');
	tierRow.style.cssText = 'display:flex; align-items:center; gap:7px; flex-wrap:wrap;';
	const tierName = document.createElement('div');
	tierName.style.cssText = 'font-size:14px; font-weight:bold; color:#c6d4df;';
	tierName.textContent = cfg.label;
	tierRow.appendChild(tierName);

	if (isLinuxNative()) {
		const nativeBadge = document.createElement('div');
		nativeBadge.title = 'This game has a native Linux build';
		nativeBadge.style.cssText = `
			display:inline-flex; align-items:center; gap:4px;
			background:#1a3a1a; border:1px solid #4caf5088; border-radius:2px;
			padding:1px 6px; font-size:10px; font-weight:bold;
			color:#4caf50; letter-spacing:0.04em;
		`;
		nativeBadge.innerHTML = '🐧 Native Linux';
		tierRow.appendChild(nativeBadge);
	}

	// Subtitle parts (mix of text and DOM elements)
	const metaParts: (string | HTMLElement)[] = [];
	if (data.score !== undefined)
		metaParts.push(`${Math.round(data.score <= 1 ? data.score * 100 : data.score)}% score`);
	if (data.total)
		metaParts.push(`${data.total.toLocaleString()} reports`);
	if (data.confidence) {
		const confSpan = document.createElement('span');
		confSpan.style.cssText = 'display:inline-flex; align-items:center; gap:3px;';
		confSpan.appendChild(createConfidenceDot(data.confidence));
		confSpan.appendChild(document.createTextNode(`${data.confidence} confidence`));
		metaParts.push(confSpan);
	}
	if (data.lastUpdated) {
		const age = relativeTime(data.lastUpdated);
		if (age) metaParts.push(`updated ${age}`);
	}
	if (data.trendingTier && data.trendingTier.toLowerCase() !== data.tier.toLowerCase())
		metaParts.push(`trending: ${tierCfg(data.trendingTier).label}`);
	if (data.bestReportedTier && data.bestReportedTier.toLowerCase() !== data.tier.toLowerCase())
		metaParts.push(`best: ${tierCfg(data.bestReportedTier).label}`);
	if (data.bestSteamVersion)
		metaParts.push(`best version: ${data.bestSteamVersion}`);

	textBlock.appendChild(tierRow);
	if (metaParts.length) {
		const sub = document.createElement('div');
		sub.style.cssText = 'font-size:11px; color:#8f98a0; margin-top:3px; display:flex; align-items:center; flex-wrap:wrap;';
		metaParts.forEach((part, i) => {
			if (i > 0) sub.appendChild(document.createTextNode(' · '));
			if (typeof part === 'string') sub.appendChild(document.createTextNode(part));
			else sub.appendChild(part);
		});
		textBlock.appendChild(sub);
	}

	left.appendChild(dot);
	left.appendChild(textBlock);

	// Right: score ring + trending pill + button
	const right = document.createElement('div');
	right.style.cssText = 'display:flex; align-items:center; gap:14px; flex-shrink:0;';

	if (data.score !== undefined) {
		const w = document.createElement('div');
		w.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:3px;';
		const lbl = document.createElement('div');
		lbl.style.cssText = 'font-size:10px; color:#8f98a0; text-transform:uppercase; letter-spacing:0.06em;';
		lbl.textContent = 'Score';
		w.appendChild(lbl); w.appendChild(createScoreRing(data.score));
		right.appendChild(w);
	}
	if (data.trendingTier) {
		const w = document.createElement('div');
		w.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:5px;';
		const lbl = document.createElement('div');
		lbl.style.cssText = 'font-size:10px; color:#8f98a0; text-transform:uppercase; letter-spacing:0.06em;';
		lbl.textContent = 'Trending';
		w.appendChild(lbl); w.appendChild(createTierPill(data.trendingTier));
		right.appendChild(w);
	}

	const btn = document.createElement('a');
	btn.href = `https://www.protondb.com/app/${appId}`;
	btn.target = '_blank'; btn.rel = 'noopener noreferrer';
	btn.style.cssText = `
		background:#4c6b8a; color:#c6d4df; padding:7px 14px; border-radius:2px;
		font-size:12px; font-weight:bold; text-decoration:none; white-space:nowrap; flex-shrink:0;
	`;
	btn.textContent = 'View on ProtonDB';
	btn.addEventListener('mouseenter', () => { btn.style.background = '#5d7fa3'; });
	btn.addEventListener('mouseleave', () => { btn.style.background = '#4c6b8a'; });
	right.appendChild(btn);

	row.appendChild(left); row.appendChild(right);
	widget.appendChild(row);

	if (anchor) {
		anchor.insertAdjacentElement('beforebegin', widget);
		return;
	}

	// Fallback: fixed overlay
	widget.style.position   = 'fixed';
	widget.style.bottom     = '20px';
	widget.style.right      = '20px';
	widget.style.zIndex     = '9999';
	widget.style.maxWidth   = '420px';
	widget.style.background = '#1b2838';
	widget.style.padding    = '14px';
	document.body.appendChild(widget);
}

// ── Entry point ───────────────────────────────────────────────────────────

export default async function WebkitMain() {
	try { await runForPage(window.location.href); } catch (_e) {}

	let lastUrl = window.location.href;
	const onNav = async () => {
		const url = window.location.href;
		if (url === lastUrl) return;
		lastUrl = url;
		try { await runForPage(url); } catch (_e) {}
	};

	const origPush    = history.pushState.bind(history);
	const origReplace = history.replaceState.bind(history);
	history.pushState    = (...args: Parameters<typeof history.pushState>)    => { origPush(...args);    onNav(); };
	history.replaceState = (...args: Parameters<typeof history.replaceState>) => { origReplace(...args); onNav(); };
	window.addEventListener('popstate', onNav);
}
