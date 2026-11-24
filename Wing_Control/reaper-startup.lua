local source = debug.getinfo(1, "S").source
local startup_path = source:sub(2)
local script_directory = startup_path:match("^(.*[\\/])")

if not script_directory then
    error("Could not determine the REAPER Scripts directory for the visibility helper.")
end

dofile(script_directory .. "reaper-visible-tracks.lua")
