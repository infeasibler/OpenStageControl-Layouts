const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function setup() {
    const sent = []
    const received = []
    const callbacks = {}
    const context = {
        module: {exports: {}},
        app: {on: (name, callback) => { callbacks[name] = callback }},
        send: (...args) => sent.push(args),
        receive: (...args) => received.push(args),
        console: {warn() {}}
    }
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'reaper-follow-selected.js'), 'utf8'), context)
    const router = context.module.exports
    const incoming = (address, value) => router.oscInFilter({
        host: '127.0.0.1', address, args: [{value}]
    })
    const outgoing = address => router.oscOutFilter({
        host: '127.0.0.1', port: 8000, address, args: [{value: 1}]
    })
    return {router, sent, received, callbacks, incoming, outgoing}
}

test('selecting a track maps the surface to that track and following tracks', () => {
    const {router, sent, received, incoming, outgoing} = setup()
    router.init()
    assert.ok(sent.some(args => args[2] === '/device/track/count' && args[3].value === 32))
    incoming('/track/7/name', 'Vocals')
    incoming('/track/7/volume', 0.5)
    incoming('/track/8/name', 'Guitar')
    incoming('/track/8/volume', 0.7)
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
