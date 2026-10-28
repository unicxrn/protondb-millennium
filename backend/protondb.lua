local json   = require("json")
local http   = require("http")
local logger = require("logger")
local cache  = require("cache")

local M = {}

local APPS_FILE = "apps.json"
local TTL       = 3600 -- 1 hour
local MAX_APPS  = 500
--- How long to leave a failing app alone. Without this, a ProtonDB outage
--- means every page view refetches - from every user running the plugin.
local RETRY_COOLDOWN = 300 -- 5 minutes
local USER_AGENT = "ProtonDB-Millennium-Plugin/1.0"

local function url_for(appId)
    return "https://www.protondb.com/api/v1/reports/summaries/" .. appId .. ".json"
end

--- Records that this app just failed, keeping whatever payload was already
--- stored so a stale answer can still be served during the cooldown.
local function remember_failure(apps, appId, stored, now, reason)
    apps[appId] = {
        protondb   = stored and stored.protondb or nil,
        fetchedAt  = stored and stored.fetchedAt or nil,
        failedAt   = now,
        failedWith = reason,
    }
    cache.write(APPS_FILE, cache.prune(apps, MAX_APPS))
end

--- Fetches one app's summary.
--- @return table result { payload = table|nil, fetchedAt = number, stale = boolean, err = string|nil }
function M.get(appId, force)
    local apps   = cache.read(APPS_FILE) or {}
    local stored = apps[appId]
    local now    = os.time()

    -- Only a table entry can be read from; anything else in the file is
    -- treated as absent rather than indexed into.
    if type(stored) ~= "table" then stored = nil end

    local fresh  = stored and stored.fetchedAt and (now - stored.fetchedAt) < TTL

    if fresh and not force then
        return { payload = stored.protondb, fetchedAt = stored.fetchedAt, stale = false, err = nil }
    end

    -- Back off after a failure rather than retrying on every page view.
    local cooling = stored and stored.failedAt and (now - stored.failedAt) < RETRY_COOLDOWN
    if cooling and not force then
        return {
            payload   = stored.protondb,
            fetchedAt = stored.fetchedAt or now,
            stale     = true,
            err       = stored.failedWith or "network",
        }
    end

    local ok, response = pcall(http.get, url_for(appId), {
        timeout          = 10,
        follow_redirects = true,
        headers          = { ["User-Agent"] = USER_AGENT },
    })

    if not ok or not response then
        logger:warn("protondb: request failed for " .. appId)
        remember_failure(apps, appId, stored, now, "network")
        if stored then
            return { payload = stored.protondb, fetchedAt = stored.fetchedAt, stale = true, err = "network" }
        end
        return { payload = nil, fetchedAt = now, stale = false, err = "network" }
    end

    local payload, err

    if response.status == 200 then
        local parsed, decoded = pcall(json.decode, response.body)
        if parsed and type(decoded) == "table" then
            payload = decoded
        else
            err = "parse"
        end
    elseif response.status == 404 then
        -- No ProtonDB entry. A genuine "no reports" answer, not a failure,
        -- and worth caching so it is not refetched on every page view.
        payload = nil
    else
        err = "http_" .. tostring(response.status)
    end

    if err then
        remember_failure(apps, appId, stored, now, err)
        if stored then
            return { payload = stored.protondb, fetchedAt = stored.fetchedAt, stale = true, err = err }
        end
        return { payload = nil, fetchedAt = now, stale = false, err = err }
    end

    -- A success clears any backoff: no failedAt is carried over.
    apps[appId] = { protondb = payload, fetchedAt = now }
    cache.write(APPS_FILE, cache.prune(apps, MAX_APPS))

    return { payload = payload, fetchedAt = now, stale = false, err = nil }
end

--- Returns cached payloads for the given appIds without ever touching the
--- network. List surfaces need many apps at once, and http is synchronous, so
--- a list must never be able to trigger a fetch.
--- @param appIds table array of appid strings
--- @return table map of appId -> payload, omitting anything absent or expired
function M.get_cached(appIds)
    local apps = cache.read(APPS_FILE) or {}
    local now  = os.time()
    local out  = {}

    for _, raw in ipairs(appIds) do
        local id     = tostring(raw)
        local stored = apps[id]

        if type(stored) == "table"
            and type(stored.protondb) == "table"
            and stored.fetchedAt
            and (now - stored.fetchedAt) < TTL then
            out[id] = stored.protondb
        end
    end

    return out
end

return M
