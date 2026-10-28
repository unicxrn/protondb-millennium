-- Backend logic tests. Run with: luajit tests/lua/run.lua
--
-- These cover the cache's version and shape guards and the two sources'
-- resolution order. They deliberately do NOT cover HTTP, JSON parsing, or
-- filesystem behaviour, all of which are stubbed. Those are exercised by
-- the manual checklist in the real client.

local H = dofile("tests/lua/harness.lua")

local passed, failed = 0, 0

local function check(name, fn)
    H.reset()
    local ok, err = pcall(fn)
    if ok then
        passed = passed + 1
        print("PASS  " .. name)
    else
        failed = failed + 1
        print("FAIL  " .. name .. "\n        " .. tostring(err))
    end
end

local function assert_eq(actual, expected, what)
    if actual ~= expected then
        error((what or "value") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
    end
end

-- ── cache ────────────────────────────────────────────────────────────────

check("cache round-trips a written value", function()
    local cache = require("cache")
    assert(cache.write("t.json", { hello = "world" }), "write should succeed")
    assert_eq(cache.read("t.json").hello, "world", "round-tripped field")
end)

check("cache stamps a version onto what it writes", function()
    local cache = require("cache")
    cache.write("t.json", { hello = "world" })
    local raw = H.cjson.decode(H.files[H.cache_file("t.json")])
    assert_eq(raw.v, 1, "stamped version")
    assert_eq(raw.data.hello, "world", "payload nested under data")
end)

check("cache discards a file from a different version", function()
    local cache = require("cache")
    H.plant("t.json", H.cjson.encode({ v = 99, data = { hello = "world" } }))
    assert_eq(cache.read("t.json"), nil, "foreign-version read")
end)

check("cache discards a file with no data block", function()
    local cache = require("cache")
    H.plant("t.json", H.cjson.encode({ fetchedAt = 123, index = {} }))
    assert_eq(cache.read("t.json"), nil, "unversioned legacy read")
end)

check("cache discards syntactically corrupt content", function()
    local cache = require("cache")
    H.plant("t.json", "{not valid at all")
    assert_eq(cache.read("t.json"), nil, "corrupt read")
end)

check("cache degrades to in-memory behaviour when no location is writable", function()
    -- Previously the branch that removed the module's file-backed cache also
    -- deleted the in-memory fallback the comment on M.path still promised:
    -- write returned false and nothing was ever readable back.
    local cache = require("cache")
    -- A packed plugin has no backend directory; with Steam's config directory
    -- also unavailable there is nowhere on disk left to write.
    H.backend_path = nil
    H.steam_path = nil
    assert_eq(cache.path("t.json"), nil, "path")
    assert_eq(cache.read("t.json"), nil, "read before any write")
    assert_eq(cache.write("t.json", { a = 1 }), true, "write should succeed via the memory fallback")
    assert_eq(cache.read("t.json").a, 1, "read should round-trip through memory")
end)

check("cache's memory fallback is isolated per file name", function()
    local cache = require("cache")
    H.backend_path = nil
    H.steam_path = nil
    cache.write("one.json", { v = 1 })
    cache.write("two.json", { v = 2 })
    assert_eq(cache.read("one.json").v, 1, "one.json")
    assert_eq(cache.read("two.json").v, 2, "two.json")
end)

check("cache.prune keeps the most recently fetched entries", function()
    local cache = require("cache")
    local entries = {}
    for i = 1, 10 do entries["app" .. i] = { fetchedAt = i } end
    local kept = cache.prune(entries, 3)
    local count = 0
    for _ in pairs(kept) do count = count + 1 end
    assert_eq(count, 3, "kept count")
    assert(kept.app10 and kept.app9 and kept.app8, "should keep the three newest")
    assert(not kept.app1, "should drop the oldest")
end)

check("cache.prune leaves a table under the cap untouched", function()
    local cache = require("cache")
    local entries = { a = { fetchedAt = 1 }, b = { fetchedAt = 2 } }
    assert_eq(cache.prune(entries, 500), entries, "identity under cap")
end)

check("cache.prune survives and drops a scalar entry", function()
    -- protondb.lua already guards this exact shape one file over; prune was
    -- indexing entry.fetchedAt unconditionally and would crash on a scalar.
    local cache = require("cache")
    local entries = {
        a = { fetchedAt = 5 },
        b = "corrupt scalar",
        c = { fetchedAt = 3 },
    }
    local kept = cache.prune(entries, 1)
    local count = 0
    for _ in pairs(kept) do count = count + 1 end
    assert_eq(count, 1, "kept count")
    assert(kept.a, "should keep the newest valid entry")
    assert(not kept.b, "the scalar entry should never survive")
    assert(not kept.c, "the older valid entry should be dropped by the cap")
end)

check("cache falls back to Steam's config directory for a packed plugin", function()
    -- utils.get_backend_path() returns empty for a .star plugin, because there
    -- is no backend/ on disk to write beside.
    local cache = require("cache")
    H.backend_path = nil
    local path = cache.path("apps.json")
    assert(path ~= nil, "a packed plugin should still find somewhere to write")
    assert(path:find("protondb-millennium", 1, true), "should sit under a plugin-specific directory, got " .. tostring(path))
    assert(cache.write("apps.json", { a = 1 }), "write should succeed there")
    assert_eq(cache.read("apps.json").a, 1, "and read back")
end)

check("cache treats an empty backend path like a missing one", function()
    local cache = require("cache")
    H.backend_path = ""
    local path = cache.path("apps.json")
    assert(path ~= nil and path:find("protondb-millennium", 1, true),
        "an empty path must not become a relative '/cache' directory")
end)

-- ── anticheat ────────────────────────────────────────────────────────────

check("anticheat indexes a downloaded document by steam appid", function()
    local anticheat = require("anticheat")
    H.response = {
        status = 200,
        body = H.cjson.encode({
            { name = "A", status = "Denied", anticheats = { "EA anticheat" },
              storeIds = { steam = "1517290" }, notes = {}, dateChanged = "2024-11-04" },
            { name = "B", status = "Broken", anticheats = { "EAC" },
              storeIds = {}, notes = {} },
        }),
    }
    local payload, stale, err = anticheat.get("1517290", false)
    assert_eq(payload.status, "Denied", "status")
    assert_eq(payload.anticheats[1], "EA anticheat", "anticheat name")
    assert_eq(stale, false, "stale")
    assert_eq(err, nil, "err")
end)

check("anticheat skips entries with no steam appid", function()
    local anticheat = require("anticheat")
    H.response = {
        status = 200,
        body = H.cjson.encode({
            { name = "B", status = "Broken", anticheats = {}, storeIds = {}, notes = {} },
        }),
    }
    local payload = anticheat.get("999", false)
    assert_eq(payload, nil, "absent app")
end)

check("anticheat serves a fresh index without re-downloading", function()
    local anticheat = require("anticheat")
    H.response = {
        status = 200,
        body = H.cjson.encode({
            { name = "A", status = "Denied", anticheats = {}, storeIds = { steam = "1" }, notes = {} },
        }),
    }
    anticheat.get("1", false)
    local first = H.http_calls
    anticheat.get("1", false)
    assert_eq(H.http_calls, first, "second lookup should not hit the network")
end)

check("anticheat force bypasses a fresh index", function()
    local anticheat = require("anticheat")
    H.response = {
        status = 200,
        body = H.cjson.encode({
            { name = "A", status = "Denied", anticheats = {}, storeIds = { steam = "1" }, notes = {} },
        }),
    }
    anticheat.get("1", false)
    local first = H.http_calls
    anticheat.get("1", true)
    assert_eq(H.http_calls, first + 1, "force should re-download")
end)

check("anticheat serves stale data when the download fails", function()
    local anticheat = require("anticheat")
    H.response = {
        status = 200,
        body = H.cjson.encode({
            { name = "A", status = "Denied", anticheats = {}, storeIds = { steam = "1" }, notes = {} },
        }),
    }
    anticheat.get("1", false)

    -- expire the stored index, then break the network
    local stored = H.cjson.decode(H.files[H.cache_file("anticheat.json")])
    stored.data.fetchedAt = os.time() - 999999
    H.files[H.cache_file("anticheat.json")] = H.cjson.encode(stored)
    H.response = { status = 500, body = "" }

    local payload, stale, err = anticheat.get("1", false)
    assert_eq(payload.status, "Denied", "stale payload still served")
    assert_eq(stale, true, "stale flag")
    assert_eq(err, "network", "error")
end)

check("anticheat survives a stored index missing its index table", function()
    -- This is the defect the implementer caught: a structurally valid stored
    -- file with no index would previously crash on stored.index[appId].
    local anticheat = require("anticheat")
    H.plant("anticheat.json", H.cjson.encode({ v = 1, data = { fetchedAt = os.time() } }))
    local payload, stale, err = anticheat.get("1", false)
    assert_eq(payload, nil, "payload")
    assert_eq(stale, false, "stale")
    assert_eq(err, nil, "err")
end)

check("anticheat survives a broken stored index when the network is also down", function()
    local anticheat = require("anticheat")
    H.plant("anticheat.json", H.cjson.encode({ v = 1, data = { fetchedAt = os.time() - 999999 } }))
    H.http_error = "connection refused"
    local payload, stale, err = anticheat.get("1", false)
    assert_eq(payload, nil, "payload")
    assert_eq(stale, true, "stale")
    assert_eq(err, "network", "error")
end)

check("anticheat returns the index's age as a fourth value", function()
    local anticheat = require("anticheat")
    H.response = {
        status = 200,
        body = H.cjson.encode({
            { name = "A", status = "Denied", anticheats = {}, storeIds = { steam = "1" }, notes = {} },
        }),
    }
    local _, _, _, fetchedAt = anticheat.get("1", false)
    assert(fetchedAt and fetchedAt > 0, "a fresh download should report roughly now")

    local _, _, _, cachedAt = anticheat.get("1", false)
    assert_eq(cachedAt, fetchedAt, "a cache hit should report the stored index's age")
end)

-- ── anticheat: failure backoff (Fix 3) ──────────────────────────────────────

check("anticheat persists a failure timestamp when the download fails", function()
    local anticheat = require("anticheat")
    H.response = { status = 500, body = "" }
    anticheat.get("1", false)
    local stored = H.cjson.decode(H.files[H.cache_file("anticheat.json")])
    assert(stored.data.failedAt ~= nil, "failedAt should be persisted")
end)

check("anticheat does not re-download within the failure cooldown", function()
    local anticheat = require("anticheat")
    H.response = { status = 500, body = "" }
    anticheat.get("1", false)
    local first = H.http_calls
    local payload, stale, err = anticheat.get("1", false)
    assert_eq(H.http_calls, first, "a second call inside the cooldown should not hit the network")
    assert_eq(stale, true, "stale")
    assert_eq(err, "network", "error")
end)

check("anticheat force bypasses the failure cooldown", function()
    local anticheat = require("anticheat")
    H.response = { status = 500, body = "" }
    anticheat.get("1", false)
    local first = H.http_calls
    anticheat.get("1", true)
    assert_eq(H.http_calls, first + 1, "force should bypass the cooldown and re-download")
end)

check("anticheat clears failedAt after a later success", function()
    local anticheat = require("anticheat")
    H.response = { status = 500, body = "" }
    anticheat.get("1", false)

    H.response = {
        status = 200,
        body = H.cjson.encode({
            { name = "A", status = "Denied", anticheats = {}, storeIds = { steam = "1" }, notes = {} },
        }),
    }
    anticheat.get("1", true) -- force bypasses the cooldown to retry immediately

    local stored = H.cjson.decode(H.files[H.cache_file("anticheat.json")])
    assert_eq(stored.data.failedAt, nil, "a success should clear the recorded backoff")
end)

-- ── anticheat: malformed upstream documents (Fix 6) ─────────────────────────

check("anticheat's collapse skips non-table entries in the upstream array", function()
    local anticheat = require("anticheat")
    H.response = {
        status = 200,
        body = H.cjson.encode({
            42,
            "not a game",
            { name = "Valid", status = "Denied", anticheats = { "EAC" }, storeIds = { steam = "12345" }, notes = {} },
        }),
    }
    local payload, stale, err = anticheat.get("12345", false)
    assert_eq(payload.status, "Denied", "the one valid entry should still be indexed")
    assert_eq(stale, false, "stale")
    assert_eq(err, nil, "err")
end)

check("anticheat keeps the previous index when upstream parses to an empty array", function()
    local anticheat = require("anticheat")
    H.response = {
        status = 200,
        body = H.cjson.encode({
            { name = "A", status = "Denied", anticheats = {}, storeIds = { steam = "1" }, notes = {} },
        }),
    }
    anticheat.get("1", false) -- populate a non-empty index

    H.response = { status = 200, body = H.cjson.encode({}) } -- schema change upstream
    local payload, stale, err = anticheat.get("1", true) -- force past the freshness check

    assert_eq(payload.status, "Denied", "the previous entry should be retained")
    assert_eq(stale, true, "stale")
    assert_eq(err, "parse", "an empty result should be treated as a schema mismatch, not an answer")

    local stored = H.cjson.decode(H.files[H.cache_file("anticheat.json")])
    assert(stored.data.index["1"] ~= nil, "the cache file itself should still hold the previous index")
end)

-- ── protondb ─────────────────────────────────────────────────────────────

check("protondb returns a fetched summary", function()
    local protondb = require("protondb")
    H.response = { status = 200, body = H.cjson.encode({ tier = "gold", score = 0.84 }) }
    local r = protondb.get("570", false)
    assert_eq(r.payload.tier, "gold", "tier")
    assert_eq(r.stale, false, "stale")
    assert_eq(r.err, nil, "err")
end)

check("protondb treats 404 as no reports rather than an error", function()
    local protondb = require("protondb")
    H.response = { status = 404, body = "" }
    local r = protondb.get("570", false)
    assert_eq(r.payload, nil, "payload")
    assert_eq(r.err, nil, "err")
    assert_eq(r.stale, false, "stale")
end)

check("protondb serves a fresh entry without re-fetching", function()
    local protondb = require("protondb")
    H.response = { status = 200, body = H.cjson.encode({ tier = "gold" }) }
    protondb.get("570", false)
    local first = H.http_calls
    protondb.get("570", false)
    assert_eq(H.http_calls, first, "second call should not hit the network")
end)

check("protondb force bypasses a fresh entry", function()
    local protondb = require("protondb")
    H.response = { status = 200, body = H.cjson.encode({ tier = "gold" }) }
    protondb.get("570", false)
    local first = H.http_calls
    protondb.get("570", true)
    assert_eq(H.http_calls, first + 1, "force should re-fetch")
end)

check("protondb reports fetchedAt as the data's age, not the call time", function()
    local protondb = require("protondb")
    H.response = { status = 200, body = H.cjson.encode({ tier = "gold" }) }
    protondb.get("570", false)

    local stored = H.cjson.decode(H.files[H.cache_file("apps.json")])
    local planted = os.time() - 120
    stored.data["570"].fetchedAt = planted
    H.files[H.cache_file("apps.json")] = H.cjson.encode(stored)

    local r = protondb.get("570", false)
    assert_eq(r.fetchedAt, planted, "fetchedAt should be the cached age")
end)

check("protondb serves stale data when the network fails", function()
    local protondb = require("protondb")
    H.response = { status = 200, body = H.cjson.encode({ tier = "gold" }) }
    protondb.get("570", false)

    local stored = H.cjson.decode(H.files[H.cache_file("apps.json")])
    stored.data["570"].fetchedAt = os.time() - 999999
    H.files[H.cache_file("apps.json")] = H.cjson.encode(stored)
    H.http_error = "connection refused"

    local r = protondb.get("570", false)
    assert_eq(r.payload.tier, "gold", "stale payload still served")
    assert_eq(r.stale, true, "stale flag")
    assert_eq(r.err, "network", "error")
end)

check("protondb reports an error with no payload when nothing is cached", function()
    local protondb = require("protondb")
    H.http_error = "connection refused"
    local r = protondb.get("570", false)
    assert_eq(r.payload, nil, "payload")
    assert_eq(r.stale, false, "stale")
    assert_eq(r.err, "network", "error")
end)

check("protondb survives a non-table entry in the stored file", function()
    -- The second half of the reported defect: a scalar where a table was
    -- expected would previously crash on stored.protondb.
    local protondb = require("protondb")
    H.plant("apps.json", H.cjson.encode({ v = 1, data = { ["570"] = "corrupt scalar" } }))
    H.response = { status = 200, body = H.cjson.encode({ tier = "gold" }) }
    local r = protondb.get("570", false)
    assert_eq(r.payload.tier, "gold", "should refetch and succeed")
end)

check("protondb surfaces an unexpected http status as an error", function()
    local protondb = require("protondb")
    H.response = { status = 503, body = "" }
    local r = protondb.get("570", false)
    assert_eq(r.payload, nil, "payload")
    assert_eq(r.err, "http_503", "error")
end)

-- ── protondb.get_cached (list surfaces; never touches the network) ─────────

check("get_cached returns only apps present and unexpired", function()
    local cache = require("cache")
    local protondb = require("protondb")
    cache.write("apps.json", {
        ["570"] = { protondb = { tier = "gold" }, fetchedAt = os.time() },
        ["620"] = { protondb = { tier = "platinum" }, fetchedAt = os.time() },
    })
    local out = protondb.get_cached({ "570", "620" })
    assert_eq(out["570"].tier, "gold", "570 tier")
    assert_eq(out["620"].tier, "platinum", "620 tier")
end)

check("get_cached omits expired entries", function()
    local cache = require("cache")
    local protondb = require("protondb")
    cache.write("apps.json", {
        ["570"] = { protondb = { tier = "gold" }, fetchedAt = os.time() - 999999 },
    })
    local out = protondb.get_cached({ "570" })
    assert_eq(out["570"], nil, "expired entry should be omitted")
end)

check("get_cached omits non-table entries", function()
    local cache = require("cache")
    local protondb = require("protondb")
    cache.write("apps.json", {
        ["570"] = "corrupt scalar",
    })
    local out = protondb.get_cached({ "570" })
    assert_eq(out["570"], nil, "corrupt entry should be omitted")
end)

check("get_cached omits ids absent from the cache", function()
    local cache = require("cache")
    local protondb = require("protondb")
    cache.write("apps.json", {
        ["570"] = { protondb = { tier = "gold" }, fetchedAt = os.time() },
    })
    local out = protondb.get_cached({ "570", "999" })
    assert(out["570"], "570 should be present")
    assert_eq(out["999"], nil, "999 was never cached")
end)

check("get_cached never performs HTTP", function()
    local cache = require("cache")
    local protondb = require("protondb")
    cache.write("apps.json", {
        ["570"] = { protondb = { tier = "gold" }, fetchedAt = os.time() },
    })
    protondb.get_cached({ "570", "620", "999" })
    assert_eq(H.http_calls, 0, "get_cached must never touch the network")
end)

-- ── main (fetch_app_data) ───────────────────────────────────────────────────
--
-- These are the first tests to load backend/main.lua. It defines a *global*
-- fetch_app_data (Millennium's IPC entry point), so it is loaded with dofile
-- rather than require: dofile re-executes the chunk on every call, which is
-- what lets each check redefine the global against fresh stubs.

check("fetch_app_data reports the older of the two sources' timestamps", function()
    -- A fresh ProtonDB result next to a stale-but-still-cached anticheat
    -- index must not be reported as though everything on screen were fresh.
    H.response = { status = 200, body = H.cjson.encode({ tier = "gold" }) }
    dofile("backend/main.lua")

    local old_at = os.time() - 3600
    H.plant("anticheat.json", H.cjson.encode({
        v = 1,
        data = { fetchedAt = old_at, index = { ["570"] = { status = "Denied", anticheats = {} } } },
    }))

    local raw = fetch_app_data("570", false)
    local decoded = H.cjson.decode(raw)
    assert_eq(decoded.protondb.tier, "gold", "protondb payload should still resolve")
    assert_eq(decoded.meta.fetchedAt, old_at, "meta.fetchedAt should be the older anticheat timestamp")
end)

check("fetch_app_data sets per-source error fields independently", function()
    -- Anticheat is served from a fresh cache entry (no network call at all),
    -- while protondb's request fails, so only protondbError should be set.
    H.plant("anticheat.json", H.cjson.encode({
        v = 1,
        data = { fetchedAt = os.time(), index = { ["570"] = { status = "Denied", anticheats = {} } } },
    }))
    H.http_error = "connection refused"
    dofile("backend/main.lua")

    local raw = fetch_app_data("570", false)
    local decoded = H.cjson.decode(raw)
    assert_eq(decoded.anticheat.status, "Denied", "the anticheat payload should still be present")
    assert_eq(decoded.meta.protondbError, "network", "protondbError should name the failing source")
    assert_eq(decoded.meta.anticheatError, H.cjson.null, "anticheatError should be null when anticheat succeeded")
end)

check("fetch_app_data degrades to an error envelope when a source raises", function()
    -- Defence in depth alongside Fix 6: even if a source's own guards were
    -- ever incomplete, a raise inside it must not escape the IPC call.
    package.loaded["anticheat"] = {
        get = function() error("boom from anticheat") end,
    }
    H.response = { status = 200, body = H.cjson.encode({ tier = "gold" }) }
    dofile("backend/main.lua")

    local raw = fetch_app_data("570", false)
    local decoded = H.cjson.decode(raw)
    assert_eq(decoded.protondb.tier, "gold", "the healthy source should still resolve")
    assert_eq(decoded.meta.anticheatError, "internal", "the raising source should degrade to an internal error")
end)

-- ── main (fetch_cached_tiers) ───────────────────────────────────────────────

check("fetch_cached_tiers returns a decodable envelope for valid input", function()
    local cache = require("cache")
    cache.write("apps.json", {
        ["570"] = { protondb = { tier = "gold" }, fetchedAt = os.time() },
    })
    dofile("backend/main.lua")

    local raw = fetch_cached_tiers(H.cjson.encode({ "570", "620" }))
    local decoded = H.cjson.decode(raw)
    assert_eq(decoded.v, 1, "envelope version")
    assert_eq(decoded.tiers["570"].tier, "gold", "570 should resolve from cache")
    assert_eq(H.http_calls, 0, "fetch_cached_tiers must never touch the network")
end)

check("fetch_cached_tiers returns a decodable envelope for garbage input", function()
    dofile("backend/main.lua")

    local raw = fetch_cached_tiers("not json at all")
    local decoded = H.cjson.decode(raw)
    assert_eq(decoded.v, 1, "envelope version")
    assert_eq(next(decoded.tiers), nil, "tiers should be empty for undecodable input")
end)

check("fetch_cached_tiers degrades to an empty envelope when get_cached raises", function()
    package.loaded["protondb"] = {
        get_cached = function() error("boom from protondb") end,
        get = function() return { payload = nil, fetchedAt = os.time(), stale = false, err = nil } end,
    }
    dofile("backend/main.lua")

    local raw = fetch_cached_tiers(H.cjson.encode({ "570" }))
    local decoded = H.cjson.decode(raw)
    assert_eq(decoded.v, 1, "envelope version")
    assert_eq(next(decoded.tiers), nil, "a raise inside get_cached should degrade to an empty envelope")
end)

-- ── main: cjson.encode failure guard (Fix 8) ────────────────────────────────
--
-- The final cjson.encode in each entry point was previously unwrapped, so an
-- unencodable payload (e.g. a stray function value surviving from a corrupt
-- cached table) would raise straight across the IPC boundary instead of
-- degrading to an error envelope like every other failure mode here.

check("fetch_app_data still returns decodable JSON when the payload encodes cleanly", function()
    H.response = { status = 200, body = H.cjson.encode({ tier = "gold" }) }
    dofile("backend/main.lua")

    local raw = fetch_app_data("570", false)
    local decoded = H.cjson.decode(raw)
    assert_eq(decoded.v, 1, "envelope version")
    assert_eq(decoded.protondb.tier, "gold", "protondb tier should round-trip")
end)

check("fetch_cached_tiers still returns decodable JSON when the payload encodes cleanly", function()
    local cache = require("cache")
    cache.write("apps.json", {
        ["570"] = { protondb = { tier = "gold" }, fetchedAt = os.time() },
    })
    dofile("backend/main.lua")

    local raw = fetch_cached_tiers(H.cjson.encode({ "570" }))
    local decoded = H.cjson.decode(raw)
    assert_eq(decoded.v, 1, "envelope version")
    assert_eq(decoded.tiers["570"].tier, "gold", "570 should resolve from cache")
end)

check("fetch_app_data falls back to a known-encodable envelope when encoding raises", function()
    -- Without the pcall guard, cjson.encode raising here would propagate
    -- straight out of fetch_app_data instead of degrading gracefully, and
    -- this check would fail with the raw encode error rather than the
    -- expected fallback literal.
    package.loaded["protondb"] = {
        get = function()
            return { payload = { tier = "gold", weird = function() end }, fetchedAt = os.time(), stale = false, err = nil }
        end,
    }
    dofile("backend/main.lua")

    local raw = fetch_app_data("570", false)
    assert_eq(
        raw,
        '{"v":1,"protondb":null,"anticheat":null,"meta":{"fetchedAt":0,"stale":false,"error":"internal","protondbError":"internal","anticheatError":"internal"}}',
        "fallback envelope"
    )
end)

check("fetch_cached_tiers falls back to a known-encodable envelope when encoding raises", function()
    package.loaded["protondb"] = {
        get_cached = function() return { ["570"] = { tier = "gold", weird = function() end } } end,
        get = function() return { payload = nil, fetchedAt = os.time(), stale = false, err = nil } end,
    }
    dofile("backend/main.lua")

    local raw = fetch_cached_tiers(H.cjson.encode({ "570" }))
    assert_eq(raw, '{"v":1,"tiers":{}}', "fallback envelope")
end)

check("protondb backs off instead of refetching a failing app on every view", function()
    -- A ProtonDB outage must not mean one request per page view, from every
    -- user running the plugin.
    local protondb = require("protondb")
    H.http_error = "connection refused"

    protondb.get("570", false)
    local after_first = H.http_calls

    local r = protondb.get("570", false)
    assert_eq(H.http_calls, after_first, "the second view should not hit the network")
    assert_eq(r.stale, true, "stale")
    assert_eq(r.err, "network", "error is carried through the cooldown")
end)

check("protondb force bypasses the failure cooldown", function()
    local protondb = require("protondb")
    H.http_error = "connection refused"
    protondb.get("570", false)
    local after_first = H.http_calls

    protondb.get("570", true)
    assert_eq(H.http_calls, after_first + 1, "force should retry immediately")
end)

check("protondb keeps serving a stale payload while cooling", function()
    local protondb = require("protondb")
    H.response = { status = 200, body = H.cjson.encode({ tier = "gold" }) }
    protondb.get("570", false)

    -- expire it, then break the network
    local stored = H.cjson.decode(H.files[H.cache_file("apps.json")])
    stored.data["570"].fetchedAt = os.time() - 999999
    H.files[H.cache_file("apps.json")] = H.cjson.encode(stored)
    H.http_error = "connection refused"

    protondb.get("570", false)
    local after_fail = H.http_calls

    local r = protondb.get("570", false)
    assert_eq(H.http_calls, after_fail, "no network call while cooling")
    assert_eq(r.payload.tier, "gold", "the stale payload is still served")
end)

check("a protondb success clears the backoff", function()
    local protondb = require("protondb")
    H.http_error = "connection refused"
    protondb.get("570", false)

    H.http_error = nil
    H.response = { status = 200, body = H.cjson.encode({ tier = "gold" }) }
    local r = protondb.get("570", true)
    assert_eq(r.err, nil, "the forced retry succeeds")

    local stored = H.cjson.decode(H.files[H.cache_file("apps.json")])
    assert_eq(stored.data["570"].failedAt, nil, "no failure marker survives a success")
end)

-- ── install mode ──────────────────────────────────────────────────────────

check("main.lua loads against the module set Millennium actually provides", function()
    -- The host preloads its C modules under these exact names (lua_host/main.cc)
    -- and puts <plugin>/backend on package.path, then loadfile()s main.lua.
    --
    -- The name that matters is "json": Millennium registers luaopen_cjson as
    -- "json", NOT "cjson", and defines no global either. This harness used to
    -- register "cjson" - inventing a module the host does not provide - which
    -- is exactly why a whole suite passed while the plugin died on load.
    assert(package.preload["json"], "the host registers luaopen_cjson as 'json'")
    assert(not package.preload["cjson"],
        "nothing may preload 'cjson': the host does not provide it, and pretending otherwise " ..
        "is what let this suite pass while the plugin failed to load")

    for _, name in ipairs({ "cache", "protondb", "anticheat" }) do
        package.loaded[name] = nil
    end

    local chunk, load_err = loadfile("backend/main.lua")
    assert(chunk, "could not load main.lua: " .. tostring(load_err))

    local ok, definition = pcall(chunk)
    assert(ok, "main.lua must execute against the real module set, got: " .. tostring(definition))
    assert(type(definition) == "table", "main.lua must return a table")
    assert(type(definition.on_load) == "function", "on_load must be defined")
    assert(type(fetch_app_data) == "function", "fetch_app_data must be defined globally")
    assert(type(fetch_cached_tiers) == "function", "fetch_cached_tiers must be defined globally")
end)

-- ── summary ──────────────────────────────────────────────────────────────

print(string.format("\n%d passed, %d failed", passed, failed))
os.exit(failed == 0 and 0 or 1)
