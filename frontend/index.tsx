import { IconsModule, definePlugin } from 'millennium';
import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '../shared/settings';
import { decodeReply } from '../shared/types';
import { relativeTime } from '../shared/time';
import { applySettings, installLibraryWidget } from './library';
import { ActionButton, Segmented, SettingRow, Switch } from './controls';

// Re-exported so Millennium's #{{self}} macro can reach it: the [patches]
// entry in backend/main.lua appends a call to this into Steam's own stats row.
export { LibraryProtonDBStat } from './library-stat';

interface CacheSummary {
	apps: number;
	indexed: number;
	fetchedAt: number;
}

const BADGE_OPTIONS: Array<{ value: Settings['listBadges']; label: string }> = [
	{ value: 'label', label: 'Tier name' },
	{ value: 'dot', label: 'Dot' },
	{ value: 'off', label: 'Off' },
];

function describeCache(summary: CacheSummary | null): string {
	if (!summary) return 'Reading…';

	const parts = [
		`${summary.indexed.toLocaleString()} games indexed for anticheat`,
		`${summary.apps.toLocaleString()} ratings stored`,
	];

	const age = summary.fetchedAt ? relativeTime(summary.fetchedAt) : '';
	if (age) parts.push(`refreshed ${age}`);

	return parts.join(' · ');
}

const SettingsContent = () => {
	const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
	const [cache, setCache] = useState<CacheSummary | null>(null);
	const [clearing, setClearing] = useState(false);

	const loadCache = async () => {
		try {
			setCache(decodeReply<CacheSummary>(await backend.cache_summary()));
		} catch {
			setCache(null);
		}
	};

	useEffect(() => {
		void (async () => {
			try {
				setSettings(parseSettings(await backend.get_settings()));
			} catch {
				/* defaults already in state */
			}
			void loadCache();
		})();
	}, []);

	// The backend returns the whole set after a write, so the panel reflects
	// what was actually stored rather than what was requested.
	const write = async (key: keyof Settings, value: boolean | string) => {
		const optimistic = { ...settings, [key]: value } as Settings;
		setSettings(optimistic);
		applySettings(optimistic);
		try {
			const stored = parseSettings(await backend.set_setting(key, JSON.stringify(value)));
			setSettings(stored);
			// The library watcher lives in this same context, so it adopts the
			// stored set directly. No restart, and no polling for changes.
			applySettings(stored);
		} catch {
			/* keep the optimistic value; the next open re-reads */
		}
	};

	const clear = async () => {
		setClearing(true);
		try {
			await backend.clear_cache();
			await loadCache();
		} finally {
			setClearing(false);
		}
	};

	return (
		<div>
			<SettingRow
				label="Store pages"
				description="Show the compatibility panel above the buy cards."
				control={
					<Switch
						label="Store pages"
						checked={settings.storePages}
						onChange={value => void write('storePages', value)}
					/>
				}
			/>
			<SettingRow
				label="Library pages"
				description="Show the rating on a game's library page."
				control={
					<Switch
						label="Library pages"
						checked={settings.libraryPages}
						onChange={value => void write('libraryPages', value)}
					/>
				}
			/>
			<SettingRow
				label="Badges in lists"
				description="Search results, store rows and the wishlist. An unrated game always stays blank, so a missing badge is never mistaken for a bad rating."
				control={
					<Segmented
						label="Badges in lists"
						value={settings.listBadges}
						options={BADGE_OPTIONS}
						onChange={value => void write('listBadges', value)}
					/>
				}
			/>
			<SettingRow
				label="Anticheat status"
				description="From AreWeAntiCheatYet. Shown only for the games that use anticheat, which is roughly 680 of them."
				control={
					<Switch
						label="Anticheat status"
						checked={settings.anticheat}
						onChange={value => void write('anticheat', value)}
					/>
				}
			/>
			<SettingRow
				label="Warn when multiplayer is blocked"
				description="ProtonDB tiers lean on singleplayer reports, so a Gold rating can sit above multiplayer that cannot launch. This calls that out."
				control={
					<Switch
						label="Warn when multiplayer is blocked"
						checked={settings.conflictWarning}
						onChange={value => void write('conflictWarning', value)}
					/>
				}
			/>
			<SettingRow
				label="Cached data"
				description={describeCache(cache)}
				control={
					<ActionButton onClick={() => void clear()} disabled={clearing}>
						{clearing ? 'Clearing…' : 'Clear'}
					</ActionButton>
				}
			/>
			<SettingRow
				label="What the tiers mean"
				description="Platinum: works perfectly. Gold: works great. Silver: runs with workarounds. Bronze: runs but has significant issues. Borked: does not run. Native: has a Linux build."
				control={<span />}
				last
			/>
		</div>
	);
};

/**
 * The settings entry's icon.
 *
 * IconsModule is resolved out of Steam's bundles by name, so a missing icon is
 * possible; rendering `undefined` as a component would take the whole plugin
 * entry down with "element type is invalid", so fall back to nothing.
 */
function PluginIcon(): any {
	const Settings = (IconsModule as any)?.Settings;
	return Settings ? <Settings /> : <span />;
}

export default definePlugin(() => {
	// Observes the client's library DOM; deliberately patches no route and
	// wraps no Steam component. See the note in ./library.tsx for why.
	installLibraryWidget();

	return {
		title: 'ProtonDB',
		icon: <PluginIcon />,
		content: <SettingsContent />,
	};
});
