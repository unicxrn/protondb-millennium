import { hasAnticheatConflict } from './conflict';
import { relativeTime } from './time';
import type { Envelope } from './types';
import { anticheatCfg, tierCfg } from './vocabulary';

/** One labelled pair in the widget's facts row. */
export interface Fact {
	label: string;
	value: string;
}

/**
 * ProtonDB's score as a whole percentage.
 *
 * The API has returned both a 0-1 fraction and an already-scaled percentage,
 * so both are accepted. Returns null when there is no score to show, which is
 * different from a score of zero.
 */
export function scorePercent(score: number | undefined): number | null {
	if (score === undefined || score === null || Number.isNaN(score)) return null;
	const pct = Math.round(score <= 1 ? score * 100 : score);
	return Math.max(0, Math.min(100, pct));
}

/**
 * The labelled pairs shown beneath the headline, in display order.
 *
 * Replaces a single middot-joined sentence. Besides reading better, it removes
 * a rendering bug: the confidence indicator was an element inside a flex row,
 * and the row trimmed the whitespace that followed it, so the line rendered as
 * "confidence· best" with no space.
 *
 * Only facts that say something are included. A trending or best-reported
 * tier identical to the current one is noise, not information.
 */
export function buildFacts(envelope: Envelope, now: number = Date.now()): Fact[] {
	const pdb = envelope.protondb;
	if (!pdb) return [];

	const facts: Fact[] = [];
	const tier = pdb.tier?.toLowerCase();

	if (pdb.total) facts.push({ label: 'reports', value: pdb.total.toLocaleString() });
	if (pdb.confidence) facts.push({ label: 'confidence', value: pdb.confidence });

	if (pdb.lastUpdated !== undefined) {
		const age = relativeTime(pdb.lastUpdated, now);
		if (age) facts.push({ label: 'updated', value: age });
	}

	if (pdb.bestReportedTier && pdb.bestReportedTier.toLowerCase() !== tier) {
		facts.push({ label: 'best', value: tierCfg(pdb.bestReportedTier).label });
	}

	if (pdb.trendingTier && pdb.trendingTier.toLowerCase() !== tier) {
		facts.push({ label: 'trending', value: tierCfg(pdb.trendingTier).label });
	}

	if (pdb.bestSteamVersion) facts.push({ label: 'best with', value: pdb.bestSteamVersion });

	// Staleness belongs with the other facts rather than hidden in the meta
	// line: it qualifies everything above it.
	if (envelope.meta.stale) {
		const age = relativeTime(envelope.meta.fetchedAt, now);
		facts.push({ label: 'cached', value: age || 'earlier' });
	}

	return facts;
}

/**
 * The warning shown when a reassuring tier hides a blocked anticheat.
 *
 * This is the reason the anticheat source exists. ProtonDB tiers lean on
 * singleplayer reports, so a Gold rating can sit above multiplayer that cannot
 * launch at all; the message has to say what will happen, not just name a
 * status. Returns null for every other combination. A Bronze tier with a
 * blocked anticheat surprises nobody.
 */
export function conflictMessage(envelope: Envelope): string | null {
	const pdb = envelope.protondb;
	const ac = envelope.anticheat;
	if (!pdb || !ac) return null;
	if (!hasAnticheatConflict(pdb.tier, ac.status)) return null;

	const names = ac.anticheats.length ? ac.anticheats.join(', ') : 'Anticheat';
	const status = anticheatCfg(ac.status).label.toLowerCase();

	return `Multiplayer will not run. ${names} is ${status} on Proton, so the rating above reflects singleplayer reports.`;
}

/** Colour for the score meter: the tier's own, so the two agree at a glance. */
export function scoreColor(tier: string | undefined): string {
	return tierCfg(tier).color;
}
