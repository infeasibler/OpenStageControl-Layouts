local refresh_interval = 0.25
local track_limit = 32
local resource_path = reaper.GetResourcePath()
local visibility_file = os.getenv("WCONTROL_VISIBLE_TRACKS_FILE")
if not visibility_file or visibility_file == "" then
    local separator = package.config:sub(1, 1)
    local app_data = os.getenv("APPDATA")
    if app_data and app_data ~= "" then
        visibility_file = app_data .. separator .. "REAPER" .. separator .. "wControl-visible-tracks.txt"
    else
        visibility_file = resource_path .. separator .. "wControl-visible-tracks.txt"
    end
end

local last_content = nil
local last_error = nil
local next_update = 0

local function get_visible_tracks()
    local visible = {}
    local debug = {}
    local hidden_folder_depth = 0

    for index = 0, reaper.CountTracks(0) - 1 do
        local track = reaper.GetTrack(0, index)
        local folder_depth = reaper.GetMediaTrackInfo_Value(track, "I_FOLDERDEPTH")
        local folder_compact = reaper.GetMediaTrackInfo_Value(track, "I_FOLDERCOMPACT")
        local is_visible = reaper.GetMediaTrackInfo_Value(track, "B_SHOWINMIXER") ~= 0
        local arrange_collapse, mixer_collapse = 0, 0
        if folder_depth > 0 then
            local _, chunk = reaper.GetTrackStateChunk(track, "", false)
            arrange_collapse, mixer_collapse =
                (chunk or ""):match("[\r\n]BUSCOMP%s+(%d+)%s+(%d+)")
            arrange_collapse = tonumber(arrange_collapse) or 0
            mixer_collapse = tonumber(mixer_collapse) or 0
        end

        if index < track_limit and hidden_folder_depth == 0 and is_visible then
            visible[#visible + 1] = tostring(index + 1)
        end
        if index < track_limit then
            debug[#debug + 1] = string.format("%d:%g/%g/%d/%d/%g/%d/%d", index + 1, folder_depth,
                folder_compact, reaper.GetMediaTrackInfo_Value(track, "B_SHOWINTCP") ~= 0 and 1 or 0,
                is_visible and 1 or 0, hidden_folder_depth, arrange_collapse, mixer_collapse)
        end

        if folder_depth > 0 and (folder_compact > 0 or arrange_collapse > 0 or mixer_collapse > 0) then
            hidden_folder_depth = hidden_folder_depth + folder_depth
        elseif folder_depth < 0 then
            hidden_folder_depth = math.max(0, hidden_folder_depth + folder_depth)
        end
    end

    local selected_track = reaper.GetSelectedTrack(0, 0)
    local selected_index = selected_track and
        reaper.GetMediaTrackInfo_Value(selected_track, "IP_TRACKNUMBER") or 0
    return table.concat(visible, ","), string.format("%d", selected_index), table.concat(debug, ",")
end

local function write_visibility(content)
    local temporary_file = visibility_file .. ".tmp"
    local file, err = io.open(temporary_file, "w")
    if not file then
        return nil, err
    end

    local written, write_error = file:write(content)
    if not written then
        file:close()
        return nil, write_error
    end
    local ok, close_error = file:close()
    if not ok then
        return nil, close_error
    end

    os.remove(visibility_file)
    local renamed, rename_error = os.rename(temporary_file, visibility_file)
    if not renamed then
        return nil, rename_error
    end
    return true
end

local function update()
    local now = reaper.time_precise()
    if now >= next_update then
        local visible, selected_index, debug = get_visible_tracks()
        local content = "v1\n" .. tostring(os.time() * 1000) ..
            "\n" .. visible .. "\n" .. selected_index .. "\n#" .. debug .. "\n"

        if content ~= last_content then
            local ok, err = write_visibility(content)
            if ok then
                last_content = content
                last_error = nil
            elseif err ~= last_error then
                reaper.ShowConsoleMsg("W-Control visible-track helper: " .. tostring(err) .. "\n")
                last_error = err
            end
        end
        next_update = now + refresh_interval
    end

    reaper.defer(update)
end

reaper.defer(update)
