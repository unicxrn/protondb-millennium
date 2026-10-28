import { describe, expect, it } from 'vitest';
import { appIdFromRowData, groupRowsByAppId, resolveRowAppId } from '../shared/list-row';

describe('appIdFromRowData', () => {
	it('yields the id for a plain app row', () => {
		expect(appIdFromRowData('620', 'App_620')).toBe('620');
	});

	it('accepts a valid appid with a missing itemkey', () => {
		// Some surfaces omit data-ds-itemkey entirely.
		expect(appIdFromRowData('620', null)).toBe('620');
	});

	it('rejects a Bundle_ itemkey', () => {
		expect(appIdFromRowData('620', 'Bundle_620')).toBeNull();
	});

	it('rejects a Sub_ (package) itemkey', () => {
		expect(appIdFromRowData('620', 'Sub_620')).toBeNull();
	});

	it('rejects a comma-separated appid', () => {
		expect(appIdFromRowData('620,630', 'App_620')).toBeNull();
	});

	it('rejects a non-numeric appid', () => {
		expect(appIdFromRowData('abc', 'App_620')).toBeNull();
	});

	it('rejects a null appid', () => {
		expect(appIdFromRowData(null, 'App_620')).toBeNull();
	});

	it('rejects an empty-string appid', () => {
		expect(appIdFromRowData('', 'App_620')).toBeNull();
	});
});

describe('groupRowsByAppId', () => {
	it('keeps every row for a repeated appid rather than only the last', () => {
		// The regression this guards against: a naive
		// `new Map(rows.map(r => [r.appId, r.row]))` keeps only the last row
		// for a repeated appid, e.g. the same game in two carousels, so an
		// earlier duplicate is never observed and never gets decorated.
		const grouped = groupRowsByAppId([
			{ row: 'carousel-row', appId: '570' },
			{ row: 'search-row', appId: '620' },
			{ row: 'second-carousel-row', appId: '570' },
		]);

		expect(grouped.get('570')).toEqual(['carousel-row', 'second-carousel-row']);
		expect(grouped.get('620')).toEqual(['search-row']);
	});

	it('preserves row order within a group', () => {
		const grouped = groupRowsByAppId([
			{ row: 'a', appId: '1' },
			{ row: 'b', appId: '1' },
			{ row: 'c', appId: '1' },
		]);
		expect(grouped.get('1')).toEqual(['a', 'b', 'c']);
	});

	it('returns an empty map for no rows', () => {
		expect(groupRowsByAppId([]).size).toBe(0);
	});

	it('produces one entry per unique appid when there are no duplicates', () => {
		const grouped = groupRowsByAppId([
			{ row: 'a', appId: '1' },
			{ row: 'b', appId: '2' },
		]);
		expect(grouped.size).toBe(2);
		expect(grouped.get('1')).toEqual(['a']);
		expect(grouped.get('2')).toEqual(['b']);
	});
});

describe('resolveRowAppId', () => {
	it('reads the search-result attribute', () => {
		expect(resolveRowAppId({ dsAppId: '620', itemKey: 'App_620' })).toBe('620');
	});

	it('reads the wishlist attribute', () => {
		expect(resolveRowAppId({ appId: '413150' })).toBe('413150');
	});

	it('falls back to the row link when no attribute identifies it', () => {
		expect(resolveRowAppId({ href: 'https://store.steampowered.com/app/570/Dota_2/' })).toBe('570');
		expect(resolveRowAppId({ href: 'https://store.steampowered.com/app/570' })).toBe('570');
		expect(resolveRowAppId({ href: 'https://store.steampowered.com/app/570?snr=1' })).toBe('570');
	});

	it('prefers an attribute over the link', () => {
		expect(resolveRowAppId({ dsAppId: '620', href: '/app/570/' })).toBe('620');
	});

	it('refuses a bundle however it identifies itself', () => {
		expect(resolveRowAppId({ dsAppId: '620', itemKey: 'Bundle_123' })).toBeNull();
		expect(resolveRowAppId({ appId: '620', itemKey: 'Sub_9' })).toBeNull();
		expect(resolveRowAppId({ href: '/app/620/', itemKey: 'Bundle_1' })).toBeNull();
	});

	it('refuses a multi-app row', () => {
		expect(resolveRowAppId({ dsAppId: '1,2,3' })).toBeNull();
	});

	it('refuses a non-numeric id and ignores a non-app link', () => {
		expect(resolveRowAppId({ dsAppId: 'abc' })).toBeNull();
		expect(resolveRowAppId({ href: 'https://store.steampowered.com/bundle/123/' })).toBeNull();
		expect(resolveRowAppId({})).toBeNull();
	});
});

describe('rows Steam marks with an appid that is not a game', () => {
	it('rejects appid 0, which front-page promo banners carry', () => {
		// The takeunder banner on the store front is <a data-ds-appid="0">
		// linking to a sale. Accepting it spends a fetch to learn nothing.
		expect(resolveRowAppId({ dsAppId: '0' })).toBeNull();
		expect(resolveRowAppId({ appId: '0' })).toBeNull();
		expect(resolveRowAppId({ dsAppId: '000' })).toBeNull();
	});

	it('still falls through to the link when the attribute is zero', () => {
		expect(resolveRowAppId({ dsAppId: '0', href: '/app/620/Portal_2/' })).toBe('620');
	});

	it('does not reject an appid that merely contains a zero', () => {
		expect(resolveRowAppId({ dsAppId: '620' })).toBe('620');
		expect(resolveRowAppId({ dsAppId: '1030' })).toBe('1030');
		expect(resolveRowAppId({ dsAppId: '10' })).toBe('10');
	});
});

describe('item key shapes', () => {
	it('accepts the store-page form', () => {
		expect(resolveRowAppId({ dsAppId: '620', itemKey: 'App_620' })).toBe('620');
	});

	it('accepts the autocomplete form, where 0 is the app item type', () => {
		// store.steampowered.com/search/suggest writes `0_<appid>`. Rejecting
		// it meant the search box dropdown never showed a badge.
		expect(resolveRowAppId({ dsAppId: '3768760', itemKey: '0_3768760' })).toBe('3768760');
	});

	it('still rejects packages and bundles in either form', () => {
		expect(resolveRowAppId({ dsAppId: '620', itemKey: 'Sub_12345' })).toBeNull();
		expect(resolveRowAppId({ dsAppId: '620', itemKey: 'Bundle_678' })).toBeNull();
		expect(resolveRowAppId({ dsAppId: '620', itemKey: '1_12345' })).toBeNull();
		expect(resolveRowAppId({ dsAppId: '620', itemKey: '2_678' })).toBeNull();
	});

	it('rejects an unrecognised shape rather than assuming it is an app', () => {
		// A missing badge is invisible; a wrong one is a lie.
		expect(resolveRowAppId({ dsAppId: '620', itemKey: 'Whatever_620' })).toBeNull();
		expect(resolveRowAppId({ dsAppId: '620', itemKey: '0_' })).toBeNull();
	});
});
