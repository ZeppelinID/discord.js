'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Client, GuildAuditLogs, GuildChannel, Util, WebEmbed } = require('../src');

test('WebEmbed keeps the leading zeros of its color and the url of its provider', () => {
  const colorOf = color => new URL(new WebEmbed().setColor(color).toString()).searchParams.get('color');
  assert.equal(colorOf('#00ff00'), '#00ff00');
  assert.equal(colorOf('#0000ff'), '#0000ff');
  assert.equal(colorOf(0xabcdef), '#abcdef');

  const embed = new WebEmbed({ provider: { name: 'NAME', url: 'https://example.org' } });
  assert.deepEqual(embed.provider, { name: 'NAME', url: 'https://example.org' });
});

test('WebEmbed links are built on WebEmbed.baseURL', t => {
  const original = WebEmbed.baseURL;
  t.after(() => {
    WebEmbed.baseURL = original;
  });
  WebEmbed.baseURL = 'https://embeds.example.org/e?';
  assert.ok(new WebEmbed().setTitle('Hi').toString().startsWith('https://embeds.example.org/e?'));
});

test('channel position counts announcement channels of the same category', () => {
  const position = Object.getOwnPropertyDescriptor(GuildChannel.prototype, 'position').get;
  const channel = (id, type, rawPosition) => ({ id, type, rawPosition, parentId: 'category' });
  const channels = [channel('1', 'GUILD_TEXT', 0), channel('2', 'GUILD_NEWS', 1), channel('3', 'GUILD_TEXT', 2)];
  const guild = { channels: { cache: new Map(channels.map(c => [c.id, c])) } };
  for (const c of channels) c.guild = guild;

  assert.equal(position.call(channels[2]), 2);
  assert.equal(position.call(channels[1]), 1);
  assert.equal(position.call(channels[0]), 0);
});

test('cleanContent leaves role mentions alone in DMs and group DMs, and still resolves them in guilds', () => {
  const client = { users: { cache: new Map() }, channels: { cache: new Map() } };
  const text = 'hi <@&123456789012345678>';
  for (const type of ['DM', 'GROUP_DM']) assert.equal(Util.cleanContent(text, { type, client }), text);

  const guild = { roles: { cache: new Map([['123456789012345678', { name: 'Admins' }]]) } };
  assert.equal(Util.cleanContent(text, { type: 'GUILD_TEXT', client, guild }), 'hi @Admins');
});

test('mergeDefault copies plain objects and keeps everything else as given', () => {
  class Agent {}
  const agent = new Agent();
  const given = { a: { keep: 1 }, list: [1], agent, fn: () => 1 };
  const merged = Util.mergeDefault(
    { a: { keep: 0, add: 2 }, list: [7, 8, 9], agent: {}, fn: null, extra: true },
    given,
  );

  assert.deepEqual(given, { a: { keep: 1 }, list: [1], agent, fn: given.fn }); // Not changed
  assert.deepEqual(merged.a, { keep: 1, add: 2 });
  assert.notEqual(merged.a, given.a);
  assert.deepEqual(merged.list, [1]); // Arrays are not topped up from the defaults
  assert.equal(merged.agent, agent);
  assert.equal(merged.fn, given.fn);
  assert.equal(merged.extra, true);
});

test('audit logs still build the application commands they list', t => {
  const client = new Client();
  t.after(() => client.destroy());
  const guild = { id: '123456789012345678', client };
  const command = { id: '1', application_id: '2', name: 'ping', description: 'Ping', type: 1, version: '3' };
  const data = { application_commands: [command], auto_moderation_rules: [], audit_log_entries: [] };

  const logs = new GuildAuditLogs(guild, data);
  assert.equal(logs.applicationCommands.get('1').name, 'ping');
  assert.equal(logs.applicationCommands.get('1').guildId, guild.id);
});
