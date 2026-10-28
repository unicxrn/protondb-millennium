import { playSectionClasses } from 'millennium';
import { useEffect, useState } from 'react';
import { hasAnticheatConflict } from '../shared/conflict';
import { DEFAULT_SETTINGS, loadSettings, type Settings } from '../shared/settings';
import { parseEnvelope, type Envelope } from '../shared/types';
import { anticheatCfg, tierCfg } from '../shared/vocabulary';
import { scorePercent } from '../shared/widget-model';

/**
 * Marks the stat Steam renders for us, so the DOM-observing fallback in
 * ./library.tsx can tell the patch worked and stay out of the way.
 */
export const NATIVE_STAT_CLASS = 'protondb-native-stat';

/** A short summary for the hover tooltip; the row itself has space for one fact. */
function tooltip(envelope: Envelope): string {
	const pdb = envelope.protondb;
	if (!pdb) return 'ProtonDB: no reports yet';

	const cfg = tierCfg(pdb.tier);
	const parts: string[] = [cfg.description || cfg.label];

	const percent = scorePercent(pdb.score);
	if (percent !== null) parts.push(`${percent}% score`);
	if (pdb.total) parts.push(`${pdb.total.toLocaleString()} reports`);

	if (envelope.anticheat) {
		const names = envelope.anticheat.anticheats.join(', ') || 'Anticheat';
		parts.push(`${names}: ${anticheatCfg(envelope.anticheat.status).label}`);
	}

	if (envelope.meta.stale) parts.push('cached');
	return `ProtonDB: ${parts.join(' · ')}`;
}

/**
 * The ProtonDB rating as one more stat in the library play bar.
 *
 * Rendered by Steam itself: a `[patches]` entry appends a call to this export
 * into the children of Steam's own stats row, so it inherits that row's
 * layout and lifecycle instead of being injected beside it. Every earlier
 * attempt to put it there from the outside either never rendered or remounted
 * the library page.
 *
 * Returns null for anything it cannot show. It runs inside Steam's render
 * tree, so it must never throw and never block.
 */
export function LibraryProtonDBStat(props: any): any {
	const appId = String(props?.details?.unAppID ?? props?.appid ?? '');

	const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
	const [envelope, setEnvelope] = useState<Envelope | null>(null);

	useEffect(() => {
		let cancelled = false;
		if (!appId || appId === 'undefined') return undefined;

		void (async () => {
			try {
				const loaded = await loadSettings();
				if (cancelled) return;
				setSettings(loaded);
				if (!loaded.libraryPages) return;

				const parsed = parseEnvelope(await backend.fetch_app_data(appId, false));
				if (!cancelled) setEnvelope(parsed);
			} catch {
				/* a stat that cannot load simply does not render */
			}
		})();

		return () => { cancelled = true; };
	}, [appId]);

	const pdb = envelope?.protondb;
	if (!settings.libraryPages || !envelope || !pdb) return null;

	const cfg = tierCfg(pdb.tier);
	const blocked =
		settings.anticheat &&
		settings.conflictWarning &&
		!!envelope.anticheat &&
		hasAnticheatConflict(pdb.tier, envelope.anticheat.status);

	const color = blocked ? '#ff4444' : cfg.color;
	const classes = playSectionClasses ?? ({} as Record<string, string>);

	return (
		<div
			className={[classes.GameStat, NATIVE_STAT_CLASS].filter(Boolean).join(' ')}
			title={tooltip(envelope)}
		>
			<div className={classes.GameStatIcon} style={{ color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
				{cfg.icon}
			</div>
			<div>
				<div className={classes.PlayBarLabel}>ProtonDB</div>
				<div className={classes.PlayBarDetailLabel} style={{ color, fontWeight: 'bold' }}>
					{blocked ? `${cfg.label} ⚠` : cfg.label}
				</div>
			</div>
		</div>
	);
}
