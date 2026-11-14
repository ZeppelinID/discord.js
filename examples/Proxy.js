'use strict';

const Discord = require('../src/index');
const { ProxyAgent } = require('proxy-agent');

const proxy = new ProxyAgent({
  getProxyForUrl: function () {
    return '<any proxy>';
  },
});

const client = new Discord.Client({
  ws: {
    agent: proxy, // WebSocket Proxy
    // Do not use the `proxy` option if you don't need to use the WebSocket Proxy
  },
  http: {
    // API (REST) proxy, passed to impit as `proxyUrl`. Put credentials in the URL.
    agent: 'http://user:pass@my.proxy.server:8080',
    // or 'socks5://my.proxy.server:1080'
    // or new URL('http://my.proxy.server:8080')
    // or { uri: 'http://my.proxy.server:8080' }
  },
});

// So if you only need to use the API Proxy, you don't need to install `proxy-agent`.

client.on('ready', async () => {
  console.log('Ready!', client.user.tag);
});

client.login('token');
