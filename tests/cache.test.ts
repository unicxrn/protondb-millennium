import { beforeEach, describe, expect, it } from 'vitest';
import { LS_PREFIX, lsGet, lsRemove, lsSet, lsSweep } from '../webview/cache';
import type { Envelope } from '../shared/types';

function fakeStorage() {
	const store = new Map<string, string>();
	return {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k),
		key: (i: number) => Array.from(store.keys())[i] ?? null,
		clear: () => store.clear(),
		get length() { return store.size; },
	} as Storage;
}

const NOW = 1_758_240_000_000;

function envelope(fetchedAt: number): Envelope {
	return {
		v: 1,
		protondb: { tier: 'gold' },
		anticheat: null,
		meta: { fetchedAt, stale: false, error: null, protondbError: null, anticheatError: null },
	};
}

beforeEach(() => {
	globalThis.localStorage = fakeStorage();
});

describe('localStorage cache', () => {
	it('round-trips an envelope', () => {
		lsSet('570', envelope(NOW / 1000));
		expect(lsGet('570', NOW)?.protondb?.tier).toBe('gold');
	});

	it('derives expiry from meta.fetchedAt, not its own clock', () => {
		lsSet('570', envelope(NOW / 1000 - 7200));
		expect(lsGet('570', NOW)).toBeNull();
	});

	it('drops the key when it reads an expired entry', () => {
		lsSet('570', envelope(NOW / 1000 - 7200));
		lsGet('570', NOW);
		expect(localStorage.getItem(LS_PREFIX + '570')).toBeNull();
	});

	it('rejects a stored envelope from an older version', () => {
		localStorage.setItem(LS_PREFIX + '570', JSON.stringify({ v: 0, meta: {} }));
		expect(lsGet('570', NOW)).toBeNull();
	});

	it('returns null rather than throwing on corrupt data', () => {
		localStorage.setItem(LS_PREFIX + '570', '{not json');
		expect(lsGet('570', NOW)).toBeNull();
	});

	it('sweeps expired keys that were never re-read', () => {
		lsSet('570', envelope(NOW / 1000 - 7200));
		lsSet('440', envelope(NOW / 1000));
		lsSweep(NOW);
		expect(localStorage.getItem(LS_PREFIX + '570')).toBeNull();
		expect(localStorage.getItem(LS_PREFIX + '440')).not.toBeNull();
	});

	it('leaves unrelated keys alone when sweeping', () => {
		localStorage.setItem('unrelated', 'keep me');
		lsSweep(NOW);
		expect(localStorage.getItem('unrelated')).toBe('keep me');
	});
});

describe('lsRemove', () => {
	it('deletes the stored key', () => {
		lsSet('570', envelope(NOW / 1000));
		lsRemove('570');
		expect(localStorage.getItem(LS_PREFIX + '570')).toBeNull();
	});

	it('is safe to call on a missing key', () => {
		expect(() => lsRemove('570')).not.toThrow();
		expect(localStorage.getItem(LS_PREFIX + '570')).toBeNull();
	});
});
