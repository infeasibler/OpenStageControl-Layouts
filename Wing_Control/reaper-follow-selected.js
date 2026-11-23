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

function renderSlot(slot) {
    const trackIndex = firstSlot === null ? null : firstSlot + slot - 1
    const track = tracks[trackIndex]
    if (!track || track.name === undefined || track.volume === undefined) {
        receive(`/track/${slot}/name`, trackIndex > trackCount ? 'Out of range' : 'Waiting')
        return
    }
    receive(`/track/${slot}/name`, track.name)
    receive(`/track/${slot}/volume`, track.volume)
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
        const match = /^\/track\/(\d+)\/(name|volume|select)$/.exec(data.address)
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
        if (slot >= 1 && slot <= surfaceCount) renderSlot(slot)
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

        const match = /^\/track\/([1-8])\/volume$/.exec(data.address)
        if (!match) return data
        const index = firstSlot === null ? null : firstSlot + Number(match[1]) - 1
        const track = tracks[index]
        if (!track || track.name === undefined || track.volume === undefined) {
            notify('Track feedback is not available; the fader message was not sent.')
            return
        }
        return {...data, address: `/track/${index}/volume`}
    }
}
