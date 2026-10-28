/**
 * The backend bridge Millennium injects at runtime.
 *
 * Under the starlight (millennium.toml) format, Lua globals annotated
 * `---@ffi` in `backend/rpc_functions.lua` are reachable as `backend.<name>`
 * from both the frontend and the webview. Arguments are positional, unlike
 * the legacy `callable()` bridge which took a single keyword object.
 *
 * Declared by hand because `starlight lsp` generates its types from a
 * `types.zip` that this Millennium install does not ship; without it the
 * `millennium` module and these globals would be untyped. Keep in step with
 * the `---@ffi` signatures in the backend.
 */
declare global {
	const backend: {
		/** Merged ProtonDB + anticheat envelope for one app, as JSON. */
		fetch_app_data(appId: string, force: boolean): Promise<string>;

		/**
		 * Cached-only tiers for many apps, as JSON. Never performs HTTP, because
		 * the backend's HTTP is synchronous and would block the plugin thread.
		 * @param appIds JSON-encoded array of appid strings
		 */
		fetch_cached_tiers(appIds: string): Promise<string>;

		/** Writes a line into Millennium's plugin log panel. */
		log_frontend(message: string): Promise<boolean>;

		/** The complete settings set, as JSON. */
		get_settings(): Promise<string>;

		/**
		 * Writes one setting, returning the complete set afterwards.
		 * @param value JSON-encoded, because IPC carries only scalars and a
		 *              setting may be a boolean or a string
		 */
		set_setting(key: string, value: string): Promise<string>;

		/** Deletes every cached file. Returns `{ removed: string[] }` as JSON. */
		clear_cache(): Promise<string>;

		/** What the cache holds: `{ apps, indexed, fetchedAt }` as JSON. */
		cache_summary(): Promise<string>;
	};
}

export {};
