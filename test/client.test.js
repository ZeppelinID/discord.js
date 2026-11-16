'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const process = require('node:process');
const { setImmediate } = require('node:timers');
const test = require('node:test');
const { Client, Message } = require('../src');
const VoiceConnection = require('../src/client/voice/VoiceConnection');
const READY = require('../src/client/websocket/handlers/READY');

test('new Client(options) leaves the options object alone and shares nothing', async t => {
  const warnings = [];
  const onWarning = warning => warnings.push(warning.message);
  process.on('warning', onWarning);
  t.after(() => process.off('warning', onWarning));

  const options = { ws: { properties: { os: 'Linux' } }, partials: ['USER'], http: { headers: { 'X-Test': '1' } } };
  const snapshot = structuredClone(options);
  const a = new Client(options);
  const b = new Client(options);
  t.after(() => {
    a.destroy();
    b.destroy();
  });

  assert.deepEqual(options, snapshot);
  assert.notEqual(a.options, options);
  assert.notEqual(a.options, b.options);
  assert.notEqual(a.options.ws, b.options.ws);
  assert.equal(a.options.ws.properties.os, 'Linux');
  assert.ok(a.options.ws.properties.browser); // Defaults are still filled in
  assert.equal(a.options.http.headers['X-Test'], '1');
  assert.ok(a.options.http.headers['User-Agent']);
  assert.deepEqual(a.options.partials, ['USER']); // The default list is not added on top

  await new Promise(resolve => setImmediate(resolve)); // Warnings are emitted on the next tick
  assert.deepEqual(warnings, []);
});

test('class instances, functions and empty arrays given as options are kept', t => {
  class Agent {}
  const agent = new Agent();
  const captchaSolver = async () => 'solved';
  const client = new Client({ ws: { agent }, captchaSolver, partials: [] });
  t.after(() => client.destroy());

  assert.equal(client.options.ws.agent, agent);
  assert.equal(client.options.captchaSolver, captchaSolver);
  assert.deepEqual(client.options.partials, []);
});

test('redeemNitro and clickButton always answer with a promise', async () => {
  const client = { channels: { resolveId: () => null }, api: {} };
  assert.equal(await Client.prototype.redeemNitro.call(client, 'no gift link here'), false);
  await assert.rejects(Client.prototype.redeemNitro.call(client, 42), { code: 'INVALID_NITRO' });

  const message = { resolveComponent: () => null };
  await assert.rejects(Message.prototype.clickButton.call(message, 'missing'), { message: 'BUTTON_NOT_FOUND' });
});

test('_waitForCached gives up after the timeout and removes its listener', async () => {
  const client = new EventEmitter();
  assert.equal(await Client.prototype._waitForCached.call(client, new Map(), 'x', 'guildCreate', 20), undefined);
  assert.equal(client.listenerCount('guildCreate'), 0);
});

// A client that only knows how to join; `joined` runs once the invite request went through
const joiningClient = (invite, joined) => {
  const client = Object.assign(new EventEmitter(), {
    guilds: { cache: new Map() },
    channels: { cache: new Map() },
    sessionId: 'session',
    fetchInvite: async () => invite,
    _waitForCached: Client.prototype._waitForCached,
  });
  client.api = {
    invites: () => ({
      post: async () => {
        joined(client);
        return {};
      },
    }),
  };
  return client;
};

test('acceptInvite returns the group DM once the gateway has delivered it', async () => {
  const channel = { id: 'C1' };
  const client = joiningClient({ guild: null, channelId: 'C1', flags: { has: () => false } }, c =>
    setImmediate(() => {
      c.channels.cache.set('C1', channel);
      c.emit('channelCreate', channel);
    }),
  );
  assert.equal(await Client.prototype.acceptInvite.call(client, 'abcdef'), channel);
});

test('acceptInvite returns the guild once the gateway has delivered it', async () => {
  const guild = { id: 'G1' };
  const client = joiningClient({ guild: { id: 'G1' }, channelId: 'C1', flags: { has: () => false } }, c =>
    setImmediate(() => {
      c.guilds.cache.set('G1', guild);
      c.emit('guildCreate', guild);
    }),
  );
  const options = { bypassOnboarding: false, bypassVerify: false };
  assert.equal(await Client.prototype.acceptInvite.call(client, 'abcdef', options), guild);
});

test('client.destroy() closes the voice connection on our side', t => {
  const client = new Client();
  t.after(() => client.destroy());
  const events = [];
  const connection = new VoiceConnection(client.voice, { client, id: 'C', guild: { id: 'G' } });
  connection.on('closing', () => events.push('closing'));
  connection.on('disconnect', () => events.push('disconnect'));
  client.voice.connection = connection;

  client.destroy();

  assert.deepEqual(events, ['closing', 'disconnect']);
  assert.equal(client.voice.connection, null);
});

const voiceStub = () => {
  const client = Object.assign(new EventEmitter(), { user: { id: 'U' } });
  const connection = new VoiceConnection({ client }, { client, id: 'C', guild: { id: 'G' } });
  return { client, connection };
};

test('the stream event hook is added once, still dispatches events, and goes away with the connection', () => {
  const { client, connection } = voiceStub();
  const calls = [];
  connection.streamConnection = {
    disconnect: () => calls.push('own disconnect'),
    _close: () => calls.push('own close'),
  };
  connection.streamWatchConnection.set('W', { _close: () => calls.push('watch close') });

  connection._hookStreamEvents();
  connection._hookStreamEvents();
  assert.equal(client.listenerCount('raw'), 1);

  client.emit('raw', { t: 'STREAM_DELETE', d: { stream_key: 'guild:G:C:U' } });
  assert.deepEqual(calls, ['own disconnect']);

  connection._disconnect();
  assert.equal(client.listenerCount('raw'), 0);
  assert.deepEqual(calls.slice(1).sort(), ['own close', 'watch close']);
  assert.equal(connection.streamConnection, null);
  assert.equal(connection.streamWatchConnection.size, 0);
});

test('a connection that never hooked stream events disconnects without touching the client', () => {
  const { client, connection } = voiceStub();
  connection._disconnect();
  assert.equal(client.listenerCount('raw'), 0);
});

test('READY subscribes to every guild exactly once, in at most two packets', () => {
  const guilds = n => Array.from({ length: n }, (_, i) => ({ id: `${i + 1}` }));
  for (const [count, packets] of [
    [0, 0],
    [50, 1],
    [80, 1],
    [81, 2],
    [201, 2],
  ]) {
    const sent = [];
    const client = {
      emit() {},
      presence: {},
      user: { _patch() {} },
      channels: { _add() {} },
      guilds: { _add() {}, cache: new Map() },
      notes: { _reload() {} },
      relationships: { _setup() {} },
      settings: { _patch() {} },
      sessions: {},
      options: { DMChannelVoiceStatusSync: 0 },
      ws: { broadcast: packet => sent.push(packet) },
    };
    const data = { user: { id: 'U' }, private_channels: [], guilds: guilds(count) };
    READY(client, { d: data }, { id: 0, checkReady() {} });

    assert.equal(sent.length, packets, `${count} guilds`);
    const subscribed = sent.flatMap(packet => Object.keys(packet.d.subscriptions));
    assert.deepEqual(
      subscribed,
      data.guilds.map(guild => guild.id),
      `${count} guilds`,
    );
  }
});
