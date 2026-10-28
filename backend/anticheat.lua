local json   = require("json")
local http   = require("http")
local logger = require("logger")
local cache  = require("cache")

local M = {}

local URL        = "https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/HEAD/games.json"
local INDEX_FILE = "anticheat.json"
local TTL        = 86400 -- 24 hours
local RETRY_COOLDOWN = 900 -- 15 minutes
local USER_AGENT = "ProtonDB-Millennium-Plugin/1.0"

--- Collapses the full AWACY document (roughly 469 KB, 1167 entries) into a
--- lookup keyed by Steam appid, keeping only the fields the widget renders.
--- Entries without a Steam appid are skipped; only about 682 of them have one.
--- Entries that are not tables (a stray number or string in the upstream
--- array) are skipped rather than indexed into, since the array's shape is
--- not guaranteed element-by-element.
local function collapse(games)
    local index = {}

    for _, game in ipairs(games) do
        if type(game) == "table" then
            local steam = game.storeIds and type(game.storeIds) == "table" and game.storeIds.steam

            if steam and type(steam) == "string" and game.status then
                local note, note_url

                -- notes entries are [text, url] pairs and are frequently absent
                if type(game.notes) == "table" and type(game.notes[1]) == "table" then
                    note     = game.notes[1][1]
                    note_url = game.notes[1][2]
                end

                index[steam] = {
                    status      = game.status,
                    anticheats  = game.anticheats or {},
                    note        = note,
                    noteUrl     = note_url,
                    dateChanged = game.dateChanged,
                }
            end
        end
    end

    return index
end

--- Reads one appid out of a stored index without trusting its shape.
--- A crash here would propagate out of the IPC call, so the one case this
--- module cannot render usefully must still fail quietly.
local function lookup(stored, appId)
    if type(stored) ~= "table" or type(stored.index) ~= "table" then return nil end
    return stored.index[appId]
end

--- Looks up one appid.
--- @return table|nil payload, boolean stale, string|nil err, number fetchedAt
---   age of the index behind this answer: stored.fetchedAt when served from
---   cache, now on a fresh download, 0 when there is no index at all.
function M.get(appId, force)
    local stored = cache.read(INDEX_FILE)
    local now    = os.time()
    local fresh  = stored and stored.fetchedAt and (now - stored.fetchedAt) < TTL

    if fresh and not force then
        return lookup(stored, appId), false, nil, stored.fetchedAt
    end

    -- Back off after a failure. Without this a blocking 469 KB download is
    -- retried on every store page view for as long as the network is down.
    local cooling = stored and stored.failedAt and (now - stored.failedAt) < RETRY_COOLDOWN
    if cooling and not force then
        return lookup(stored, appId), true, "network", stored.fetchedAt
    end

    local ok, response = pcall(http.get, URL, {
        timeout          = 30,
        follow_redirects = true,
        headers          = { ["User-Agent"] = USER_AGENT },
    })

    if not ok or not response or response.status ~= 200 then
        logger:warn("anticheat: download failed")
        cache.write(INDEX_FILE, {
            fetchedAt = stored and stored.fetchedAt or 0,
            index     = (stored and stored.index) or {},
            failedAt  = now,
        })
        if stored then return lookup(stored, appId), true, "network", stored.fetchedAt end
        return nil, false, "network", 0
    end

    local parsed, games = pcall(json.decode, response.body)
    if not parsed or type(games) ~= "table" then
        logger:error("anticheat: could not parse upstream document")
        -- Retain the previous index so an upstream schema change degrades to
        -- stale data rather than to no data at all.
        cache.write(INDEX_FILE, {
            fetchedAt = stored and stored.fetchedAt or 0,
            index     = (stored and stored.index) or {},
            failedAt  = now,
        })
        if stored then return lookup(stored, appId), true, "parse", stored.fetchedAt end
        return nil, false, "parse", 0
    end

    local index = collapse(games)
    if next(index) == nil and stored and type(stored.index) == "table" and next(stored.index) ~= nil then
        -- The document parsed but produced nothing usable while a previous
        -- non-empty index exists: an upstream schema change, not an answer.
        logger:error("anticheat: upstream produced an empty index, keeping the previous one")
        cache.write(INDEX_FILE, {
            fetchedAt = stored.fetchedAt or 0,
            index     = stored.index,
            failedAt  = now,
        })
        return lookup(stored, appId), true, "parse", stored.fetchedAt
    end

    -- A success clears any recorded backoff.
    cache.write(INDEX_FILE, { fetchedAt = now, index = index })

    return index[appId], false, nil, now
end

return M
