import type { AnticheatPayload } from '../shared/types';
import { describe, expect, it } from 'vitest';
import type { Envelope, ProtonDBPayload } from '../shared/types';
import { buildFacts, conflictMessage, scorePercent } from '../shared/widget-model';

const NOW = 1_758_240_000_000;
const DAY = 86_400_000;

function env(protondb: ProtonDBPayload | null, extra: Partial<Envelope> = {}): Envelope {
	return {
		v: 1,
		protondb,
		anticheat: null,
		meta: { fetchedAt: NOW / 1000, stale: false, error: null, protondbError: null, anticheatError: null },
		...extra,
	};
}

describe('scorePercent', () => {
	it('scales a 0-1 fraction', () => {
		expect(scorePercent(0.73)).toBe(73);
	});

	it('passes through an already-scaled percentage', () => {
		expect(scorePercent(73)).toBe(73);
	});

	it('distinguishes a zero score from no score', () => {
		expect(scorePercent(0)).toBe(0);
		expect(scorePercent(undefined)).toBeNull();
	});

	it('clamps out-of-range values rather than drawing past the bar', () => {
		expect(scorePercent(140)).toBe(100);
		expect(scorePercent(-5)).toBe(0);
	});
});

describe('buildFacts', () => {
	it('returns nothing when there is no payload', () => {
		expect(buildFacts(env(null), NOW)).toEqual([]);
	});

	it('formats report counts with separators', () => {
		const facts = buildFacts(env({ tier: 'gold', total: 1204 }), NOW);
		expect(facts).toContainEqual({ label: 'reports', value: '1,204' });
	});

	it('omits a trending tier identical to the current one', () => {
		const facts = buildFacts(env({ tier: 'gold', trendingTier: 'gold' }), NOW);
		expect(facts.find(f => f.label === 'trending')).toBeUndefined();
	});

	it('includes a trending tier that differs', () => {
		const facts = buildFacts(env({ tier: 'gold', trendingTier: 'platinum' }), NOW);
		expect(facts).toContainEqual({ label: 'trending', value: 'Platinum' });
	});

	it('omits a best-reported tier identical to the current one', () => {
		const facts = buildFacts(env({ tier: 'platinum', bestReportedTier: 'platinum' }), NOW);
		expect(facts.find(f => f.label === 'best')).toBeUndefined();
	});

	it('reports age only when it can be expressed', () => {
		const withAge = buildFacts(env({ tier: 'gold', lastUpdated: (NOW - 3 * DAY) / 1000 }), NOW);
		expect(withAge).toContainEqual({ label: 'updated', value: '3d ago' });

		const future = buildFacts(env({ tier: 'gold', lastUpdated: (NOW + 5 * DAY) / 1000 }), NOW);
		expect(future.find(f => f.label === 'updated')).toBeUndefined();
	});

	it('surfaces staleness as its own fact', () => {
		const stale = env({ tier: 'gold' }, {
			meta: { fetchedAt: (NOW - 3 * DAY) / 1000, stale: true, error: 'network', protondbError: 'network', anticheatError: null },
		});
		expect(buildFacts(stale, NOW)).toContainEqual({ label: 'cached', value: '3d ago' });
	});

	it('keeps display order stable', () => {
		const facts = buildFacts(env({
			tier: 'gold',
			total: 10,
			confidence: 'high',
			lastUpdated: (NOW - DAY) / 1000,
			bestReportedTier: 'platinum',
			bestSteamVersion: 'Proton 9.0',
		}), NOW);
		expect(facts.map(f => f.label)).toEqual(['reports', 'confidence', 'updated', 'best', 'best with']);
	});
});

describe('conflictMessage', () => {
	const denied: AnticheatPayload = {
		status: 'Denied',
		anticheats: ['EA anticheat'],
		note: null,
		noteUrl: null,
		dateChanged: null,
	};

	it('explains what will happen when a high tier hides a blocked anticheat', () => {
		const message = conflictMessage(env({ tier: 'gold' }, { anticheat: denied }));
		expect(message).toContain('Multiplayer will not run');
		expect(message).toContain('EA anticheat');
		expect(message).toContain('denied');
	});

	it('stays silent for a tier that already warns the user', () => {
		expect(conflictMessage(env({ tier: 'bronze' }, { anticheat: denied }))).toBeNull();
		expect(conflictMessage(env({ tier: 'borked' }, { anticheat: denied }))).toBeNull();
	});

	it('stays silent when the anticheat works', () => {
		const supported = { ...denied, status: 'Supported' };
		expect(conflictMessage(env({ tier: 'gold' }, { anticheat: supported }))).toBeNull();
	});

	it('stays silent when either side is missing', () => {
		expect(conflictMessage(env({ tier: 'gold' }))).toBeNull();
		expect(conflictMessage(env(null, { anticheat: denied }))).toBeNull();
	});

	it('falls back to a generic name when none is listed', () => {
		const unnamed: AnticheatPayload = { ...denied, anticheats: [] };
		expect(conflictMessage(env({ tier: 'gold' }, { anticheat: unnamed }))).toContain('Anticheat is denied');
	});
});
