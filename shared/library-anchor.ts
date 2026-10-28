/** Builds the prioritised anchor selector list from resolved class names. */
export function anchorSelectors(names: (string | undefined)[]): string[] {
	return names.filter((n): n is string => typeof n === 'string' && n.length > 0).map(n => `.${n}`);
}

/**
 * Extracts an appid from a library route path.
 *
 * Anchored at the start, but tolerant of a leading hash or query that some
 * router configurations put in front of the path.
 */
export function appIdFromLibraryPath(path: string): string | null {
	const match = path.match(/\/library\/app\/(\d+)(?:\/|$|\?)/);
	return match ? match[1] : null;
}

/**
 * Extracts a Steam appid from a library artwork URL.
 *
 * Used only when the router's location is unreadable: Steam's library art is
 * served from paths that embed the appid, e.g. .../steam/apps/570/header.jpg
 * or a local steamloopback asset. Deliberately narrow. A match must be a
 * run of digits delimited by the path segment, so arbitrary numbers in a URL
 * do not masquerade as an appid.
 */
export function appIdFromArtworkUrl(url: string): string | null {
	const match = url.match(/\/(?:apps|assets)\/(\d{2,8})[/_]/);
	return match ? match[1] : null;
}
