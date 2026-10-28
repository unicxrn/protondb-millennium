--- Functions the frontend and webview can call as backend.<name>(...).
---
--- Each is a global annotated ---@ffi, which is what exposes it across the
--- IPC boundary. main.lua requires this module for its side effects; nothing
--- here is returned.

local json      = require("json")
local logger    = require("logger")
local protondb  = require("protondb")
local anticheat = require("anticheat")
local settings  = require("settings")
local cache     = require("cache")

local ENVELOPE_VERSION = 1

---@ffi
--- Returns a merged, versioned envelope for one app as a JSON string.
--- The two sources resolve independently: a ProtonDB failure must not
--- suppress an available anticheat answer, or the reverse. Neither source
--- is trusted to stay inside its own contract: either call is wrapped in
--- pcall so a raise in one (an unexpected upstream shape, for instance)
--- degrades to an error field rather than escaping across the IPC boundary.
--- @param appId string|number
--- @param force boolean|nil bypass both TTLs (used by the widget's retry)
--- @return string envelope JSON
function fetch_app_data(appId, force)
    appId = tostring(appId)
    force = force == true

    local ok_pdb, pdb = pcall(protondb.get, appId, force)
    if not ok_pdb then
        logger:error("protondb source raised: " .. tostring(pdb))
        pdb = { payload = nil, fetchedAt = os.time(), stale = false, err = "internal" }
    end

    local ok_ac, ac_payload, ac_stale, ac_err, ac_fetchedAt = pcall(anticheat.get, appId, force)
    if not ok_ac then
        logger:error("anticheat source raised: " .. tostring(ac_payload))
        ac_payload, ac_stale, ac_err, ac_fetchedAt = nil, false, "internal", nil
    end

    -- The age shown to the user should be honest about the oldest thing on
    -- screen: a fresh ProtonDB result next to a stale anticheat index must
    -- not be reported as fresh.
    local ac_at = ac_fetchedAt
    local fetched_at = pdb.fetchedAt
    if ac_at and ac_at > 0 and ac_at < fetched_at then fetched_at = ac_at end

    local envelope = {
        v         = ENVELOPE_VERSION,
        protondb  = pdb.payload or json.null,
        anticheat = ac_payload or json.null,
        meta      = {
            -- The age of the data, not the time of this call, so a stale
            -- payload cannot masquerade as fresh in the frontend cache.
            fetchedAt      = fetched_at,
            stale          = (pdb.stale or ac_stale) and true or false,
            error          = pdb.err or ac_err or json.null,
            protondbError  = pdb.err or json.null,
            anticheatError = ac_err or json.null,
        },
    }

    -- json.encode can itself raise (e.g. an unencodable NaN/inf slipping in
    -- from an upstream payload), and that must not escape across the IPC
    -- boundary any more than a raise inside either source does.
    local ok_encode, encoded = pcall(json.encode, envelope)
    if not ok_encode then
        logger:error("fetch_app_data: could not encode envelope: " .. tostring(encoded))
        return '{"v":1,"protondb":null,"anticheat":null,"meta":{"fetchedAt":0,"stale":false,"error":"internal","protondbError":"internal","anticheatError":"internal"}}'
    end
    return encoded
end

---@ffi
--- Cached-only tiers for many apps at once, for list surfaces.
--- Never performs HTTP: see protondb.get_cached.
--- @param appIds string JSON array of appids
--- @return string tiers JSON
function fetch_cached_tiers(appIds)
    local ok, ids = pcall(json.decode, appIds)
    if not ok or type(ids) ~= "table" then
        logger:warn("fetch_cached_tiers: could not decode appIds")
        return json.encode({ v = ENVELOPE_VERSION, tiers = {} })
    end

    local got, tiers = pcall(protondb.get_cached, ids)
    if not got then
        logger:error("fetch_cached_tiers raised: " .. tostring(tiers))
        tiers = {}
    end

    -- As in fetch_app_data: one unencodable cached payload must not take
    -- down a whole page's worth of badges.
    local ok_encode, encoded = pcall(json.encode, { v = ENVELOPE_VERSION, tiers = tiers })
    if not ok_encode then
        logger:error("fetch_cached_tiers: could not encode envelope: " .. tostring(encoded))
        return '{"v":1,"tiers":{}}'
    end
    return encoded
end

---@ffi
--- Lets the client frontend write into Millennium's plugin log panel.
---
--- The frontend's console.log goes to Steam's own JS console, which the Logs
--- panel does not show, so anything the library integration reports would
--- otherwise be invisible to whoever is trying to diagnose it.
--- @param message string
--- @return boolean ok
function log_frontend(message)
    logger:info("[frontend] " .. tostring(message))
    return true
end


---@ffi
--- The complete settings set, as JSON.
--- @return string settings JSON
function get_settings()
    local ok, encoded = pcall(json.encode, settings.get())
    if not ok then
        logger:error("get_settings: could not encode settings")
        return '{}'
    end
    return encoded
end

---@ffi
--- Writes one setting and returns the complete set after the write.
---
--- The value arrives JSON-encoded because IPC carries only scalars, and a
--- setting can be either a boolean or a string.
--- @param key string
--- @param value string JSON-encoded value
--- @return string settings JSON
function set_setting(key, value)
    local ok, decoded = pcall(json.decode, value)
    if not ok then
        logger:warn("set_setting: could not decode value for '" .. tostring(key) .. "'")
        return get_settings()
    end

    settings.set(key, decoded)
    return get_settings()
end

---@ffi
--- Deletes every cached file, so the next lookup refetches from scratch.
--- @return string report JSON
function clear_cache()
    local removed = {}
    for _, name in ipairs({ "apps.json", "anticheat.json" }) do
        if cache.remove(name) then removed[#removed + 1] = name end
    end

    logger:info("clear_cache: removed " .. #removed .. " file(s)")

    local ok, encoded = pcall(json.encode, { removed = removed })
    return ok and encoded or '{"removed":[]}'
end

---@ffi
--- What the plugin currently holds, for the settings panel.
--- @return string summary JSON
function cache_summary()
    local apps = cache.read("apps.json") or {}
    local ac   = cache.read("anticheat.json")

    local app_count = 0
    for _ in pairs(apps) do app_count = app_count + 1 end

    local indexed = 0
    if type(ac) == "table" and type(ac.index) == "table" then
        for _ in pairs(ac.index) do indexed = indexed + 1 end
    end

    local summary = {
        apps      = app_count,
        indexed   = indexed,
        fetchedAt = (type(ac) == "table" and ac.fetchedAt) or 0,
    }

    local ok, encoded = pcall(json.encode, summary)
    return ok and encoded or '{"apps":0,"indexed":0,"fetchedAt":0}'
end

logger:info("Registered RPC functions")
