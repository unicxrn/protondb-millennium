-- Stubs for the Millennium C modules the backend requires, so the backend's
-- logic can be exercised under plain luajit. Millennium's runtime cannot be
-- reproduced here, but these modules only touch five narrow interfaces, and
-- stubbing them is what makes the cache and failure paths testable at all.

local H = {}

-- In-memory filesystem, reset between cases.
H.files = {}
H.backend_path = "/fake/backend"
H.logs = {}

-- cjson stub: serialises to a Lua literal and reads it back. Faithful for the
-- plain tables the cache stores, and lets a test plant arbitrary raw content
-- to stand in for a foreign or truncated file.
--
-- cjson.null is special-cased: it is a sentinel table, and naively iterating
-- its (empty) fields would serialise it as an indistinguishable "{}" like any
-- other empty table, losing its null-ness on the round trip. Instead it is
-- emitted as a reference to the CJSON_NULL global (set below, once cjson
-- exists) so decode() hands back the exact same sentinel object.
local cjson

local function serialise(v, seen)
    if v == cjson.null then return "CJSON_NULL" end
    local t = type(v)
    if t == "number" or t == "boolean" then return tostring(v) end
    if t == "string" then return string.format("%q", v) end
    if t == "table" then
        seen = seen or {}
        if seen[v] then error("cycle") end
        seen[v] = true
        local parts = {}
        for k, val in pairs(v) do
            local key = type(k) == "string" and string.format("[%q]", k) or "[" .. tostring(k) .. "]"
            parts[#parts + 1] = key .. "=" .. serialise(val, seen)
        end
        seen[v] = nil
        return "{" .. table.concat(parts, ",") .. "}"
    end
    error("unserialisable: " .. t)
end

cjson = {
    null = setmetatable({}, { __tostring = function() return "null" end }),
    encode = function(v) return serialise(v) end,
    decode = function(s)
        local chunk = loadstring("return " .. s)
        if not chunk then error("parse error") end
        return chunk()
    end,
}
CJSON_NULL = cjson.null

local fs = {
    join = function(...) return table.concat({ ... }, "/") end,
    exists = function(p)
        if H.files[p] ~= nil then return true end
        -- Directories the fake filesystem considers to exist.
        return H.backend_path ~= nil and p == H.backend_path .. "/cache"
    end,
    create_directories = function() return true end,
    is_file = function(p) return H.files[p] ~= nil end,
    is_directory = function(p) return H.backend_path ~= nil and p == H.backend_path .. "/cache" end,
}

local utils = {
    get_backend_path = function() return H.backend_path end,
    read_file = function(p) return H.files[p] end,
    write_file = function(p, c) H.files[p] = c; return true end,
}

local logger = {
    info  = function(_, m) H.logs[#H.logs + 1] = { "info", m } end,
    warn  = function(_, m) H.logs[#H.logs + 1] = { "warn", m } end,
    error = function(_, m) H.logs[#H.logs + 1] = { "error", m } end,
}

-- Programmable HTTP. Set H.response to a table, or H.http_error to raise.
H.http_calls = 0
local http = {
    get = function(_, _)
        H.http_calls = H.http_calls + 1
        if H.http_error then error(H.http_error) end
        return H.response
    end,
}

-- steam_path backs cache.lua's fallback for packed plugins, where there is no
-- backend directory on disk to write beside. H.steam_path = nil exercises the
-- case where neither location resolves.
H.steam_path = "/fake/steam"
local millennium = {
    ready = function() return true end,
    steam_path = function() return H.steam_path end,
}

package.preload["json"]       = function() return cjson end
package.preload["fs"]         = function() return fs end
package.preload["utils"]      = function() return utils end
package.preload["logger"]     = function() return logger end
package.preload["http"]       = function() return http end
package.preload["millennium"] = function() return millennium end

package.path = "backend/?.lua;" .. package.path

--- Clears state and forces the backend modules to be re-required fresh.
function H.reset()
    H.files = {}
    H.logs = {}
    H.http_calls = 0
    H.response = nil
    H.http_error = nil
    H.backend_path = "/fake/backend"
    H.steam_path = "/fake/steam"
    package.loaded["cache"] = nil
    package.loaded["protondb"] = nil
    package.loaded["anticheat"] = nil
    -- rpc_functions captures json/logger/protondb/anticheat as locals when it
    -- first loads. Leaving it cached means a test that stubs one of those and
    -- re-runs main.lua still gets the modules captured by the first load.
    package.loaded["rpc_functions"] = nil
end

function H.cache_file(name)
    return H.backend_path .. "/cache/" .. name
end

--- Plants raw file content, bypassing cache.write's version stamping, to
--- simulate a file this build did not create.
function H.plant(name, raw)
    H.files[H.cache_file(name)] = raw
end

H.json = cjson
H.cjson = cjson -- deprecated alias; the module is named "json"
return H
