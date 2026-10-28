import { describe, expect, it } from 'vitest';
import { ENVELOPE_VERSION, parseCachedTiers, parseEnvelope, type Envelope } from '../shared/types';

const valid = JSON.stringify({
	v: 1,
	protondb: { tier: 'gold', score: 0.84 },
	anticheat: null,
	meta: { fetchedAt: 1758240000, stale: false, error: null },
});

describe('parseEnvelope', () => {
	it('parses a valid envelope', () => {
		const result = parseEnvelope(valid);
		expect(result?.protondb?.tier).toBe('gold');
		expect(result?.meta.fetchedAt).toBe(1758240000);
	});

	it('rejects an envelope from an older version', () => {
		const stale = JSON.stringify({ v: 0, protondb: null, anticheat: null, meta: {} });
		expect(parseEnvelope(stale)).toBeNull();
	});

	it('rejects malformed JSON', () => {
		expect(parseEnvelope('{not json')).toBeNull();
	});

	it('rejects an envelope with no meta block', () => {
		expect(parseEnvelope(JSON.stringify({ v: 1, protondb: null, anticheat: null }))).toBeNull();
	});

	it('exposes the current version', () => {
		expect(ENVELOPE_VERSION).toBe(1);
	});

	it('defaults protondbError and anticheatError to null when absent', () => {
		const result = parseEnvelope(valid);
		expect(result?.meta.protondbError).toBeNull();
		expect(result?.meta.anticheatError).toBeNull();
	});

	it('carries per-source error fields when present', () => {
		const envelope = JSON.stringify({
			v: 1,
			protondb: null,
			anticheat: null,
			meta: { fetchedAt: 1758240000, stale: true, error: 'network', protondbError: 'network', anticheatError: null },
		});
		const result = parseEnvelope(envelope);
		expect(result?.meta.protondbError).toBe('network');
		expect(result?.meta.anticheatError).toBeNull();
	});
});

describe('parseEnvelope: malformed protondb payload', () => {
	it('treats a protondb of {} as null rather than crashing downstream', () => {
		const envelope = JSON.stringify({
			v: 1,
			protondb: {},
			anticheat: null,
			meta: { fetchedAt: 1758240000, stale: false, error: null },
		});
		expect(parseEnvelope(envelope)?.protondb).toBeNull();
	});

	it('keeps a protondb payload that has a usable tier', () => {
		const envelope = JSON.stringify({
			v: 1,
			protondb: { tier: 'gold' },
			anticheat: null,
			meta: { fetchedAt: 1758240000, stale: false, error: null },
		});
		expect(parseEnvelope(envelope)?.protondb).toEqual({ tier: 'gold' });
	});
});

describe('parseEnvelope: malformed anticheat payload', () => {
	it('normalises anticheats arriving as an object (lua-cjson {} for an empty table) to []', () => {
		const envelope = JSON.stringify({
			v: 1,
			protondb: null,
			anticheat: { status: 'Denied', anticheats: {}, note: null, noteUrl: null, dateChanged: null },
			meta: { fetchedAt: 1758240000, stale: false, error: null },
		});
		const result = parseEnvelope(envelope);
		expect(result?.anticheat?.anticheats).toEqual([]);
	});

	it('defaults missing note, noteUrl, and dateChanged to null', () => {
		const envelope = JSON.stringify({
			v: 1,
			protondb: null,
			anticheat: { status: 'Denied', anticheats: ['EAC'] },
			meta: { fetchedAt: 1758240000, stale: false, error: null },
		});
		const result = parseEnvelope(envelope);
		expect(result?.anticheat?.note).toBeNull();
		expect(result?.anticheat?.noteUrl).toBeNull();
		expect(result?.anticheat?.dateChanged).toBeNull();
	});
});

describe('replies that arrive already deserialised', () => {
	// starlight's bridge parses the Lua side's JSON on the way across, so a
	// caller receives an object where the legacy bridge handed over a string.
	const envelope: Envelope = {
		v: 1,
		protondb: { tier: 'gold', score: 0.84 },
		anticheat: null,
		meta: {
			fetchedAt: 1758240000,
			stale: false,
			error: null,
			protondbError: null,
			anticheatError: null,
		},
	};

	it('accepts an envelope object', () => {
		expect(parseEnvelope(envelope)?.protondb?.tier).toBe('gold');
	});

	it('accepts the same envelope as text', () => {
		expect(parseEnvelope(JSON.stringify(envelope))?.protondb?.tier).toBe('gold');
	});

	it('still rejects a version it does not understand, either way', () => {
		expect(parseEnvelope({ ...envelope, v: 0 })).toBeNull();
		expect(parseEnvelope(JSON.stringify({ ...envelope, v: 0 }))).toBeNull();
	});

	it('rejects nothing at all', () => {
		expect(parseEnvelope(undefined)).toBeNull();
		expect(parseEnvelope(null)).toBeNull();
	});

	it('reads cached tiers from an object as well as text', () => {
		const payload = { v: ENVELOPE_VERSION, tiers: { '570': { tier: 'gold' } } };
		expect(parseCachedTiers(payload)['570']).toEqual({ tier: 'gold' });
		expect(parseCachedTiers(JSON.stringify(payload))['570']).toEqual({ tier: 'gold' });
	});
});
