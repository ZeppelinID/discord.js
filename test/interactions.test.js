'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const process = require('node:process');
const { setImmediate } = require('node:timers');
const { setTimeout: sleep } = require('node:timers/promises');
const test = require('node:test');
const { Message, Modal, Util } = require('../src');
const TextBasedChannel = require('../src/structures/interfaces/TextBasedChannel');

// A client that only knows how to send interactions; `post` decides whether the request works
const makeClient = post =>
  Object.assign(new EventEmitter(), {
    sessionId: 'session',
    incrementMaxListeners() {},
    decrementMaxListeners() {},
    users: { resolveId: id => id },
    api: { interactions: { post } },
  });

const failing = () => Promise.reject(new Error('POST failed: 403'));

const channelStub = client => ({
  id: 'c',
  guild: { id: 'g' },
  client,
  searchInteraction: async () => ({
    applications: [{ id: '1', bot_id: '1' }],
    application_commands: [{ name: 'ping', application_id: '1', options: [], version: '1', id: '9', type: 1 }],
  }),
});

const messageStub = client => ({
  client,
  guildId: 'g',
  channelId: 'c',
  id: 'm',
  applicationId: 'app',
  author: { id: 'a' },
  flags: { bitfield: 0 },
  resolveComponent: () => ({ type: 'BUTTON', disabled: false, customId: 'button' }),
  components: [
    {
      components: [
        {
          type: 'STRING_SELECT',
          customId: 'menu',
          minValues: 1,
          maxValues: 1,
          options: [{ value: 'a', label: 'A' }],
          disabled: false,
        },
      ],
    },
  ],
});

const modalStub = client => ({
  client,
  applicationId: 'app',
  channelId: 'c',
  guildId: 'g',
  replied: false,
  toJSON: () => ({ components: [{ components: [{ type: 4, value: 'x', custom_id: 'field' }] }], title: 't', id: '1' }),
});

const entryPoints = {
  sendSlash: client => TextBasedChannel.prototype.sendSlash.call(channelStub(client), '1', 'ping'),
  clickButton: client => Message.prototype.clickButton.call(messageStub(client), 'button'),
  selectMenu: client => Message.prototype.selectMenu.call(messageStub(client), 'menu', ['a']),
  modalReply: client => Modal.prototype.reply.call(modalStub(client)),
};

test('a failed request rejects with its own error and leaves nothing unhandled', async t => {
  // Shorten the reply timeout so the test does not have to wait 5 seconds
  const original = Util.createPromiseInteraction;
  Util.createPromiseInteraction = (client, nonce, _timeout, ...rest) => original.call(Util, client, nonce, 30, ...rest);
  t.after(() => {
    Util.createPromiseInteraction = original;
  });
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  t.after(() => process.off('unhandledRejection', onUnhandled));

  for (const [name, call] of Object.entries(entryPoints)) {
    await assert.rejects(call(makeClient(failing)), { message: 'POST failed: 403' }, name); // eslint-disable-line no-await-in-loop
  }
  await sleep(100); // Longer than the shortened reply timeout
  assert.deepEqual(unhandled, []);
});

test('a reply that arrives right after the request is still caught', async () => {
  for (const [name, call] of Object.entries(entryPoints)) {
    const client = makeClient(({ data }) => {
      setImmediate(() => client.emit('messageCreate', { nonce: data.nonce, content: name }));
      return Promise.resolve();
    });
    const reply = await call(client); // eslint-disable-line no-await-in-loop
    assert.equal(reply.content, name);
  }
});

test('a modal whose request failed can be sent again', async () => {
  const modal = modalStub(makeClient(failing));
  await assert.rejects(Modal.prototype.reply.call(modal), { message: 'POST failed: 403' });
  assert.equal(modal.replied, false);
});

test('selectMenu finds menus by custom id, even ids with digits, and by row number', async () => {
  const posted = [];
  const client = makeClient(({ data }) => {
    posted.push(data.data.custom_id);
    setImmediate(() => client.emit('messageCreate', { nonce: data.nonce }));
    return Promise.resolve();
  });
  const message = messageStub(client);
  message.components[0].components[0].customId = 'select_role_1';

  await Message.prototype.selectMenu.call(message, 'select_role_1', ['a']);
  await Message.prototype.selectMenu.call(message, 0, ['a']);
  await Message.prototype.selectMenu.call(message, '0', ['a']);
  assert.deepEqual(posted, ['select_role_1', 'select_role_1', 'select_role_1']);

  await assert.rejects(Message.prototype.selectMenu.call(message, 'missing', ['a']), {
    message: 'SELECT_MENU_NOT_FOUND',
  });
  await assert.rejects(Message.prototype.selectMenu.call(message, 3, ['a']), { message: 'SELECT_MENU_NOT_FOUND' });
});

test('slash command names that Discord would reject fail before any request', async () => {
  const client = makeClient(() => assert.fail('no request expected'));
  for (const name of ['Ping', '', 'ping!', 'x'.repeat(33)]) {
    await assert.rejects(
      TextBasedChannel.prototype.sendSlash.call(channelStub(client), '1', name),
      { code: 'SLASH_COMMAND_NAME_INVALID' },
      JSON.stringify(name),
    );
  }
});
