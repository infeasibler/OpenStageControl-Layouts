const dgram = require('node:dgram')
const fs = require('node:fs')
const path = require('node:path')

const targetHost = '127.0.0.1'
const targetPort = Number(process.env.WCONTROL_OSC_PORT) || 9000
const refreshMs = 250
const maxTrackCount = 32

function encodeOscString(value) {
    const source = Buffer.from(`${value}\0`, 'utf8')
    const padded = Buffer.alloc(Math.ceil(source.length / 4) * 4)
    source.copy(padded)
    return padded
}

function parseVisibilityContent(content, now = Date.now()) {
    const lines = content.trimEnd().split(/\r?\n/)
    if (lines[0] !== 'v1' || !Number.isFinite(Number(lines[1])) ||
        now - Number(lines[1]) > 3000) {
        throw new Error('visibility data is invalid or stale')
    }

    const indexes = lines[2] ? lines[2].split(',').map(Number) : []
    const selectedTrack = Number(lines[3])
    if (indexes.some(index => !Number.isInteger(index) || index < 1 || index > maxTrackCount) ||
        new Set(indexes).size !== indexes.length || !Number.isInteger(selectedTrack) ||
        selectedTrack < 0 || selectedTrack > maxTrackCount) {
        throw new Error('visibility data contains invalid track indexes')
    }

    return {indexes, selectedTrack}
}

function encodeTrackState(indexes, selectedTrack) {
    const selected = Buffer.alloc(4)
    selected.writeInt32BE(selectedTrack)
    return Buffer.concat([
        encodeOscString('/wcontrol/track_state'),
        encodeOscString(',si'),
        encodeOscString(indexes.join(',')),
        selected
    ])
}

function startBridge() {
    const visibilityFile = process.env.WCONTROL_VISIBLE_TRACKS_FILE ||
        (process.env.APPDATA && path.join(process.env.APPDATA, 'REAPER', 'wControl-visible-tracks.txt'))
    if (!visibilityFile) {
        throw new Error('Set APPDATA or WCONTROL_VISIBLE_TRACKS_FILE before starting the bridge.')
    }

    const socket = dgram.createSocket('udp4')
    let lastState = null
    let lastWarning = null

    function warnOnce(message) {
        if (lastWarning === message) return
        lastWarning = message
        console.warn(`X-Control track bridge: ${message}`)
    }

    function poll() {
        let content
        try {
            content = fs.readFileSync(visibilityFile, 'utf8')
        } catch (error) {
            if (error.code === 'ENOENT') {
                warnOnce(`waiting for ${visibilityFile}`)
            } else {
                warnOnce(`cannot read visibility data: ${error.message}`)
            }
            return
        }

        let state
        try {
            state = parseVisibilityContent(content)
        } catch (error) {
            warnOnce(`${error.message}; check the REAPER helper.`)
            return
        }

        lastWarning = null
        const key = `${state.indexes.join(',')}|${state.selectedTrack}`
        if (key === lastState) return

        socket.send(encodeTrackState(state.indexes, state.selectedTrack), targetPort, targetHost, error => {
            if (error) warnOnce(`cannot send OSC state: ${error.message}`)
        })
        lastState = key
    }

    socket.on('error', error => {
        console.error(`X-Control track bridge: ${error.message}`)
        socket.close()
        process.exitCode = 1
    })

    console.log(`X-Control track bridge reading ${visibilityFile} and sending to ${targetHost}:${targetPort}`)
    poll()
    setInterval(poll, refreshMs)
}

if (require.main === module) startBridge()

module.exports = {encodeTrackState, parseVisibilityContent}
