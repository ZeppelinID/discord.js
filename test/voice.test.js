'use strict';

const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const dgram = require('node:dgram');
const { EventEmitter, once } = require('node:events');
const { setTimeout: sleep } = require('node:timers/promises');
const test = require('node:test');
const PacketHandler = require('../src/client/voice/receiver/PacketHandler');
const VoiceUDP = require('../src/client/voice/networking/VoiceUDPClient');
const VoiceWebSocket = require('../src/client/voice/networking/VoiceWebSocket');
const { VoiceOpcodes } = require('../src/util/Constants');

const SSRC = 1234;

// Discord's IP discovery reply: type 2, length 70, ssrc, address (null padded), port
const handshakeReply = (address, port) => {
  const reply = Buffer.alloc(74);
  reply.writeUInt16BE(2, 0);
  reply.writeUInt16BE(70, 2);
  reply.writeUInt32BE(SSRC, 4);
  reply.write(address, 8);
  reply.writeUInt16BE(port, 72);
  return reply;
};

const voiceConnectionStub = serverPort => {
  const connection = new EventEmitter();
  connection.authentication = {
    port: serverPort,
    ssrc: SSRC,
    mode: 'aead_aes256_gcm_rtpsize',
    secret_key: Buffer.alloc(32, 1),
  };
  connection.ssrcMap = new Map([[SSRC, { userId: '1', hasVideo: false, speaking: 0 }]]);
  connection.onSpeaking = () => {};
  connection.receiver = { packets: new PacketHandler({ connection }) };
  connection.sockets = { ws: { sendPacket: () => {} } };
  return connection;
};

test('bad datagrams are dropped instead of crashing the process', async t => {
  const server = dgram.createSocket('udp4');
  t.after(() => server.close());
  server.bind(0, '127.0.0.1');
  await once(server, 'listening');

  const connection = voiceConnectionStub(server.address().port);
  const selected = new Promise(resolve => {
    connection.sockets.ws.sendPacket = resolve;
  });
  const udp = new VoiceUDP(connection);
  t.after(() => udp.shutdown());
  const debug = [];
  udp.on('debug', message => debug.push(message));

  const discovery = once(server, 'message');
  await udp.createUDPSocket('127.0.0.1');
  const [, client] = await discovery;
  const send = buffer => new Promise(resolve => server.send(buffer, client.port, '127.0.0.1', resolve));

  // Before the handshake: a stray datagram must neither crash nor use up the handshake
  await send(Buffer.alloc(4));
  await send(handshakeReply('127.0.0.1', 50000));
  const packet = await selected;
  assert.equal(packet.d.data.address, '127.0.0.1');

  // After the handshake: too short, and long enough but not decryptable
  const garbage = Buffer.alloc(60);
  garbage[0] = 0x80;
  garbage.writeUInt32BE(SSRC, 8);
  await send(Buffer.alloc(4));
  await send(garbage);
  // Both datagrams must be handled and dropped, and the test must fail by itself if they never are
  const dropped = () => debug.filter(message => message.includes('dropped a packet')).length;
  for (let tries = 0; dropped() < 2; tries++) {
    assert.ok(tries < 200, 'the bad datagrams were never handled');
    await sleep(10); // eslint-disable-line no-await-in-loop
  }
});

test('secrets are hidden in the voice WebSocket debug output', async () => {
  const connection = new EventEmitter();
  const voiceWs = new VoiceWebSocket(connection);
  const debug = [];
  voiceWs.on('debug', message => debug.push(message));
  const sent = [];
  voiceWs.ws = {
    readyState: 1,
    send: (data, _, callback) => {
      sent.push(data);
      callback();
    },
  };

  await voiceWs.sendPacket({ op: 0, d: { token: 'VOICE.TOKEN', session_id: 'session' } });
  voiceWs.onPacket({ op: VoiceOpcodes.SESSION_DESCRIPTION, d: { mode: 'x', secret_key: [7, 8, 9] } });

  assert.match(sent[0], /VOICE\.TOKEN/);
  const logged = debug.join('\n');
  assert.ok(!logged.includes('VOICE.TOKEN'), 'voice token was logged');
  assert.ok(!logged.includes('7,8,9'), 'voice secret key was logged');
});
