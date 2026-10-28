import type { AnticheatPayload } from './types';
import type { Fact } from './widget-model';
import { anticheatCfg, tierCfg } from './vocabulary';

export const LIST_BADGE_CLASS = 'protondb-list-badge';




// Inject the pulse keyframe once
let _animInjected = false;
function ensureAnimation() {
	if (_animInjected) return;
	_animInjected = true;
	const style = document.createElement('style');
	style.textContent = `@keyframes protondb-pulse { 0%,100%{opacity:.3} 50%{opacity:.6} }`;
	document.head.appendChild(style);
}

export const PANEL_STYLE = `
	padding: 14px 0 10px;
	border-top: 1px solid rgba(255,255,255,0.1);
	margin-bottom: 14px;
	font-family: "Motiva Sans", Arial, sans-serif;
`;

/** The section header shared by the skeleton, the widget, and the error row. */
export function createHeading(): HTMLElement {
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
	return heading;
}

/** A muted inline control, used for the retry affordance. */
export function createTextButton(label: string, onClick: () => void): HTMLElement {
	const btn = document.createElement('a');
	btn.href = '#';
	btn.style.cssText = `
		color:#4c6b8a; font-size:11px; font-weight:bold;
		text-decoration:none; white-space:nowrap; flex-shrink:0; cursor:pointer;
	`;
	btn.textContent = label;
	btn.addEventListener('mouseenter', () => { btn.style.color = '#5d7fa3'; });
	btn.addEventListener('mouseleave', () => { btn.style.color = '#4c6b8a'; });
	btn.addEventListener('click', e => { e.preventDefault(); onClick(); });
	return btn;
}

export function createSkeletonWidget(): HTMLElement {
	ensureAnimation();

	const w = document.createElement('div');
	w.id = 'protondb-badge';
	w.style.cssText = PANEL_STYLE;

	// Real header (stays visible while loading)
	w.appendChild(createHeading());

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

/**
 * A minimal tier marker for list rows: a coloured dot and the tier name.
 * Lists show the tier only. There is room for one fact, and the tier is what
 * people scan for. The anticheat row stays on the store and library pages,
 * where there is space to explain it.
 */
export function createListBadge(tier: string, appId: string, mode: 'label' | 'dot' = 'label'): HTMLElement {
	const cfg = tierCfg(tier);

	// A bare dot is denser but needs a legend the user does not have - silver
	// and platinum are both pale greys at this size - so the label is the
	// default and the dot is opt-in.
	if (mode === 'dot') {
		const dot = document.createElement('span');
		dot.className = LIST_BADGE_CLASS;
		dot.dataset.protondbAppid = appId;
		dot.title = `ProtonDB: ${cfg.label}. ${cfg.description}`;
		dot.style.cssText = `
			display:inline-block; width:9px; height:9px; border-radius:50%;
			background:${cfg.color}; margin-left:6px; flex-shrink:0;
			vertical-align:middle;
		`;
		return dot;
	}


	const badge = document.createElement('span');
	badge.className = LIST_BADGE_CLASS;
	// Carries no visible content, but lets a caller tell whether a badge
	// already on a row still belongs to that row's current game. A
	// recycled row (carousels, virtualised lists) can swap data-ds-appid
	// without removing the previous badge.
	badge.dataset.protondbAppid = appId;
	badge.title = `ProtonDB: ${cfg.label}. ${cfg.description}`;
	badge.style.cssText = `
		display:inline-flex; align-items:center; gap:4px;
		margin-left:6px; padding:1px 6px; border-radius:2px;
		background:${cfg.color}22; border:1px solid ${cfg.color}66;
		font-size:10px; font-weight:bold; letter-spacing:0.04em;
		color:${cfg.color}; vertical-align:middle; white-space:nowrap;
	`;

	const dot = document.createElement('span');
	dot.style.cssText = `width:6px; height:6px; border-radius:50%; background:${cfg.color}; flex-shrink:0;`;
	badge.appendChild(dot);
	badge.appendChild(document.createTextNode(cfg.label));

	return badge;
}

/** Values of `position` that already establish a containing block. */
const POSITIONED = new Set(['relative', 'absolute', 'fixed', 'sticky']);

/**
 * Repositions a badge as a corner overlay on the row itself.
 *
 * For rows that carry no text, a bare artwork capsule, there is nothing to
 * append a badge beside, and an inline span dropped into an image anchor
 * either disappears or shifts the artwork. An absolute overlay avoids both:
 * it takes the badge out of flow entirely, so the row's own layout is
 * untouched whatever shape it is.
 *
 * Over artwork the tier's translucent fill is unreadable, so the overlay gets
 * an opaque backdrop instead.
 */
export function styleBadgeAsOverlay(badge: HTMLElement, row: HTMLElement): void {
	// An absolutely-positioned child needs a positioned ancestor, or it
	// escapes to the nearest one and lands on an unrelated part of the page.
	//
	// The test is "not already positioned" rather than "=== static": a row
	// Steam positions itself must be left alone, but an unresolved or empty
	// value has to be treated as unpositioned, not skipped. Testing for
	// `static` alone silently skipped the fix wherever getComputedStyle does
	// not resolve a property to its initial value.
	try {
		const view = row.ownerDocument?.defaultView;
		const current = view ? view.getComputedStyle(row).position : '';
		if (!POSITIONED.has(current)) row.style.position = 'relative';
	} catch {
		/* getComputedStyle can throw on a detached node; fall back to
		   positioning the row, which is the common case */
		row.style.position = 'relative';
	}

	badge.style.position = 'absolute';
	badge.style.top = '4px';
	badge.style.right = '4px';
	badge.style.zIndex = '2';
	badge.style.marginLeft = '0';
	badge.style.pointerEvents = 'none';
	badge.style.background = 'rgba(0,0,0,0.82)';
}

/**
 * Generic DOM utility: waits for a selector to appear, up to `timeout` ms.
 *
 * `doc` exists because the Steam client renders its UI into a different
 * document from the one plugin code runs in. Searching the wrong one finds
 * nothing, silently and forever.
 */
export function waitForElement(selector: string, timeout = 6000, doc: Document = document): Promise<Element | null> {
	return new Promise(resolve => {
		const el = doc.querySelector(selector);
		if (el) { resolve(el); return; }
		const obs = new MutationObserver(() => {
			const found = doc.querySelector(selector);
			if (found) { obs.disconnect(); resolve(found); }
		});
		obs.observe(doc.documentElement, { childList: true, subtree: true });
		setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
	});
}

/** The tier's glyph in a tinted square, beside its name. The headline. */
export function createTierChip(tier: string): HTMLElement {
	const cfg = tierCfg(tier);

	const chip = document.createElement('span');
	chip.style.cssText = 'display:inline-flex; align-items:center; gap:7px; flex-shrink:0;';
	chip.title = cfg.description;

	const glyph = document.createElement('span');
	glyph.style.cssText = `
		width:22px; height:22px; border-radius:3px; flex-shrink:0;
		display:flex; align-items:center; justify-content:center;
		background:${cfg.color}; color:rgba(0,0,0,0.75);
		font-size:12px; font-weight:bold;
	`;
	glyph.textContent = cfg.icon;

	const name = document.createElement('span');
	name.style.cssText = 'font-size:15px; font-weight:bold; letter-spacing:0.02em; color:#c6d4df;';
	name.textContent = cfg.label;

	chip.appendChild(glyph);
	chip.appendChild(name);
	return chip;
}

/**
 * The community score as a percentage and a bar.
 *
 * A bar rather than the ring this replaces: the ring restated the tier in a
 * second visual language and cost about 60px of width to do it.
 */
export function createScoreMeter(percent: number, color: string): HTMLElement {
	const wrap = document.createElement('span');
	wrap.style.cssText = 'display:flex; align-items:center; gap:8px; flex:1; min-width:120px;';
	wrap.title = `${percent}% of recent reports rate this game playable`;

	const value = document.createElement('span');
	value.style.cssText = `font-size:13px; font-weight:bold; color:${color}; font-variant-numeric:tabular-nums;`;
	value.textContent = `${percent}%`;

	const track = document.createElement('span');
	track.style.cssText = 'flex:1; min-width:50px; height:5px; border-radius:3px; background:#2a3f5a; overflow:hidden;';

	const fill = document.createElement('span');
	fill.style.cssText = `display:block; height:100%; border-radius:3px; width:${percent}%; background:${color};`;
	track.appendChild(fill);

	wrap.appendChild(value);
	wrap.appendChild(track);
	return wrap;
}

/** The labelled pairs under the headline. */
export function createFactsRow(facts: Fact[]): HTMLElement {
	const row = document.createElement('div');
	row.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px 16px; font-size:11px; color:#8f98a0;';

	for (const fact of facts) {
		const item = document.createElement('span');
		// Label and value as separate nodes so the value can carry its own
		// weight, and no whitespace sits between flex items where it would
		// be trimmed.
		const value = document.createElement('b');
		value.style.cssText = 'color:#c6d4df; font-weight:600;';
		value.textContent = fact.value;

		if (fact.label === 'reports' || fact.label === 'cached') {
			item.appendChild(value);
			item.appendChild(document.createTextNode(` ${fact.label}`));
		} else {
			item.appendChild(document.createTextNode(`${fact.label} `));
			item.appendChild(value);
		}
		row.appendChild(item);
	}

	return row;
}

/** The anticheat status as a self-contained tinted chip. */
export function createAnticheatChip(ac: AnticheatPayload): HTMLElement {
	const cfg = anticheatCfg(ac.status);
	const names = ac.anticheats.length ? ac.anticheats.join(', ') : 'Anticheat';

	const chip = document.createElement('span');
	chip.style.cssText = `
		display:inline-flex; align-items:center; gap:6px; align-self:flex-start;
		padding:3px 8px; border-radius:2px; font-size:11px;
		background:${cfg.color}18; color:${cfg.color};
	`;

	const dot = document.createElement('span');
	dot.style.cssText = `width:7px; height:7px; border-radius:50%; background:${cfg.color}; flex-shrink:0;`;
	chip.appendChild(dot);
	chip.appendChild(document.createTextNode(`${names}\u00a0`));

	const status = document.createElement('b');
	status.style.cssText = 'font-weight:bold;';
	status.textContent = cfg.label;
	chip.appendChild(status);

	if (ac.note) {
		const note = document.createElement(ac.noteUrl ? 'a' : 'span');
		note.style.cssText = 'color:#8f98a0; text-decoration:none; margin-left:2px;';
		note.textContent = `\u00b7 ${ac.note}`;
		if (ac.noteUrl && note instanceof HTMLAnchorElement) {
			note.href = ac.noteUrl;
			note.target = '_blank';
			note.rel = 'noopener noreferrer';
		}
		chip.appendChild(note);
	}

	return chip;
}

/**
 * The banded warning for a reassuring tier over a blocked anticheat.
 *
 * Deliberately the loudest element the widget can draw: it is the one thing
 * here that changes whether the game is worth buying.
 */
export function createConflictStrip(message: string): HTMLElement {
	const strip = document.createElement('div');
	strip.style.cssText = `
		display:flex; gap:8px; align-items:flex-start;
		font-size:11px; font-weight:bold; color:#ff6b6b;
		background:rgba(255,68,68,0.10); border-left:2px solid #ff4444;
		padding:6px 10px;
	`;

	const mark = document.createElement('span');
	mark.textContent = '\u26a0';
	mark.style.cssText = 'flex-shrink:0;';

	const text = document.createElement('span');
	text.textContent = message;

	strip.appendChild(mark);
	strip.appendChild(text);
	return strip;
}
