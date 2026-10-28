local logger     = require("logger")
local millennium = require("millennium")

-- Required for its side effects: defines the ---@ffi globals the frontend and
-- webview call as backend.<name>(...).
require("rpc_functions")

local function on_load()
    local utils = require("utils")
    logger:info("ProtonDB plugin loaded; backend path: " .. tostring(utils.get_backend_path()))
    require("settings").probe_config_api()
    millennium.ready()
end

local function on_unload() end
local function on_frontend_loaded() end

--- Rewrites of Steam's own JavaScript, applied before the client loads it.
---
--- One patch: append our stat to the children of the library play bar's stats
--- row, so Steam renders the rating itself. Everything tried from outside
--- that row failed - route patches never fired, DOM injection landed in a
--- hidden copy of the bar, and wrapping the route component remounted the
--- whole library page on every render.
---
--- The anchor is deliberately narrow. `GameStatsSection` appears twice in
--- sp.js: once as a class-name map entry (`GameStatsSection:"_1mDAV..."`) and
--- once at the render site matched here. This shape - the jsxs call, the div,
--- the className lookup and the opening of the children array - occurs
--- exactly once in the whole bundle, checked against the installed Steam.
---
--- The replacement keeps Steam's own captured jsx function and guards the
--- export with `||(()=>null)`, so a missing or renamed export renders nothing
--- rather than throwing inside Steam's render tree.
---
--- Capture groups belong to `match`, not to `find`. A transform may only
--- rewrite what its own match captured, so a `\1` referring to a group in
--- `find` has nothing to resolve against and the whole transform is dropped.
--- That is why `match` repeats the anchor in full and `replace` reproduces it
--- before appending the stat.
local function get_patches()
    return {
        {
            file = [[sp\.js]],
            find = [[\(0,\w+\.jsxs\)\("div",\{className:\w+\(\)\.GameStatsSection,children:\[]],
            transforms = {
                {
                    match   = [[\(0,(\w+)\.jsxs\)\("div",\{className:(\w+)\(\)\.GameStatsSection,children:\[]],
                    replace = [[(0,\1.jsxs)("div",{className:\2().GameStatsSection,children:[(0,\1.jsx)(#{{self}}?.LibraryProtonDBStat||(()=>null),{...this.props}),]],
                },
            },
        },
    }
end

return {
    on_load = on_load,
    on_unload = on_unload,
    on_frontend_loaded = on_frontend_loaded,
    patches = get_patches(),
}
