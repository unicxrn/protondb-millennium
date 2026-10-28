import { parseEnvelope, type Envelope } from '../shared/types';
import { isExpired } from '../shared/time';

export const LS_PREFIX = 'protondb:';
const TTL_SECONDS = 3600;

/**
 * Reads a cached envelope. Expiry is derived from the envelope's own
 * meta.fetchedAt so the backend remains the single authority on freshness.
 */
export function lsGet(appId: string, now: number = Date.now()): Envelope | null {
	try {
		const raw = localStorage.getItem(LS_PREFIX + appId);
		if (!raw) return null;
		const envelope = parseEnvelope(raw);
		if (!envelope || isExpired(envelope.meta.fetchedAt, TTL_SECONDS, now)) {
			localStorage.removeItem(LS_PREFIX + appId);
			return null;
		}
		return envelope;
	} catch {
		return null;
	}
}

export function lsSet(appId: string, envelope: Envelope): void {
	try {
		localStorage.setItem(LS_PREFIX + appId, JSON.stringify(envelope));
	} catch {
		/* quota exceeded or storage disabled. Caching is best-effort */
	}
}

/**
 * Evicts a cached entry. Used when a forced refetch comes back worse than
 * what was stored, so a stale/failed answer cannot linger under a TTL that
 * was stamped by the earlier, better one.
 */
export function lsRemove(appId: string): void {
	try {
		localStorage.removeItem(LS_PREFIX + appId);
	} catch {
		/* best-effort */
	}
}

/**
 * Removes expired entries. Without this, keys for games the user never
 * revisits accumulate permanently, because lsGet only evicts on read.
 */
export function lsSweep(now: number = Date.now()): void {
	try {
		const doomed: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (!key || !key.startsWith(LS_PREFIX)) continue;
			const envelope = parseEnvelope(localStorage.getItem(key) ?? '');
			if (!envelope || isExpired(envelope.meta.fetchedAt, TTL_SECONDS, now)) doomed.push(key);
		}
		doomed.forEach(key => localStorage.removeItem(key));
	} catch {
		/* best-effort */
	}
}
