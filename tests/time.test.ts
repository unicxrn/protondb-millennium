import { describe, expect, it } from 'vitest';
import { isExpired, relativeTime } from '../shared/time';

const NOW = 1_758_240_000_000; // ms
const DAY = 86_400_000;

describe('relativeTime', () => {
	it('formats seconds-based unix timestamps', () => {
		expect(relativeTime(NOW / 1000, NOW)).toBe('today');
	});

	it('formats each bucket boundary', () => {
		expect(relativeTime((NOW - 3 * DAY) / 1000, NOW)).toBe('3d ago');
		expect(relativeTime((NOW - 14 * DAY) / 1000, NOW)).toBe('2wk ago');
		expect(relativeTime((NOW - 60 * DAY) / 1000, NOW)).toBe('2mo ago');
		expect(relativeTime((NOW - 400 * DAY) / 1000, NOW)).toBe('1yr ago');
	});

	it('accepts ISO strings', () => {
		expect(relativeTime(new Date(NOW - 3 * DAY).toISOString(), NOW)).toBe('3d ago');
	});

	it('returns empty string for unparseable or future timestamps', () => {
		expect(relativeTime('not a date', NOW)).toBe('');
		expect(relativeTime((NOW + 5 * DAY) / 1000, NOW)).toBe('');
	});
});

describe('isExpired', () => {
	it('treats an entry inside the ttl as fresh', () => {
		expect(isExpired(NOW / 1000 - 60, 3600, NOW)).toBe(false);
	});

	it('treats an entry past the ttl as expired', () => {
		expect(isExpired(NOW / 1000 - 7200, 3600, NOW)).toBe(true);
	});

	it('treats a zero or missing timestamp as expired', () => {
		expect(isExpired(0, 3600, NOW)).toBe(true);
	});
});
