'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { inspect } = require('node:util');
const test = require('node:test');
const { Client, Util } = require('../src');
const ClientVoiceManager = require('../src/client/voice/ClientVoiceManager');
const WebSocketShard = require('../src/client/websocket/WebSocketShard');
const VOICE_SERVER_UPDATE = require('../src/client/websocket/handlers/VOICE_SERVER_UPDATE');

const TOKEN = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.GabcDE.SECRET_PART_OF_THE_TOKEN';

test('the 2FA secret and the token stay out of console.log(client)', t => {
  const client = new Client({ TOTPKey: 'jbsw y3dp ehpk 3pxp' });
  t.after(() => client.destroy());
  client.token = TOKEN;

  const dump = inspect(client, { depth: 3 });
  assert.ok(!dump.includes('JBSWY3DPEHPK3PXP'), 'the 2FA secret is printed');
  assert.ok(!dump.includes(TOKEN), 'the token is printed');
  assert.equal(client.options.TOTPKey, 'JBSWY3DPEHPK3PXP'); // Still usable, and normalised
});

test('IDENTIFY and RESUME packets are logged without the token', t => {
  const real = new Client();
  t.after(() => real.destroy());
  const debug = [];
  const client = Object.assign(new EventEmitter(), { token: TOKEN, options: real.options });
  client.on('debug', message => debug.push(message));
  const shard = new WebSocketShard({ client, debug: message => client.emit('debug', message) }, 0);
  const sent = [];
  shard.connection = { readyState: 1, send: data => sent.push(data) };

  shard.identifyNew();
  shard.sessionId = 'session';
  shard.closeSequence = 5;
  shard.identifyResume();

  assert.equal(sent.length, 2);
  assert.ok(
    sent.every(data => data.includes(TOKEN)),
    'the packets themselves must carry the token',
  );
  assert.ok(debug.length >= 2);
  assert.ok(!debug.join('\n').includes('SECRET_PART_OF_THE_TOKEN'), 'the token was logged');
});

test('redactedStringify hides tokens and voice keys at any depth', () => {
  assert.equal(
    Util.redactedStringify({ op: 2, d: { token: 'a', secret_key: [1, 2], nested: [{ token: 'b' }], keep: 1 } }),
    '{"op":2,"d":{"token":"[hidden]","secret_key":"[hidden]","nested":[{"token":"[hidden]"}],"keep":1}}',
  );
});

test('voice server updates are logged without the voice token', () => {
  const debug = [];
  const client = new EventEmitter();
  client.on('debug', message => debug.push(message));
  client.voice = new ClientVoiceManager(client);

  VOICE_SERVER_UPDATE(client, { d: { guild_id: 'g', token: 'VOICE.TOKEN', endpoint: 'e.example' } });

  assert.equal(debug.length, 2);
  assert.ok(!debug.join('\n').includes('VOICE.TOKEN'), 'the voice token was logged');
});
