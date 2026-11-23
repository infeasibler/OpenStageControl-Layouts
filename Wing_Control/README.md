# Wing Control: follow selected REAPER track

The optional `reaper-follow-selected.js` Open Stage Control custom module makes
the first fader follow the track selected in REAPER. It does not scroll the
Mixer. The other seven faders follow the subsequent OSC track slots. Bank -/+
move the surface window by one slot; selecting another track follows it again.
The first button row controls mute and the second controls solo for each track.
The eight knobs above them control pan.
The transport arrow buttons scrub backward or forward while held.

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
