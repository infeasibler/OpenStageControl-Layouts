local source = debug.getinfo(1, "S").source
local script_path = source:sub(2)
local script_directory = script_path:match("^(.*[\\/])")
local launcher = script_directory .. "start-xcontrol-with-track-bridge.ps1"
local file = io.open(launcher, "r")

if not file then
    launcher = "C:\\development\\OpenStageControl-Layouts\\X_Control\\start-xcontrol-with-track-bridge.ps1"
    file = io.open(launcher, "r")
end

if not file then
    reaper.ShowMessageBox("Could not find the X-Control launcher script:\n" .. launcher, "X-Control", 0)
    return
end

file:close()
local command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' .. launcher .. '"'

reaper.ExecProcess(command, -1)
