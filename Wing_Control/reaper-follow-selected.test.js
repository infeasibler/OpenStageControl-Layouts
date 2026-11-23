const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function setup() {
    const sent = []
    const received = []
    const callbacks = {}
    const intervals = []
    const context = {
        module: {exports: {}},
        app: {on: (name, callback) => { callbacks[name] = callback }},
        send: (...args) => sent.push(args),
        receive: (...args) => received.push(args),
        setInterval: (callback, delay) => {
            const interval = {callback, delay, cleared: false}
            intervals.push(interval)
            return interval
        },
        clearInterval: interval => { interval.cleared = true },
        console: {warn() {}}
    }
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'reaper-follow-selected.js'), 'utf8'), context)
    const router = context.module.exports
    const incoming = (address, value) => router.oscInFilter({
        host: '127.0.0.1', address, args: [{value}]
    })
    const outgoing = (address, value = 1) => router.oscOutFilter({
        host: '127.0.0.1', port: 8000, address, args: [{value}]
    })
    return {router, sent, received, callbacks, incoming, outgoing, intervals}
}

test('selecting a track maps the surface to that track and following tracks', () => {
    const {router, sent, received, incoming, outgoing} = setup()
    router.init()
    assert.ok(sent.some(args => args[2] === '/device/track/count' && args[3].value === 32))
    incoming('/track/7/name', 'Vocals')
    incoming('/track/7/volume', 0.5)
    incoming('/track/7/pan', 0.5)
    incoming('/track/7/mute', 0)
    incoming('/track/7/solo', 0)
    incoming('/track/8/name', 'Guitar')
    incoming('/track/8/volume', 0.7)
    incoming('/track/8/pan', 0.5)
    incoming('/track/8/mute', 0)
    incoming('/track/8/solo', 0)
    incoming('/track/7/select', 1)
    assert.ok(received.some(args => args[0] === '/track/1/name' && args[1] === 'Vocals'))
    assert.ok(received.some(args => args[0] === '/track/2/volume' && args[1] === 0.7))
    assert.equal(outgoing('/track/1/volume').address, '/track/7/volume')
    assert.equal(outgoing('/track/2/volume').address, '/track/8/volume')
})

test('bank buttons shift one track and a later selection follows again', () => {
    const {incoming, outgoing} = setup()
    for (const index of [7, 8, 9]) {
        incoming(`/track/${index}/name`, `Track ${index}`)
        incoming(`/track/${index}/volume`, 0.5)
    }
    incoming('/track/7/select', 1)
    assert.equal(outgoing('/device/track/bank/+'), undefined)
    assert.equal(outgoing('/track/1/volume').address, '/track/8/volume')
    incoming('/track/9/select', 1)
    assert.equal(outgoing('/track/1/volume').address, '/track/9/volume')
})

test('missing selection and out-of-range or uninitialized tracks block fader messages', () => {
    const {incoming, outgoing, received} = setup()
    assert.equal(outgoing('/track/1/volume'), undefined)
    incoming('/track/32/select', 1)
    incoming('/track/32/name', 'Last')
    incoming('/track/32/volume', 0.5)
    assert.equal(outgoing('/track/1/volume').address, '/track/32/volume')
    assert.equal(outgoing('/track/2/volume'), undefined)
    assert.ok(received.some(args => args[0] === '/track/2/name' && args[1] === 'Out of range'))
    incoming('/track/32/select', 0)
    assert.equal(outgoing('/track/1/volume'), undefined)
})

test('mute and solo follow selection and one-track bank shifts in both directions', () => {
    const {incoming, outgoing, received} = setup()
    for (const [index, mute, solo] of [[7, 1, 0], [8, 0, 1]]) {
        incoming(`/track/${index}/name`, `Track ${index}`)
        incoming(`/track/${index}/volume`, 0.5)
        incoming(`/track/${index}/mute`, mute)
        incoming(`/track/${index}/solo`, solo)
    }
    incoming('/track/7/select', 1)
    assert.ok(received.some(args => args[0] === '/track/1/mute' && args[1] === 1))
    assert.ok(received.some(args => args[0] === '/track/2/solo' && args[1] === 1))
    assert.equal(outgoing('/track/1/mute', 0).address, '/track/7/mute')
    assert.equal(outgoing('/track/2/solo', 1).address, '/track/8/solo')
    outgoing('/device/track/bank/+')
    assert.equal(outgoing('/track/1/solo', 0).address, '/track/8/solo')
    incoming('/track/8/solo', 0)
    assert.equal(received.filter(args => args[0] === '/track/1/solo').at(-1)[1], 0)
})

test('mute and solo commands are blocked until their own feedback arrives', () => {
    const {incoming, outgoing, received} = setup()
    incoming('/track/7/name', 'Vocals')
    incoming('/track/7/volume', 0.5)
    incoming('/track/7/select', 1)
    assert.equal(outgoing('/track/1/mute'), undefined)
    assert.equal(outgoing('/track/1/solo'), undefined)
    assert.ok(received.some(args => args[0] === '/NOTIFY'))
    incoming('/track/7/mute', 0)
    assert.equal(outgoing('/track/1/mute').address, '/track/7/mute')
    assert.equal(outgoing('/track/1/solo'), undefined)
})

test('the first two rows address the eight mute and solo controls', () => {
    const layout = JSON.parse(fs.readFileSync(path.join(__dirname, 'wControl-smaller.json'), 'utf8'))
    const widgets = layout.content.widgets[0].widgets
    for (let slot = 1; slot <= 8; slot++) {
        for (const [offset, property] of [[0, 'mute'], [8, 'solo']]) {
            const button = widgets.find(widget => widget.id === `button_${slot + offset}`)
            assert.equal(button.address, `/track/${slot}/${property}`)
            assert.equal(button.mode, 'toggle')
        }
    }
})

test('pan follows selection and bank shifts in both directions', () => {
    const {incoming, outgoing, received} = setup()
    for (const [index, pan] of [[7, 0], [8, 1]]) {
        incoming(`/track/${index}/name`, `Track ${index}`)
        incoming(`/track/${index}/pan`, pan)
    }
    incoming('/track/7/select', 1)
    assert.ok(received.some(args => args[0] === '/track/1/pan' && args[1] === 0))
    assert.ok(received.some(args => args[0] === '/track/2/pan' && args[1] === 1))
    const message = outgoing('/track/1/pan', 0.5)
    assert.equal(message.address, '/track/7/pan')
    assert.equal(message.args[0].value, 0.5)
    outgoing('/device/track/bank/+')
    assert.equal(outgoing('/track/1/pan', 1).address, '/track/8/pan')
    incoming('/track/8/pan', 0.5)
    assert.equal(received.filter(args => args[0] === '/track/1/pan').at(-1)[1], 0.5)
})

test('pan is blocked without feedback and outside the supported window', () => {
    const {incoming, outgoing, received} = setup()
    incoming('/track/32/name', 'Last')
    incoming('/track/32/select', 1)
    assert.equal(outgoing('/track/1/pan', 0.5), undefined)
    assert.ok(received.some(args => args[0] === '/NOTIFY'))
    incoming('/track/32/pan', 0.5)
    assert.equal(outgoing('/track/1/pan', 0.5).address, '/track/32/pan')
    assert.equal(outgoing('/track/2/pan', 0.5), undefined)
})

test('the first eight knobs use normalized pan addresses', () => {
    const layout = JSON.parse(fs.readFileSync(path.join(__dirname, 'wControl-smaller.json'), 'utf8'))
    const widgets = layout.content.widgets[0].widgets
    for (let slot = 1; slot <= 8; slot++) {
        const knob = widgets.find(widget => widget.id === `knob_${slot}`)
        assert.equal(knob.address, `/track/${slot}/pan`)
        assert.equal(knob.range.min, 0)
        assert.equal(knob.range.max, 1)
    }
})

test('smaller W-Control arrow buttons scrub while pressed', () => {
    const layout = JSON.parse(fs.readFileSync(path.join(__dirname, 'wControl-smaller.json'), 'utf8'))
    const widgets = layout.content.widgets[0].widgets
    for (const [id, direction, left] of [
        ['scrub_backward', -1, 822],
        ['scrub_forward', 1, 904]
    ]) {
        const button = widgets.find(widget => widget.id === id)
        assert.equal(button.type, 'button')
        assert.equal(button.interaction, true)
        assert.equal(button.address, '/scrub')
        assert.equal(button.mode, 'push')
        assert.equal(button.on, direction)
        assert.equal(button.off, 0)
        assert.ok(button.css.includes(`left: calc(var(--leftOffset) + ${left}px);`))
        assert.ok(button.css.includes('top: calc(var(--topOffset) + 460px);'))
    }
})

test('scrub repeats while held and stops on release or module stop', () => {
    const {router, outgoing, sent, intervals} = setup()
    assert.equal(outgoing('/scrub', -1).address, '/scrub')
    assert.equal(intervals[0].delay, 50)
    intervals[0].callback()
    assert.deepEqual(sent[0].slice(0, 3), ['127.0.0.1', 8000, '/scrub'])
    assert.equal(sent[0][3].type, 'f')
    assert.equal(sent[0][3].value, -1)

    outgoing('/scrub', 0)
    assert.equal(intervals[0].cleared, true)
    outgoing('/scrub', 1)
    assert.equal(intervals[1].cleared, false)
    router.stop()
    assert.equal(intervals[1].cleared, true)
})

test('transport controls send one no-argument trigger on press', () => {
    const {outgoing, sent} = setup()
    for (const address of ['/repeat', '/record', '/stop', '/play']) {
        assert.equal(outgoing(address, 1), undefined)
        const messages = sent.filter(args => args[2] === address)
        assert.equal(messages.length, 1)
        assert.equal(messages[0].length, 3)

        assert.equal(outgoing(address, 0), undefined)
        assert.equal(sent.filter(args => args[2] === address).length, 1)
    }
})

test('smaller W-Control named transport buttons trigger the configured REAPER actions', () => {
    const layout = JSON.parse(fs.readFileSync(path.join(__dirname, 'wControl-smaller.json'), 'utf8'))
    const widgets = layout.content.widgets[0].widgets
    for (const [id, address, left, top] of [
        ['loop', '/repeat', 826, 530],
        ['record', '/record', 908, 530],
        ['stop', '/stop', 826, 594],
        ['play', '/play', 908, 594]
    ]) {
        const button = widgets.find(widget => widget.id === id)
        assert.equal(button.type, 'button')
        assert.equal(button.interaction, true)
        assert.equal(button.address, address)
        assert.equal(button.mode, 'toggle')
        assert.equal(button.on, 1)
        assert.ok(button.css.includes(`left: calc(var(--leftOffset) + ${left}px);`))
        assert.ok(button.css.includes(`top: calc(var(--topOffset) + ${top}px);`))
    }
})
