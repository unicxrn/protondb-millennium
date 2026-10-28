/**
 * Human-readable age of a timestamp. Accepts Unix seconds (as produced by
 * Lua's os.time()) or an ISO string. Returns '' for unparseable or future
 * timestamps rather than rendering nonsense.
 */
export function relativeTime(ts: string | number, now: number = Date.now()): string {
	const epoch = typeof ts === 'number' ? ts * 1000 : new Date(ts).getTime();
	const ms = now - epoch;
	if (isNaN(ms) || ms < 0) return '';
	const days = Math.floor(ms / 86_400_000);
	if (days < 1) return 'today';
	if (days < 7) return `${days}d ago`;
	if (days < 30) return `${Math.floor(days / 7)}wk ago`;
	if (days < 365) return `${Math.floor(days / 30)}mo ago`;
	return `${Math.floor(days / 365)}yr ago`;
}

/**
 * @param fetchedAt Unix seconds
 * @param ttlSeconds lifetime in seconds
 * @param now milliseconds since epoch
 */
export function isExpired(fetchedAt: number, ttlSeconds: number, now: number = Date.now()): boolean {
	if (!fetchedAt) return true;
	return now - fetchedAt * 1000 > ttlSeconds * 1000;
}
