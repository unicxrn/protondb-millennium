import { describe, expect, it } from 'vitest';
import { hasAnticheatConflict } from '../shared/conflict';

describe('hasAnticheatConflict', () => {
	it('fires for exactly the four blocking combinations', () => {
		expect(hasAnticheatConflict('platinum', 'Denied')).toBe(true);
		expect(hasAnticheatConflict('platinum', 'Broken')).toBe(true);
		expect(hasAnticheatConflict('gold', 'Denied')).toBe(true);
		expect(hasAnticheatConflict('gold', 'Broken')).toBe(true);
	});

	it('stays quiet for lower tiers, where a blocked anticheat is unsurprising', () => {
		expect(hasAnticheatConflict('silver', 'Denied')).toBe(false);
		expect(hasAnticheatConflict('bronze', 'Broken')).toBe(false);
		expect(hasAnticheatConflict('borked', 'Denied')).toBe(false);
	});

	it('stays quiet for non-blocking statuses', () => {
		expect(hasAnticheatConflict('gold', 'Supported')).toBe(false);
		expect(hasAnticheatConflict('gold', 'Running')).toBe(false);
		expect(hasAnticheatConflict('gold', 'Planned')).toBe(false);
	});

	it('is case insensitive on both arguments', () => {
		expect(hasAnticheatConflict('GOLD', 'denied')).toBe(true);
	});

	it('stays quiet when either side is missing', () => {
		expect(hasAnticheatConflict(undefined, 'Denied')).toBe(false);
		expect(hasAnticheatConflict('gold', undefined)).toBe(false);
		expect(hasAnticheatConflict(undefined, undefined)).toBe(false);
	});
});
