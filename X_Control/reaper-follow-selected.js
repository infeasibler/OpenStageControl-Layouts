// Optional Open Stage Control custom module for the smaller X-Control layout.
const reaperHost = '127.0.0.1'
const reaperPort = 8000
const trackCount = 32
const surfaceCount = 8
const scrubRepeatMs = 50
// 41041 targets the current bar start; 41040 targets the next bar start.
const transportTriggers = new Set([
    '/repeat', '/record', '/stop', '/play', '/action/41041', '/action/41040'
])
let firstTrackPosition = null
let selectedTrack = null
let tracks = {}
let scrubTimer = null
let visibleTracks = Array.from({length: trackCount}, (_, index) => index + 1)

function notify(message) {
    console.warn('X-Control REAPER follow:', message)
    receive('/NOTIFY', '^warning', message)
}

function stopScrub() {
    if (scrubTimer === null) return
    clearInterval(scrubTimer)
    scrubTimer = null
}

function startScrub(direction) {
    stopScrub()
    scrubTimer = setInterval(() => {
        send(reaperHost, reaperPort, '/scrub', {type: 'f', value: direction})
    }, scrubRepeatMs)
}

function renderSlot(slot, changed) {
    const trackIndex = firstTrackPosition === null ? null : visibleTracks[firstTrackPosition + slot - 2]
    const track = tracks[trackIndex]
    const ready = track && track.name !== undefined && track.volume !== undefined && track.pan !== undefined
    const buttonsReady = track && track.mute !== undefined && track.solo !== undefined
    receive(`/track/${slot}/name`, firstTrackPosition !== null && trackIndex === undefined ? 'Out of range' :
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

function updateVisibleTracks(indexes, selectedIndex) {
    const oldAnchor = firstTrackPosition === null ? null : visibleTracks[firstTrackPosition - 1]
    const newAnchorPosition = oldAnchor === null ? -1 : indexes.indexOf(oldAnchor)
    const selectedPosition = selectedIndex > 0 ? indexes.indexOf(selectedIndex) : -1
    visibleTracks = indexes

    if (selectedPosition >= 0) {
        selectedTrack = selectedIndex
        firstTrackPosition = selectedPosition + 1
    } else {
        selectedTrack = null
        firstTrackPosition = indexes.length === 0 ? null :
            newAnchorPosition >= 0 ? newAnchorPosition + 1 :
                firstTrackPosition === null ? 1 : Math.min(firstTrackPosition, indexes.length)
    }
    renderWindow()
}

function handleTrackState(data) {
    const indexList = data.args[0] && data.args[0].value
    const selectedValue = data.args[1] && data.args[1].value
    if (typeof indexList !== 'string' || !Number.isInteger(Number(selectedValue))) {
        notify('Collapsed-track bridge sent invalid track state.')
        return
    }

    const indexes = indexList ? indexList.split(',').map(Number) : []
    const selectedIndex = Number(selectedValue)
    if (indexes.some(index => !Number.isInteger(index) || index < 1 || index > trackCount) ||
        new Set(indexes).size !== indexes.length || selectedIndex < 0 || selectedIndex > trackCount) {
        notify('Collapsed-track bridge sent out-of-range track indexes.')
        return
    }

    const tracksChanged = indexes.length !== visibleTracks.length ||
        !indexes.every((index, i) => index === visibleTracks[i])
    const selectionChanged = (selectedIndex || null) !== selectedTrack
    const needsInitialAnchor = firstTrackPosition === null && indexes.length > 0
    if (tracksChanged || selectionChanged || needsInitialAnchor) {
        updateVisibleTracks(indexes, selectedIndex)
    }
}

function requestRefresh() {
    send(reaperHost, reaperPort, '/action/41743')
}

function configure() {
    stopScrub()
    firstTrackPosition = 1
    selectedTrack = null
    tracks = {}
    visibleTracks = Array.from({length: trackCount}, (_, index) => index + 1)
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
        stopScrub()
        send(reaperHost, reaperPort, '/device/track/count', {type: 'i', value: 8})
        send(reaperHost, reaperPort, '/device/track/bank/follows/mixer')
        requestRefresh()
    },

    oscInFilter: function(data) {
        if (data.address === '/wcontrol/track_state' && data.host === reaperHost) {
            handleTrackState(data)
            return
        }
        if (data.host !== reaperHost) return data
        const match = /^\/track\/(\d+)\/(name|volume|pan|mute|solo|select)$/.exec(data.address)
        if (!match) return data
        const index = Number(match[1])
        if (index < 1 || index > trackCount || !data.args.length) return data
        const property = match[2]
        const value = data.args[0].value

        if (property === 'select') {
            if (value === 1 || value === true) {
                const position = visibleTracks.indexOf(index)
                if (position >= 0) {
                    selectedTrack = index
                    firstTrackPosition = position + 1
                    renderWindow()
                }
            } else if (index === selectedTrack && (value === 0 || value === false)) {
                selectedTrack = null
                firstTrackPosition = null
                renderWindow()
            }
            return data
        }

        if (!tracks[index]) tracks[index] = {}
        tracks[index][property] = value
        const trackPosition = visibleTracks.indexOf(index)
        const slot = firstTrackPosition === null ? 0 : trackPosition - firstTrackPosition + 2
        if (slot >= 1 && slot <= surfaceCount) renderSlot(slot, property)
    },

    oscOutFilter: function(data) {
        if (data.host !== reaperHost || Number(data.port) !== reaperPort) return data
        if (data.address === '/scrub') {
            const direction = data.args[0] && data.args[0].value
            if (direction === 0) stopScrub()
            else if (direction === -1 || direction === 1) startScrub(direction)
            return data
        }
        if (transportTriggers.has(data.address)) {
            const value = data.args[0] && data.args[0].value
            if (!data.args.length || value === 1) {
                send(reaperHost, reaperPort, data.address)
            }
            return
        }
        if (data.address === '/device/track/bank/-' || data.address === '/device/track/bank/+') {
            if (data.args.length && !data.args[0].value) return
            if (firstTrackPosition === null) {
                notify('Select a REAPER track before moving the surface bank.')
                return
            }
            const step = data.address.endsWith('/+') ? 1 : -1
            firstTrackPosition = Math.max(1, Math.min(visibleTracks.length, firstTrackPosition + step))
            renderWindow()
            return
        }

        const match = /^\/track\/([1-8])\/(volume|pan|mute|solo)$/.exec(data.address)
        if (!match) return data
        const index = firstTrackPosition === null ? null :
            visibleTracks[firstTrackPosition + Number(match[1]) - 2]
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
