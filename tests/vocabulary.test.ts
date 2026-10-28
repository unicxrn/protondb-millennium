import { describe, expect, it } from 'vitest';
import { ANTICHEAT_CONFIG, TIER_CONFIG, anticheatCfg, tierCfg } from '../shared/vocabulary';

describe('tierCfg', () => {
	it('resolves every known tier', () => {
		for (const tier of Object.keys(TIER_CONFIG)) {
			expect(tierCfg(tier).label.length).toBeGreaterThan(0);
		}
	});

	it('is case insensitive', () => {
		expect(tierCfg('GOLD').label).toBe('Gold');
	});

	it('falls back for an unknown tier without throwing', () => {
		const cfg = tierCfg('sparkly');
		expect(cfg.color).toBe('#888888');
		expect(cfg.label).toBe('sparkly');
	});

	it('falls back for an empty tier', () => {
		expect(tierCfg('').label).toBe('Unknown');
	});
});

describe('anticheatCfg', () => {
	it('resolves every known status', () => {
		for (const status of Object.keys(ANTICHEAT_CONFIG)) {
			expect(anticheatCfg(status).label.length).toBeGreaterThan(0);
		}
	});

	it('marks Denied and Broken as blocking', () => {
		expect(anticheatCfg('Denied').blocking).toBe(true);
		expect(anticheatCfg('Broken').blocking).toBe(true);
	});

	it('does not mark Supported or Running as blocking', () => {
		expect(anticheatCfg('Supported').blocking).toBe(false);
		expect(anticheatCfg('Running').blocking).toBe(false);
	});

	it('falls back for an unknown status', () => {
		expect(anticheatCfg('Wobbly').color).toBe('#888888');
	});
});

describe('pending, the tier for a game with too few reports', () => {
	it('is styled like a real tier rather than an unknown one', () => {
		// ProtonDB returns this for unreleased and very quiet games, and it
		// showed up verbatim and lowercase beside Title Case tiers.
		expect(tierCfg('pending').label).toBe('Pending');
		expect(tierCfg('pending').description).toBeTruthy();
	});

	it('still falls back for a tier nobody has seen before', () => {
		expect(tierCfg('quicksilver').label).toBe('quicksilver');
	});
});
