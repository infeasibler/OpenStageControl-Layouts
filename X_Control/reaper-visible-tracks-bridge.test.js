const assert = require('node:assert/strict')
const test = require('node:test')
const {encodeTrackState, parseVisibilityContent} = require('./reaper-visible-tracks-bridge')

function readOscString(buffer, offset) {
    const end = buffer.indexOf(0, offset)
    const value = buffer.toString('utf8', offset, end)
    return {value, next: Math.ceil((end + 1) / 4) * 4}
}

test('visibility file parsing accepts REAPER decimal track numbers', () => {
    const timestamp = Date.now()
    assert.deepEqual(
        parseVisibilityContent(`v1\n${timestamp}\n1,2,5,8\n8.0\n#diagnostics`, timestamp),
        {indexes: [1, 2, 5, 8], selectedTrack: 8}
    )
})

test('bridge encodes visible track list and selected track as OSC arguments', () => {
    const packet = encodeTrackState([1, 2, 5, 8], 8)
    const address = readOscString(packet, 0)
    const tags = readOscString(packet, address.next)
    const indexes = readOscString(packet, tags.next)

    assert.equal(address.value, '/wcontrol/track_state')
    assert.equal(tags.value, ',si')
    assert.equal(indexes.value, '1,2,5,8')
    assert.equal(packet.readInt32BE(indexes.next), 8)
})
