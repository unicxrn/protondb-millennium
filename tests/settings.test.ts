import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, parseSettings } from '../shared/settings';

describe('mergeSettings', () => {
	it('returns the defaults for nothing stored', () => {
		expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
		expect(mergeSettings('not an object')).toEqual(DEFAULT_SETTINGS);
	});

	it('applies stored booleans over the defaults', () => {
		expect(mergeSettings({ storePages: false }).storePages).toBe(false);
		expect(mergeSettings({ anticheat: false }).anticheat).toBe(false);
	});

	it('keeps other keys at their defaults when one is set', () => {
		const merged = mergeSettings({ storePages: false });
		expect(merged.libraryPages).toBe(true);
		expect(merged.listBadges).toBe('label');
	});

	it('accepts every valid badge mode', () => {
		expect(mergeSettings({ listBadges: 'dot' }).listBadges).toBe('dot');
		expect(mergeSettings({ listBadges: 'off' }).listBadges).toBe('off');
		expect(mergeSettings({ listBadges: 'label' }).listBadges).toBe('label');
	});

	it('rejects a badge mode it does not recognise', () => {
		expect(mergeSettings({ listBadges: 'enormous' }).listBadges).toBe('label');
	});

	it('rejects a value of the wrong type rather than taking it', () => {
		expect(mergeSettings({ storePages: 'yes' }).storePages).toBe(true);
		expect(mergeSettings({ anticheat: 1 }).anticheat).toBe(true);
	});

	it('falls back per key, not for the whole set', () => {
		const merged = mergeSettings({ storePages: false, listBadges: 'nonsense' });
		expect(merged.storePages).toBe(false);
		expect(merged.listBadges).toBe('label');
	});

	it('does not mutate the defaults', () => {
		mergeSettings({ storePages: false });
		expect(DEFAULT_SETTINGS.storePages).toBe(true);
	});
});

describe('parseSettings', () => {
	it('reads a valid payload', () => {
		expect(parseSettings(JSON.stringify({ listBadges: 'dot' })).listBadges).toBe('dot');
	});

	it('falls back on malformed JSON', () => {
		expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings('')).toEqual(DEFAULT_SETTINGS);
	});
});
