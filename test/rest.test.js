'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Client } = require('../src');
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

  for (const code of ['../users/@me', '..', '.', '%2e%2E', '.%2e', 'a/b', 'a\\b', 'a?b', 'a#b', 'a%2Fb', 'a%5cb']) {
    await assert.rejects(client.fetchInvite(code), { code: 'INVALID_ROUTE_PART' }, code);
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
  const { MessageManager } = require('../src');
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
