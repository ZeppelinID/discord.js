# @zeppelinid/discord.js

An unofficial fork of [discord.js](https://github.com/discordjs/discord.js) v13 for automating Discord user accounts
(selfbots), based on [discord.js-selfbot-v13](https://github.com/aiko-chan-ai/discord.js-selfbot-v13).

> **Warning**
> Automating a user account is against Discord's
> [Terms of Service](https://support.discord.com/hc/en-us/articles/115002192352) and can get the account banned.
> Use it at your own risk. This project is not affiliated with Discord Inc. or the discord.js team.

## Installation

```sh
npm install @zeppelinid/discord.js
```

Requires Node.js 26.13.1 or newer.

Some features need extra packages. Install only the ones you use:

| Feature                  | What to install                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voice (play and record)  | `ffmpeg` on your PATH (or `ffmpeg-static`), an Opus library (`@discordjs/opus` or `opusscript`) and an encryption library (`sodium`, `libsodium-wrappers` or `@stablelib/xchacha20poly1305`) |
| Gateway / QR login proxy | `proxy-agent`                                                                                                                                                                                |

## Usage

```js
const { Client } = require('@zeppelinid/discord.js');

const client = new Client();

client.on('ready', () => {
  console.log(`${client.user.username} is ready!`);
});

client.on('messageCreate', message => {
  if (message.content === 'ping') message.reply('pong');
});

client.login('token');
```

To log in by scanning a QR code with the Discord mobile app, use `await client.QRLogin()` instead of `client.login()`.
It rejects if the code expires or the login is cancelled.

More examples (rich presence, polls, slash commands, voice, proxies and more) are in [`examples/`](examples).

## Proxy

```js
const { ProxyAgent } = require('proxy-agent');

const client = new Client({
  // REST requests, attachment uploads, file downloads and QR login
  http: { agent: 'http://user:pass@my.proxy.server:8080' }, // Or 'socks5://my.proxy.server:1080'
  // Gateway and QR login WebSocket
  ws: { agent: new ProxyAgent({ getProxyForUrl: () => 'http://my.proxy.server:8080' }) },
});
```

Voice connections always use your real IP address: their UDP traffic cannot go through an HTTP or SOCKS proxy.

## Credits

- [discord.js](https://github.com/discordjs/discord.js): the library this code is derived from (v13).
  Licensed under the Apache License 2.0 ([LICENSE-APACHE](LICENSE-APACHE)). Copyright 2015 - 2021 Noel Buechler,
  Copyright 2015 - 2021 Amish Shah.
- [discord.js-selfbot-v13](https://github.com/aiko-chan-ai/discord.js-selfbot-v13) by
  [aiko-chan-ai](https://github.com/aiko-chan-ai): the selfbot fork this project is based on.
  Licensed under the GNU General Public License v3.0. Copyright (C) 2022 aiko-chan-ai and discordjs.

## License

[GPL-3.0-only](LICENSE)
