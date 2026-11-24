# Wing Control: follow selected REAPER track

The optional `reaper-follow-selected.js` Open Stage Control custom module makes
the first fader follow the track selected in REAPER. It does not scroll the
Mixer. The other seven faders follow the subsequent OSC track slots. Bank -/+
move the surface window by one slot; selecting another track follows it again.
The first button row controls mute and the second controls solo for each track.
The eight knobs above them control pan.
The transport arrow buttons scrub backward or forward while held.
The A/B buttons align to bar starts: back selects the current bar start (then
the previous bar if already aligned); forward selects the next bar start.
The transport panel buttons toggle loop and record, and trigger stop and play.

1. In REAPER, use the `Fire` OSC profile with Open Stage Control sending to
   `127.0.0.1:8000` and listening on port `9000`.
2. In the Open Stage Control launcher, set **Custom module** to
   `reaper-follow-selected.js` in this folder, then start the server and load
   `wControl-smaller.json`.
3. Select a track in REAPER. Wait for its track names and control states to
   arrive before using the controls. A `Waiting` label means feedback has not
   arrived; messages for an uninitialized control are blocked.

The module temporarily requests a 32-track OSC window and disables
Mixer-follow for that device. It uses REAPER action 41743 to refresh feedback,
so action messages must be allowed for the OSC control surface. Tracks beyond
slot 32 cannot be controlled with this module. Only use it with this layout and
the `Fire` profile; disable the module for other sessions. When the server
stops, it requests restoration of the profile's 8-track Mixer-follow settings.

## Hide tracks inside collapsed folders

To keep tracks inside collapsed folders off the surface, add
`reaper-visible-tracks.lua` to REAPER through **Actions → Show action list →
ReaScript: Load**, then run the action. It monitors Mixer visibility and folder
collapse state in both the Arrange and Mixer views while REAPER is open. The
folder track itself remains available; its hidden children are omitted, and
the surface bank advances through the remaining visible tracks. Run the
helper whenever using this layout. To run it automatically each time REAPER
starts, copy `reaper-startup.lua` to the REAPER Scripts folder and name the
copy `__startup.lua`. The startup wrapper loads the helper alongside itself.

The helper writes `%APPDATA%\REAPER\wControl-visible-tracks.txt` by default.
For X-Control, start the surface and bridge together by running
`X_Control/start-xcontrol-with-track-bridge.ps1`. It launches Open Stage Control
and its companion bridge, or attaches the bridge if the server is already
running. The bridge reads that file and sends the visible-track list and
selected track on port 9000; it stops when the surface server exits. To use a
custom file location, set `WCONTROL_VISIBLE_TRACKS_FILE` to the same full path
for REAPER and the bridge.

The smaller X-Control layout also supports this helper. Load
`X_Control/reaper-follow.config` in Open Stage Control to use its matching
custom module; restart the server after changing the module. The custom module
does not read local files; the Node bridge provides that connection. If using
the launcher script, do not also start a separate Open Stage Control server on
port 9000.

To add a REAPER toolbar button for the launcher, load
`X_Control/start-xcontrol-with-track-bridge.lua` using **Actions → Show action
list → ReaScript: Load**, then use **Add to toolbar** for the loaded action.
Clicking the button starts the launcher script; stop the surface server before
clicking it again.
