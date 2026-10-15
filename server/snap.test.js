// Self-check for the SNAP codec: node server/snap.test.js
const assert = require('assert');
const { readFrames, frame, parseRequest, scramble } = require('./snap');

// Byte layout of a hello frame with seq 1.
const hello = Buffer.from('534d4f42' + '00' + '00' + '0001' + '00000000' + '00000000' + '00000000', 'hex');
assert.deepEqual(frame(0, 1), hello);

// Frames survive a split TCP stream.
const f = Buffer.concat([frame(4, 7, Buffer.from('R=1&C=0')), frame(7, 8)]);
let [frames, rest] = readFrames(f.subarray(0, 20));
assert.equal(frames.length, 0);
[frames, rest] = readFrames(f);
assert.deepEqual(frames.map(x => [x.type, x.seq, x.payload.toString()]), [[4, 7, 'R=1&C=0'], [7, 8, '']]);
assert.equal(rest.length, 0);

// Login: P2 is scrambled with key K, then base64.
const pw = scramble(Buffer.from('hunter2'), 5).toString('base64');
// P10 (presence) is base64: command 1 flags are 0x2000200C01.
const presence = Buffer.from('SM2.0.1,').toString('base64');
const login = parseRequest(`R=3&V=1.4.4&C=1&K=5&P1=bob&P2=${pw}&P5=42713&P10=${presence}`);
assert.equal(login.cmd, 1);
assert.equal(login.params[1], 'bob');
assert.equal(login.params[2], 'hunter2');
assert.equal(login.params[10].toString(), 'SM2.0.1,');

// Game packets: P1 is base64 for command 133.
const pkt = parseRequest(`R=9&S=abc&C=133&P1=${Buffer.from([1, 2, 255]).toString('base64')}`);
assert.deepEqual([...pkt.params[1]], [1, 2, 255]);
// MT framing: the handshake ping from re_transport.md, and fragmentation of a long message.
const mt = require('./mt');
assert.equal(mt.encode(mt.T.PING, mt.u32(20000)).toString('hex'), '0500' + '01' + '204e0000');
const big = Buffer.alloc(2000, 7);
const read = mt.createReader();
const wire = mt.encode(0x11, big);
assert.deepEqual(read(wire.subarray(0, 900)), []);
const [msg] = read(wire.subarray(900));
assert.equal(msg[0], 0x11);
assert.deepEqual(msg.subarray(1), big);
console.log('snap codec ok');
