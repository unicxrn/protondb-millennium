/**
 * User settings, shared by every surface.
 *
 * Persisted by the backend rather than through Millennium's `config` API: that
 * API is documented but absent from the type definitions available here, and
 * this plugin has a history of breaking on interfaces that could not be
 * verified before shipping. The backend probes for it and logs what it finds,
 * so a later move onto it is an informed change rather than a guess.
 */
export interface Settings {
	/** Show the compatibility panel on store pages. */
	storePages: boolean;
	/** Show the rating on library game pages. */
	libraryPages: boolean;
	/** How much to show on search and category rows. */
	listBadges: 'label' | 'dot' | 'off';
	/** Show anticheat status, for the games that have one. */
	anticheat: boolean;
	/** Warn when a high tier hides a blocked anticheat. */
	conflictWarning: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
	storePages: true,
	libraryPages: true,
	listBadges: 'label',
	anticheat: true,
	conflictWarning: true,
};

const BADGE_MODES = ['label', 'dot', 'off'] as const;

/**
 * Merges stored settings over the defaults, discarding anything unusable.
 *
 * A missing or malformed file must leave the plugin fully working, so every
 * key falls back individually rather than the whole set being rejected.
 */
export function mergeSettings(stored: unknown): Settings {
	const merged: Settings = { ...DEFAULT_SETTINGS };
	if (typeof stored !== 'object' || stored === null) return merged;

	const input = stored as Record<string, unknown>;

	for (const key of ['storePages', 'libraryPages', 'anticheat', 'conflictWarning'] as const) {
		if (typeof input[key] === 'boolean') merged[key] = input[key] as boolean;
	}

	if (BADGE_MODES.includes(input.listBadges as (typeof BADGE_MODES)[number])) {
		merged.listBadges = input.listBadges as Settings['listBadges'];
	}

	return merged;
}

/** Parses the backend's settings payload, falling back to defaults. */
export function parseSettings(raw: unknown): Settings {
	// The reply may arrive as text or already deserialised; see decodeReply.
	return mergeSettings(typeof raw === 'string' ? safeJson(raw) : raw);
}

function safeJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

/**
 * Reads settings from the backend, falling back to defaults.
 *
 * Every surface calls this once at start-up: a settings panel that silently
 * fails to apply is worse than one that is not there, so a failed read gives
 * the defaults rather than disabling anything.
 */
export async function loadSettings(): Promise<Settings> {
	try {
		return parseSettings(await backend.get_settings());
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}
