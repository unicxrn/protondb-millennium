local json       = require("json")
local fs         = require("fs")
local utils      = require("utils")
local logger     = require("logger")
local millennium = require("millennium")

local M = {}

--- Bumped whenever the on-disk shape of a cache file changes. Stored files
--- carrying any other version are discarded rather than migrated, so stale
--- structures can never reach code that expects the current one.
local CACHE_VERSION = 1

--- Used only when no writable cache directory is available, so the plugin
--- degrades to per-session caching rather than to no caching at all.
local memory = {}
local warned_no_path = false

local function warn_no_path()
    if warned_no_path then return end
    warned_no_path = true
    logger:warn("cache: no writable backend path, falling back to in-memory cache")
end

--- Absolute path to a file in the plugin's cache directory, creating the
--- directory on first use. Returns nil when the backend path is unavailable,
--- in which case callers degrade to in-memory behaviour.
--- Where cache files live, resolved once.
---
--- A loose-file install has a backend directory to write beside. A packed
--- (.star) plugin does not - utils.get_backend_path() comes back empty,
--- because there is no backend/ on disk at all - so the cache goes under
--- Steam's own config directory, which is writable and survives reinstalls
--- of the plugin.
local resolved_dir = nil
local resolved = false

local function cache_dir()
    if resolved then return resolved_dir end
    resolved = true

    local base = utils.get_backend_path()
    if type(base) == "string" and base ~= "" then
        resolved_dir = fs.join(base, "cache")
    else
        local ok, steam = pcall(millennium.steam_path)
        if ok and type(steam) == "string" and steam ~= "" then
            resolved_dir = fs.join(steam, "config", "protondb-millennium")
        end
    end

    if resolved_dir then
        logger:info("cache: using " .. resolved_dir)
        if not fs.exists(resolved_dir) then fs.create_directories(resolved_dir) end
    else
        logger:warn("cache: no writable location found; falling back to in-memory only")
    end

    return resolved_dir
end

function M.path(name)
    local dir = cache_dir()
    if not dir then return nil end
    return fs.join(dir, name)
end

--- Reads and decodes a cache file. Returns nil if absent, corrupt, written by
--- a different cache version, or structurally unusable. Callers receive either
--- a table shaped the way they wrote it, or nil. Never a partial structure.
--- Falls back to the in-memory store when there is no writable backend path.
function M.read(name)
    local path = M.path(name)
    if not path then
        warn_no_path()
        return memory[name]
    end
    if not fs.exists(path) then return nil end

    local content = utils.read_file(path)
    if not content then return nil end

    local ok, decoded = pcall(json.decode, content)
    if not ok then
        logger:warn("cache: discarding corrupt " .. name)
        return nil
    end

    -- A syntactically valid JSON file is not necessarily a usable one: a file
    -- from another version, or any foreign file sitting at this path, decodes
    -- fine and would otherwise be indexed into as though it were ours.
    if type(decoded) ~= "table" or decoded.v ~= CACHE_VERSION or type(decoded.data) ~= "table" then
        logger:warn("cache: discarding unusable " .. name)
        return nil
    end

    return decoded.data
end

--- Encodes and writes a cache file, stamped with the current cache version.
--- Returns true on success. Falls back to the in-memory store when there is
--- no writable backend path.
function M.write(name, value)
    local path = M.path(name)
    if not path then
        warn_no_path()
        memory[name] = value
        return true
    end

    local ok, encoded = pcall(json.encode, { v = CACHE_VERSION, data = value })
    if not ok then
        logger:error("cache: failed to encode " .. name)
        return false
    end

    local success = utils.write_file(path, encoded)
    return success == true
end

--- Deletes a cache file, and its in-memory fallback entry.
--- @return boolean removed true if anything was there to remove
function M.remove(name)
    local had_memory = memory[name] ~= nil
    memory[name] = nil

    local path = M.path(name)
    if not path or not fs.exists(path) then return had_memory end

    local ok = os.remove(path)
    return ok ~= nil or had_memory
end

--- Keeps only the `max` most recently fetched entries of a keyed table.
--- Without this the per-app cache grows without bound across a large library.
--- Non-table entries (unusable data) are skipped rather than indexed into.
function M.prune(entries, max)
    local ordered = {}
    for id, entry in pairs(entries) do
        if type(entry) == "table" then
            ordered[#ordered + 1] = { id = id, at = entry.fetchedAt or 0 }
        end
    end

    if #ordered <= max then return entries end

    table.sort(ordered, function(a, b) return a.at > b.at end)

    local kept = {}
    for i = 1, max do
        kept[ordered[i].id] = entries[ordered[i].id]
    end
    return kept
end

return M
