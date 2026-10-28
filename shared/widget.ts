import type { Envelope } from './types';
import { tierCfg } from './vocabulary';
import { buildFacts, conflictMessage, scoreColor, scorePercent } from './widget-model';
import {
	PANEL_STYLE,
	createAnticheatChip,
	createConflictStrip,
	createFactsRow,
	createHeading,
	createScoreMeter,
	createTextButton,
	createTierChip,
} from './dom';

export const WIDGET_ID = 'protondb-badge';

export interface WidgetOptions {
	/** Whether this game ships a native Linux build. Each surface detects this differently. */
	isNative?: boolean;
	/** Show the anticheat chip. Off hides it everywhere, including the warning. */
	showAnticheat?: boolean;
	/** Show the blocked-multiplayer warning. Requires showAnticheat. */
	showConflictWarning?: boolean;
}

function panel(): HTMLElement {
	const el = document.createElement('div');
	el.id = WIDGET_ID;
	el.style.cssText = PANEL_STYLE;
	return el;
}



/** Compact row for when there is nothing to show and something went wrong. */
export function createErrorWidget(onRetry: () => void, reason?: string | null): HTMLElement {
	const el = panel();
	el.appendChild(createHeading());

	const row = document.createElement('div');
	row.style.cssText = `
		display:flex; align-items:center; justify-content:space-between;
		background:rgba(0,0,0,0.15); padding:10px 14px; gap:12px;
	`;

	const text = document.createElement('div');
	text.style.cssText = 'min-width:0;';

	const msg = document.createElement('div');
	msg.style.cssText = 'font-size:12px; color:#6a7480;';
	msg.textContent = 'ProtonDB is unreachable right now';
	text.appendChild(msg);

	// An error that names its own cause saves a round trip through the logs,
	// which for a webview are not visible in Millennium's plugin log panel.
	if (reason) {
		const detail = document.createElement('div');
		detail.style.cssText = 'font-size:10px; color:#55606c; margin-top:3px; word-break:break-word;';
		detail.textContent = reason;
		text.appendChild(detail);
	}

	row.appendChild(text);
	row.appendChild(createTextButton('Retry', onRetry));
	el.appendChild(row);
	return el;
}

/** The "no reports yet" state: ProtonDB has no entry, and nothing failed. */
export function createNoReportsWidget(appId: string, envelope: Envelope, options: WidgetOptions = {}): HTMLElement {
	const el = panel();
	el.appendChild(createHeading());

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
	msg.textContent = 'No ProtonDB reports yet - be the first to submit';
	left.appendChild(logo);
	left.appendChild(msg);

	const btn = document.createElement('a');
	btn.href = `https://www.protondb.com/app/${appId}`;
	btn.target = '_blank';
	btn.rel = 'noopener noreferrer';
	btn.style.cssText = `
		color:#4c6b8a; font-size:11px; font-weight:bold;
		text-decoration:none; white-space:nowrap; flex-shrink:0;
	`;
	btn.textContent = 'Submit report ↗';
	btn.addEventListener('mouseenter', () => { btn.style.color = '#5d7fa3'; });
	btn.addEventListener('mouseleave', () => { btn.style.color = '#4c6b8a'; });

	row.appendChild(left);
	row.appendChild(btn);
	el.appendChild(row);

	// Games with no ProtonDB reports are exactly the population most likely
	// to be anticheat-blocked, so an available answer must still surface here.
	if (envelope.anticheat && options.showAnticheat !== false) {
		const chipRow = document.createElement('div');
		chipRow.style.cssText = 'display:flex; padding:8px 14px 0;';
		chipRow.appendChild(createAnticheatChip(envelope.anticheat));
		el.appendChild(chipRow);
	}

	return el;
}

/**
 * The full widget: tier, score, facts, and any anticheat warning.
 *
 * Laid out as one headline row (what the verdict is) over supporting detail,
 * rather than the previous arrangement where a score ring and a trending pill
 * restated the tier in two more visual languages. Assumes envelope.protondb
 * is non-null; the caller picks the no-reports and error widgets.
 */
export function createWidget(appId: string, envelope: Envelope, onRetry: () => void, options: WidgetOptions = {}): HTMLElement {
	const pdb = envelope.protondb!;
	const cfg = tierCfg(pdb.tier);

	const el = panel();
	el.appendChild(createHeading());

	const card = document.createElement('div');
	card.style.cssText = `
		display:flex; flex-direction:column; gap:9px;
		background:rgba(0,0,0,0.22); border-left:3px solid ${cfg.color};
		padding:11px 14px;
	`;

	// ── headline: the verdict, its score, and the way out ──────────────
	const top = document.createElement('div');
	top.style.cssText = 'display:flex; align-items:center; gap:14px; flex-wrap:wrap;';
	top.appendChild(createTierChip(pdb.tier));

	if (options.isNative) {
		const native = document.createElement('span');
		native.title = 'This game ships a native Linux build';
		native.style.cssText = `
			display:inline-flex; align-items:center; gap:4px; flex-shrink:0;
			background:#1a3a1a; border:1px solid #4caf5088; border-radius:2px;
			padding:1px 6px; font-size:10px; font-weight:bold; color:#4caf50;
		`;
		native.textContent = 'Native Linux';
		top.appendChild(native);
	}

	const percent = scorePercent(pdb.score);
	if (percent !== null) top.appendChild(createScoreMeter(percent, scoreColor(pdb.tier)));

	if (envelope.meta.error) top.appendChild(createTextButton('Retry', onRetry));

	const link = document.createElement('a');
	link.href = `https://www.protondb.com/app/${appId}`;
	link.target = '_blank';
	link.rel = 'noopener noreferrer';
	link.style.cssText = `
		background:#4c6b8a; color:#c6d4df; padding:7px 14px; border-radius:2px;
		font-size:12px; font-weight:bold; text-decoration:none; white-space:nowrap; flex-shrink:0;
	`;
	link.textContent = 'View on ProtonDB';
	link.addEventListener('mouseenter', () => { link.style.background = '#5d7fa3'; });
	link.addEventListener('mouseleave', () => { link.style.background = '#4c6b8a'; });
	top.appendChild(link);

	card.appendChild(top);

	// ── supporting detail, each piece only when it says something ──────
	const facts = buildFacts(envelope);
	if (facts.length) card.appendChild(createFactsRow(facts));

	const showAnticheat = options.showAnticheat !== false;
	if (showAnticheat && envelope.anticheat) {
		card.appendChild(createAnticheatChip(envelope.anticheat));
	}

	if (showAnticheat && options.showConflictWarning !== false) {
		const warning = conflictMessage(envelope);
		if (warning) card.appendChild(createConflictStrip(warning));
	}

	el.appendChild(card);
	return el;
}
