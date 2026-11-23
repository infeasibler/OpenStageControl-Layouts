// Optional Open Stage Control custom module for the smaller Wing layout.
const reaperHost = '127.0.0.1'
const reaperPort = 8000
const trackCount = 32
const surfaceCount = 8
let firstSlot = null
let selectedSlot = null
let tracks = {}

function notify(message) {
    console.warn('Wing REAPER follow:', message)
    receive('/NOTIFY', '^warning', message)
}

function renderSlot(slot, changed) {
    const trackIndex = firstSlot === null ? null : firstSlot + slot - 1
    const track = tracks[trackIndex]
    const ready = track && track.name !== undefined && track.volume !== undefined && track.pan !== undefined
    const buttonsReady = track && track.mute !== undefined && track.solo !== undefined
    receive(`/track/${slot}/name`, trackIndex > trackCount ? 'Out of range' :
        ready && buttonsReady ? track.name : 'Waiting')
    if (track && track.name !== undefined && track.volume !== undefined && (!changed || changed === 'volume')) {
        receive(`/track/${slot}/volume`, track.volume)
    }
    if (track && track.pan !== undefined && (!changed || changed === 'pan')) {
        receive(`/track/${slot}/pan`, track.pan)
    }
    for (const property of ['mute', 'solo']) {
        if (!changed || changed === property) {
            receive(`/track/${slot}/${property}`, track && track[property] !== undefined ? track[property] : 0)
        }
    }
}

function renderWindow() {
    for (let slot = 1; slot <= surfaceCount; slot++) renderSlot(slot)
}

function requestRefresh() {
    send(reaperHost, reaperPort, '/action/41743')
}

function configure() {
    firstSlot = null
    selectedSlot = null
    tracks = {}
    send(reaperHost, reaperPort, '/device/track/bank/follows/device')
    send(reaperHost, reaperPort, '/device/track/count', {type: 'i', value: trackCount})
    send(reaperHost, reaperPort, '/device/track/bank/select/1')
    requestRefresh()
}

app.on('sessionOpened', function() {
    renderWindow()
    requestRefresh()
})

module.exports = {
    init: configure,
    reload: configure,

    stop: function() {
        send(reaperHost, reaperPort, '/device/track/count', {type: 'i', value: 8})
        send(reaperHost, reaperPort, '/device/track/bank/follows/mixer')
        requestRefresh()
    },

    oscInFilter: function(data) {
        if (data.host !== reaperHost) return data
        const match = /^\/track\/(\d+)\/(name|volume|pan|mute|solo|select)$/.exec(data.address)
        if (!match) return data
        const index = Number(match[1])
        if (index < 1 || index > trackCount || !data.args.length) return data
        const property = match[2]
        const value = data.args[0].value

        if (property === 'select') {
            if (value === 1 || value === true) {
                selectedSlot = index
                firstSlot = index
                renderWindow()
            } else if (index === selectedSlot && (value === 0 || value === false)) {
                selectedSlot = null
                firstSlot = null
                renderWindow()
            }
            return data
        }

        if (!tracks[index]) tracks[index] = {}
        tracks[index][property] = value
        const slot = firstSlot === null ? 0 : index - firstSlot + 1
        if (slot >= 1 && slot <= surfaceCount) renderSlot(slot, property)
    },

    oscOutFilter: function(data) {
        if (data.host !== reaperHost || Number(data.port) !== reaperPort) return data
        if (data.address === '/device/track/bank/-' || data.address === '/device/track/bank/+') {
            if (data.args.length && !data.args[0].value) return
            if (firstSlot === null) {
                notify('Select a REAPER track before moving the surface bank.')
                return
            }
            const step = data.address.endsWith('/+') ? 1 : -1
            firstSlot = Math.max(1, Math.min(trackCount, firstSlot + step))
            renderWindow()
            return
        }

        const match = /^\/track\/([1-8])\/(volume|pan|mute|solo)$/.exec(data.address)
        if (!match) return data
        const index = firstSlot === null ? null : firstSlot + Number(match[1]) - 1
        const property = match[2]
        const track = tracks[index]
        if (!track || track.name === undefined || track[property] === undefined) {
            if (property !== 'volume') renderSlot(Number(match[1]))
            notify(`Track ${property} feedback is not available; the message was not sent.`)
            return
        }
        return {...data, address: `/track/${index}/${property}`}
    }
}
