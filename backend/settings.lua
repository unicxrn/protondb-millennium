local logger = require("logger")
local cache  = require("cache")

local M = {}

local FILE = "settings.json"

--- Mirrors DEFAULT_SETTINGS in shared/settings.ts. Both sides fall back
--- independently, so a key missing from one is not a failure in the other.
local DEFAULTS = {
    storePages      = true,
    libraryPages    = true,
    listBadges      = "label",
    anticheat       = true,
    conflictWarning = true,
}

local BADGE_MODES = { label = true, dot = true, off = true }

local function copy_defaults()
    local out = {}
    for k, v in pairs(DEFAULTS) do out[k] = v end
    return out
end

--- Merges stored values over the defaults, discarding anything unusable.
--- Each key falls back on its own: a single bad value must not reset the rest.
local function merge(stored)
    local merged = copy_defaults()
    if type(stored) ~= "table" then return merged end

    for _, key in ipairs({ "storePages", "libraryPages", "anticheat", "conflictWarning" }) do
        if type(stored[key]) == "boolean" then merged[key] = stored[key] end
    end

    if type(stored.listBadges) == "string" and BADGE_MODES[stored.listBadges] then
        merged.listBadges = stored.listBadges
    end

    return merged
end

--- The current settings, always a complete set.
function M.get()
    return merge(cache.read(FILE))
end

--- Writes one key. Unknown keys and values of the wrong type are ignored
--- rather than stored, so the file cannot accumulate junk the readers then
--- have to defend against.
--- @return table settings the complete set after the write
function M.set(key, value)
    local current = M.get()

    if DEFAULTS[key] == nil then
        logger:warn("settings: ignoring unknown key '" .. tostring(key) .. "'")
        return current
    end

    if key == "listBadges" then
        if type(value) ~= "string" or not BADGE_MODES[value] then
            logger:warn("settings: ignoring invalid listBadges value")
            return current
        end
    elseif type(value) ~= "boolean" then
        logger:warn("settings: ignoring non-boolean value for '" .. key .. "'")
        return current
    end

    current[key] = value
    cache.write(FILE, current)
    return current
end

--- Reports whether Millennium's own config API is present on this build.
---
--- The docs describe millennium.config.get/set/on_change, but it is absent
--- from the type definitions available here and could not be verified before
--- shipping. Settings therefore persist through this module's own file; this
--- probe exists so that moving onto the config API later is an informed
--- change rather than another guess. Logged once at load.
function M.probe_config_api()
    local ok, millennium = pcall(require, "millennium")
    if not ok or type(millennium) ~= "table" then
        logger:info("settings: millennium module unavailable for probing")
        return false
    end

    local present = type(millennium.config) == "table"
    logger:info("settings: millennium.config is " .. (present and "AVAILABLE" or "absent") ..
        " (settings persist to " .. FILE .. " either way)")
    return present
end

return M
