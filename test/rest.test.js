'use strict';

const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const test = require('node:test');
const { Client, MessageManager } = require('../src');
const HTTPError = require('../src/rest/HTTPError');
const RequestHandler = require('../src/rest/RequestHandler');

const jsonResponse = body => ({
  ok: true,
  status: 200,
  headers: { get: name => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => body,
});

const handlerWith = retryLimit =>
  new RequestHandler({
    client: { options: { retryLimit, restTimeOffset: 0, captchaRetryLimit: 3 }, listenerCount: () => 0, emit() {} },
    globalRemaining: Infinity,
    globalLimit: Infinity,
    globalReset: null,
  });

// A request whose network call always fails; after 50 calls it succeeds, so a runaway retry loop still ends the test
const failingRequest = retries => {
  const request = {
    retries,
    method: 'get',
    path: '/x',
    route: '/x',
    options: {},
    calls: 0,
    make: async () => {
      request.calls++;
      if (request.calls > 50) {
        return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      throw new Error('network down');
    },
  };
  return request;
};

test('a request gives up when the shared retry counter is already past the limit', async () => {
  // [retries already used by captcha or 2FA steps, retryLimit]
  for (const [retries, retryLimit] of [
    [0, 1],
    [1, 0],
    [2, 1],
  ]) {
    const request = failingRequest(retries);
    await assert.rejects(handlerWith(retryLimit).execute(request), HTTPError);
    assert.ok(request.calls <= 2, `retries=${retries} retryLimit=${retryLimit} made ${request.calls} calls`);
  }
});

test('route parts that leave their path segment are refused before anything is sent', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  client.token = 'token';
  const urls = [];
  client.rest.fetch = async url => {
    urls.push(url);
    return jsonResponse({});
  };

  // The last three only become ".." inside the URL parser, which drops tabs and newlines and trims the end
  const codes = ['../users/@me', '..', '.', '%2e%2E', '.%2e', 'a/b', 'a\\b', 'a?b', 'a#b', 'a%2Fb', 'a%5cb'];
  for (const code of [...codes, '.\t.', '..\n', '.. ']) {
    await assert.rejects(client.fetchInvite(code), { code: 'INVALID_ROUTE_PART' }, JSON.stringify(code));
  }
  assert.deepEqual(urls, []);

  await client.fetchInvite('abc-DEF_1');
  assert.equal(urls.length, 1);
  assert.match(urls[0], /\/api\/v\d+\/invites\/abc-DEF_1\?/);
});

test('ordinary route parts still pass', t => {
  const client = new Client();
  t.after(() => client.destroy());
  // Building the route must not throw for the shapes the library uses everywhere
  assert.doesNotThrow(() => client.api.users['@me']['application-command-index']);
  assert.doesNotThrow(() => client.api.guilds('123456789012345678', 'widget.json'));
  assert.doesNotThrow(() => client.api.channels('123').messages('456').reactions('%F0%9F%91%8D', '@me'));
  assert.doesNotThrow(() => client.api.channels('123').messages.search);
});

test('message search sends its filters as a query, not as part of the path', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  client.token = 'token';
  const urls = [];
  client.rest.fetch = async url => {
    urls.push(url);
    return jsonResponse({ messages: [], total_results: 0 });
  };
  const channel = { id: '111111111111111111', guildId: '222222222222222222', client };
  const messages = new MessageManager(channel);

  await messages.search({
    authors: ['333333333333333333', '444444444444444444'],
    content: 'hello world',
    has: ['link'],
  });

  const url = new URL(urls[0]);
  assert.match(url.pathname, /\/guilds\/222222222222222222\/messages\/search$/);
  assert.deepEqual(url.searchParams.getAll('author_id'), ['333333333333333333', '444444444444444444']);
  assert.equal(url.searchParams.get('content'), 'hello world');
  assert.equal(url.searchParams.get('has'), 'link');
});

// What Discord answers to a message edit
const editedMessage = {
  id: '222222222222222222',
  channel_id: '111111111111111111',
  type: 0,
  content: 'new text',
  author: { id: '333333333333333333', username: 'author' },
  attachments: [],
  embeds: [],
  mentions: [],
  timestamp: new Date(0).toISOString(),
};

test('an edit sends a list of files to keep only when it uploads files', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  client.token = 'token';
  const bodies = [];
  client.rest.fetch = async (url, init) => {
    // The upload URL request, the upload itself, then the edit
    if (url.endsWith('/attachments')) {
      return jsonResponse({
        attachments: [{ id: '0', upload_url: 'https://upload.example/0', upload_filename: 'up/0' }],
      });
    }
    if (url.startsWith('https://upload.example/')) return { ok: true, status: 200 };
    bodies.push(JSON.parse(init.body));
    return jsonResponse(editedMessage);
  };
  const messages = new MessageManager({ id: '111111111111111111', client });

  // Discord deletes every file missing from the list, so a text-only edit must not send one
  await messages.edit('222222222222222222', 'new text');
  assert.ok(!('attachments' in bodies[0]), JSON.stringify(bodies[0]));

  await messages.edit('222222222222222222', {
    attachments: [{ id: '999' }],
    files: [{ attachment: Buffer.from('x'), name: 'a.txt' }],
  });
  assert.deepEqual(
    bodies[1].attachments.map(attachment => [attachment.id, attachment.uploaded_filename]),
    [
      ['999', undefined],
      ['0', 'up/0'],
    ],
  );
});

test('fetching a cached message still answers with a promise', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const messages = new MessageManager({ id: '111111111111111111', client });
  const cached = { id: '222222222222222222', partial: false };
  messages.cache.set(cached.id, cached);

  const result = messages.fetch(cached.id);
  assert.ok(result instanceof Promise);
  assert.equal(await result, cached);
});

test('poll voters are fetched from the poll answer route', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  client.token = 'token';
  const paths = [];
  client.rest.fetch = async url => {
    paths.push(new URL(url).pathname);
    return jsonResponse({ users: [{ id: '333333333333333333', username: 'voter' }] });
  };
  const messages = new MessageManager({ id: '111111111111111111', client });

  const voters = await messages.fetchPollAnswerVoters({ messageId: '222222222222222222', answerId: 1 });
  assert.deepEqual([...voters.keys()], ['333333333333333333']);
  assert.match(paths[0], /\/channels\/111111111111111111\/polls\/222222222222222222\/answers\/1$/);
});
