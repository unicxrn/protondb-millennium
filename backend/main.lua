local logger = require("logger")
local millennium = require("millennium")
local http = require("http")

local cache = {}
local CACHE_TTL = 3600

function fetch_protondb_data(appId)
    appId = tostring(appId)
    logger:info("fetch_protondb_data: " .. appId)

    local cached = cache[appId]
    if cached and (os.time() - cached.timestamp) < CACHE_TTL then
        return cached.data
    end

    local url = "https://www.protondb.com/api/v1/reports/summaries/" .. appId .. ".json"
    local ok, response = pcall(function()
        return http.get(url, {
            timeout = 10,
            follow_redirects = true,
            headers = { ["User-Agent"] = "ProtonDB-Millennium-Plugin/1.0" }
        })
    end)

    if not ok then
        logger:error("http.get failed: " .. tostring(response))
        return '{"tier":"error","msg":"request failed"}'
    end

    local data
    if response.status == 200 then
        data = response.body -- already JSON from ProtonDB
    elseif response.status == 404 then
        data = '{"tier":"unknown","total":0}'
    else
        data = '{"tier":"error","msg":"HTTP ' .. response.status .. '"}'
    end

    cache[appId] = { data = data, timestamp = os.time() }
    return data
end

local function on_load()
    logger:info("ProtonDB plugin loaded")
    millennium.ready()
end

local function on_unload() end
local function on_frontend_loaded() end

return {
    on_load = on_load,
    on_unload = on_unload,
    on_frontend_loaded = on_frontend_loaded,
}
