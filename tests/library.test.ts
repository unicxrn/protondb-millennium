import { describe, expect, it } from 'vitest';
import { anchorSelectors, appIdFromArtworkUrl, appIdFromLibraryPath } from '../shared/library-anchor';

describe('anchorSelectors', () => {
	it('prefixes each resolved class name with a dot, preserving order', () => {
		expect(anchorSelectors(['GameInfoContainer', 'AppDetailsContent'])).toEqual([
			'.GameInfoContainer',
			'.AppDetailsContent',
		]);
	});

	it('drops undefined entries', () => {
		expect(anchorSelectors(['GameInfoContainer', undefined, 'AppDetailsContent'])).toEqual([
			'.GameInfoContainer',
			'.AppDetailsContent',
		]);
	});

	it('drops empty-string entries', () => {
		expect(anchorSelectors(['GameInfoContainer', '', 'AppDetailsContent'])).toEqual([
			'.GameInfoContainer',
			'.AppDetailsContent',
		]);
	});

	it('returns an empty list when nothing resolved', () => {
		expect(anchorSelectors([undefined, ''])).toEqual([]);
	});

	it('returns an empty list for an empty input', () => {
		expect(anchorSelectors([])).toEqual([]);
	});
});

describe('appIdFromLibraryPath', () => {
	it('extracts the appid from a bare app path', () => {
		expect(appIdFromLibraryPath('/library/app/570')).toBe('570');
	});

	it('extracts the appid from an app path with a trailing slash', () => {
		expect(appIdFromLibraryPath('/library/app/570/')).toBe('570');
	});

	it('extracts the appid from an app path with a trailing sub-route', () => {
		expect(appIdFromLibraryPath('/library/app/570/achievements')).toBe('570');
	});

	it('returns null for the library home', () => {
		expect(appIdFromLibraryPath('/library/home')).toBeNull();
	});

	it('returns null when the appid is missing', () => {
		expect(appIdFromLibraryPath('/library/app/')).toBeNull();
	});

	it('returns null for an empty path', () => {
		expect(appIdFromLibraryPath('')).toBeNull();
	});
});

describe('appIdFromArtworkUrl', () => {
	it('reads the appid from Steam CDN artwork', () => {
		expect(appIdFromArtworkUrl('https://cdn.cloudflare.steamstatic.com/steam/apps/570/header.jpg')).toBe('570');
	});

	it('reads it from a library asset path', () => {
		expect(appIdFromArtworkUrl('https://steamloopback.host/assets/1517290/library_hero.jpg')).toBe('1517290');
	});

	it('accepts an underscore delimiter', () => {
		expect(appIdFromArtworkUrl('https://x/assets/413150_library.jpg')).toBe('413150');
	});

	it('ignores urls with no app segment', () => {
		expect(appIdFromArtworkUrl('https://cdn.example.com/images/2024/banner.jpg')).toBeNull();
		expect(appIdFromArtworkUrl('')).toBeNull();
	});

	it('does not treat an arbitrary number as an appid', () => {
		expect(appIdFromArtworkUrl('https://x/other/570/header.jpg')).toBeNull();
	});
});
