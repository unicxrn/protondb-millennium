export const ENVELOPE_VERSION = 1;

export type AnticheatStatus = 'Supported' | 'Running' | 'Planned' | 'Broken' | 'Denied';

export interface ProtonDBPayload {
	tier: string;
	score?: number;
	confidence?: string;
	total?: number;
	trendingTier?: string;
	bestReportedTier?: string;
	lastUpdated?: string | number;
	bestSteamVersion?: string;
}

export interface AnticheatPayload {
	status: AnticheatStatus | string;
	anticheats: string[];
	note: string | null;
	noteUrl: string | null;
	dateChanged: string | null;
}

/** Unix seconds, matching Lua's os.time(). */
export interface EnvelopeMeta {
	fetchedAt: number;
	stale: boolean;
	error: string | null;
	/** Set independently so the frontend can name the source that actually failed. */
	protondbError: string | null;
	anticheatError: string | null;
}

export interface Envelope {
	v: number;
	protondb: ProtonDBPayload | null;
	anticheat: AnticheatPayload | null;
	meta: EnvelopeMeta;
}

/**
 * Reads a backend reply, which may arrive as text or already deserialised.
 *
 * The Lua side returns JSON strings, but starlight's bridge parses them on
 * the way across, so a caller receives an object. The legacy bridge handed
 * over the raw string. Accepting both keeps every parser working whichever
 * side of that behaviour it is on, instead of JSON.parsing an object and
 * failing with "unreadable reply".
 *
 * Returns undefined for anything unusable, which callers map to their own
 * empty result.
 */
export function decodeReply<T = unknown>(raw: unknown): T {
	if (typeof raw === 'string') {
		try {
			return JSON.parse(raw) as T;
		} catch {
			return undefined as T;
		}
	}
	return (raw ?? undefined) as T;
}

/**
 * Parses a backend envelope. Returns null for anything unusable: malformed
 * JSON, a version this build does not understand, or a missing meta block.
 * Callers then treat a bad payload as "no data" rather than crashing.
 */
export function parseEnvelope(raw: unknown): Envelope | null {
	const parsed = decodeReply(raw);
	if (parsed === undefined) return null;
	if (typeof parsed !== 'object' || parsed === null) return null;

	const candidate = parsed as Partial<Envelope>;
	if (candidate.v !== ENVELOPE_VERSION) return null;
	if (typeof candidate.meta !== 'object' || candidate.meta === null) return null;

	// A payload lacking a usable tier must not reach createWidget, which calls
	// pdb.tier.toLowerCase() unconditionally; a malformed 200 response would
	// otherwise blank the page after removeWidget() has already run.
	const pdb = candidate.protondb;
	const protondb =
		pdb && typeof pdb === 'object' && typeof (pdb as ProtonDBPayload).tier === 'string'
			? (pdb as ProtonDBPayload)
			: null;

	// Real lua-cjson encodes an empty Lua table as `{}` (a JSON object), not
	// `[]`, so `anticheats` can arrive as an object rather than an array.
	const ac = candidate.anticheat;
	const anticheat =
		ac && typeof ac === 'object' && typeof (ac as AnticheatPayload).status === 'string'
			? {
					status: (ac as AnticheatPayload).status,
					anticheats: Array.isArray((ac as AnticheatPayload).anticheats)
						? (ac as AnticheatPayload).anticheats
						: [],
					note: (ac as AnticheatPayload).note ?? null,
					noteUrl: (ac as AnticheatPayload).noteUrl ?? null,
					dateChanged: (ac as AnticheatPayload).dateChanged ?? null,
				}
			: null;

	return {
		v: candidate.v,
		protondb,
		anticheat,
		meta: {
			fetchedAt: candidate.meta.fetchedAt ?? 0,
			stale: candidate.meta.stale === true,
			error: candidate.meta.error ?? null,
			protondbError: candidate.meta.protondbError ?? null,
			anticheatError: candidate.meta.anticheatError ?? null,
		},
	};
}

/**
 * Parses the `fetch_cached_tiers` envelope defensively: a decode failure, a
 * version mismatch, or a missing/non-object `tiers` all resolve to "nothing
 * cached" rather than throwing. Lives alongside parseEnvelope, which owns the
 * rest of the envelope contract, and is re-exported from webview/lists.ts
 * where it is used.
 */
export function parseCachedTiers(raw: unknown): Record<string, unknown> {
	const parsed = decodeReply(raw);
	if (parsed === undefined) return {};
	if (typeof parsed !== 'object' || parsed === null) return {};
	const candidate = parsed as { v?: unknown; tiers?: unknown };
	if (candidate.v !== ENVELOPE_VERSION) {
		// A silent mismatch here would quietly turn the cache-first list
		// design into fetch-everything the moment the backend's envelope
		// version moves ahead of a frontend build that has not picked it up.
		console.warn('[protondb] fetch_cached_tiers: version mismatch; treating cache as empty');
		return {};
	}
	return typeof candidate.tiers === 'object' && candidate.tiers !== null
		? (candidate.tiers as Record<string, unknown>)
		: {};
}
