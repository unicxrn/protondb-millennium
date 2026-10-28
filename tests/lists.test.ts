import { describe, expect, it, vi } from 'vitest';
// parseCachedTiers lives in shared/types.ts, beside the rest of the envelope
// contract, and is re-exported from webview/lists.ts for convenience. It is
// imported from its home here rather than through the re-export.
import { ENVELOPE_VERSION, parseCachedTiers } from '../shared/types';

describe('parseCachedTiers', () => {
	it('reads tiers out of a valid payload', () => {
		const raw = JSON.stringify({ v: ENVELOPE_VERSION, tiers: { '570': { tier: 'gold' }, '620': { tier: 'platinum' } } });
		expect(parseCachedTiers(raw)).toEqual({ '570': { tier: 'gold' }, '620': { tier: 'platinum' } });
	});

	it('returns an empty object on a version mismatch', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const raw = JSON.stringify({ v: ENVELOPE_VERSION + 1, tiers: { '570': { tier: 'gold' } } });
		expect(parseCachedTiers(raw)).toEqual({});
		warn.mockRestore();
	});

	it('warns on a version mismatch so a stale frontend build is visible', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const raw = JSON.stringify({ v: ENVELOPE_VERSION + 1, tiers: {} });

		parseCachedTiers(raw);

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toContain('version mismatch');
		warn.mockRestore();
	});

	it('does not warn when the version matches', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		parseCachedTiers(JSON.stringify({ v: ENVELOPE_VERSION, tiers: {} }));
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it('returns an empty object for malformed JSON', () => {
		expect(parseCachedTiers('not json at all')).toEqual({});
	});

	it('returns an empty object for truncated JSON', () => {
		expect(parseCachedTiers('{"v":1,"tiers":{')).toEqual({});
	});

	it('returns an empty object when tiers is missing', () => {
		expect(parseCachedTiers(JSON.stringify({ v: ENVELOPE_VERSION }))).toEqual({});
	});

	it('returns an empty object when tiers is not an object', () => {
		expect(parseCachedTiers(JSON.stringify({ v: ENVELOPE_VERSION, tiers: 'nope' }))).toEqual({});
	});

	it('returns an empty object when tiers is null', () => {
		expect(parseCachedTiers(JSON.stringify({ v: ENVELOPE_VERSION, tiers: null }))).toEqual({});
	});

	it('returns an empty object for a top-level non-object payload', () => {
		expect(parseCachedTiers('42')).toEqual({});
		expect(parseCachedTiers('null')).toEqual({});
		expect(parseCachedTiers('"a string"')).toEqual({});
	});
});
