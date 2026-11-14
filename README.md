<div align="center">

# 🤖 @zeppelinid/discord.js

**An unofficial fork of [discord.js](https://github.com/discordjs/discord.js) v13 for automating Discord user accounts
(selfbots), based on [discord.js-selfbot-v13](https://github.com/aiko-chan-ai/discord.js-selfbot-v13).**

[![npm version](https://img.shields.io/npm/v/@zeppelinid/discord.js?logo=npm&color=cb3837)](https://www.npmjs.com/package/@zeppelinid/discord.js)
[![npm downloads](https://img.shields.io/npm/dm/@zeppelinid/discord.js?logo=npm)](https://www.npmjs.com/package/@zeppelinid/discord.js)
[![CI](https://github.com/ZeppelinID/discord.js/actions/workflows/ci.yml/badge.svg)](https://github.com/ZeppelinID/discord.js/actions/workflows/ci.yml)
[![Node.js version](https://img.shields.io/node/v/@zeppelinid/discord.js?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/@zeppelinid/discord.js)](LICENSE)

</div>

> **⚠️ Warning**
> Automating a user account is against Discord's
> [Terms of Service](https://support.discord.com/hc/en-us/articles/115002192352) and can get the account banned.
> Use it at your own risk. This project is not affiliated with Discord Inc. or the discord.js team.

## ✨ Features

- 🔑 **Login** with a token or a QR code from the Discord mobile app, plus automatic 2FA codes (`TOTPKey`)
- 💬 **Messages**: embeds with `WebEmbed`, polls, voice messages and Spotify "listen along" invites
- ⚡ **Interactions**: run slash commands from a user account (`channel.sendSlash()`), click buttons
  (`message.clickButton()`) and pick select menu options (`message.selectMenu()`)
- 🎮 **Presence**: `RichPresence`, `CustomStatus`, `SpotifyRPC` and "Playing on Samsung Galaxy"
- 🔊 **Voice**: join channels, play audio and video, go live, watch and record streams, record audio
- 🧩 **Account actions**: join servers (`client.acceptInvite()`), add bots (`client.authorizeURL()`), install user
  apps (`client.installUserApps()`) and redeem Nitro gifts (`client.redeemNitro()`)
- 🛡️ **Captcha hook**: plug in your own solver with the `captchaSolver` option
- 🌐 **Proxies** for REST requests, uploads, downloads, the gateway and QR login
- 📘 **TypeScript** typings included

## 📦 Installation

```sh
npm install @zeppelinid/discord.js
```

- Requires **Node.js 26.13.1** or newer.
- TypeScript users also need `@types/node`.

### 🧰 Optional packages

Install only what the features you use need:

| Feature                       | What to install                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔊 Voice (play and record)    | `ffmpeg` on your PATH (or `ffmpeg-static`), an Opus library (`@discordjs/opus` or `opusscript`) and an encryption library (`sodium`, `libsodium-wrappers` or `@stablelib/xchacha20poly1305`) |
| 🌐 Gateway and QR login proxy | `proxy-agent`                                                                                                                                                                                |

## 🚀 Quick start

```js
const { Client } = require('@zeppelinid/discord.js');

const client = new Client();

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.username}`);
});

client.on('messageCreate', message => {
  if (message.content === 'ping') message.reply('pong 🏓');
});

client.login(process.env.DISCORD_TOKEN);
```

> **🔒 Keep your token secret.** Anyone who has it controls your account. Store it in an environment variable: when
> `DISCORD_TOKEN` is set, `client.login()` also works without an argument.

## 🔑 Logging in

### 📱 QR code

```js
try {
  await client.QRLogin(); // Prints a QR code in the terminal: scan it with the Discord mobile app
} catch (error) {
  console.error('QR login failed:', error.message); // The code expired, was cancelled or the connection failed
}
```

### 🔐 Two-factor authentication

```js
// Used automatically whenever Discord asks for a 2FA code
const client = new Client({ TOTPKey: 'YOUR 2FA SECRET' });
```

### 🛡️ Captcha

```js
const client = new Client({
  // Called when Discord asks for a captcha: solve it with your provider and return the solution key
  captchaSolver: async (captcha, userAgent) => solveWithYourProvider(captcha, userAgent),
});
```

## 🎮 Rich presence

```js
const { CustomStatus, RichPresence } = require('@zeppelinid/discord.js');

const status = new CustomStatus(client).setEmoji('😋').setState('yum');
const activity = new RichPresence(client)
  .setApplicationId('367827983903490050')
  .setType('PLAYING')
  .setName('osu!')
  .setDetails('MariannE - Yooh')
  .setStartTimestamp(Date.now());

client.user.setPresence({ activities: [status, activity] });
```

See [`examples/RichPresence.js`](examples/RichPresence.js) for images, buttons and Spotify.

## ⚡ Slash commands and buttons

```js
await channel.sendSlash('BOT_ID', 'ping'); // Same as typing /ping in the channel
await message.clickButton('BUTTON_CUSTOM_ID');
```

Subcommands, options and attachments are covered in [`examples/SlashCommand.md`](examples/SlashCommand.md).

## 🔊 Voice

```js
const connection = await client.voice.joinChannel(channel, { selfMute: true, selfDeaf: true, selfVideo: false });

const dispatcher = connection.playAudio('./song.mp3');
dispatcher.on('finish', () => connection.disconnect());
```

Recording someone's stream:

```js
const fs = require('node:fs');

const stream = await connection.joinStreamConnection('USER_ID');
const recorder = stream.receiver.createVideoStream('USER_ID', fs.createWriteStream('video.mkv'));
recorder.on('error', console.error); // For example when ffmpeg is not installed
setTimeout(() => recorder.destroy(), 15_000);
```

## 🌐 Proxy

```js
const { ProxyAgent } = require('proxy-agent');

const client = new Client({
  // REST requests, attachment uploads, file downloads and QR login
  http: { agent: 'http://user:pass@my.proxy.server:8080' }, // Or 'socks5://my.proxy.server:1080'
  // Gateway and QR login WebSocket
  ws: { agent: new ProxyAgent({ getProxyForUrl: () => 'http://my.proxy.server:8080' }) },
});
```

> **⚠️ Voice is never proxied.** Voice connections send UDP traffic, which an HTTP or SOCKS proxy cannot carry, so
> voice servers always see your real IP address.

## 📂 Examples

| Example                                                                     | What it shows                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------- |
| [`Basic.js`](examples/Basic.js)                                             | 👋 Log in and reply to messages                 |
| [`RichPresence.js`](examples/RichPresence.js)                               | 🎮 Rich presence, custom status and Spotify     |
| [`SamsungRPC.js`](examples/SamsungRPC.js)                                   | 📱 "Playing on Samsung Galaxy" activity         |
| [`Embed.js`](examples/Embed.js)                                             | 🖼️ Embeds with `WebEmbed`                       |
| [`CreateAndVotePoll.js`](examples/CreateAndVotePoll.js)                     | 📊 Create a poll and vote                       |
| [`VoiceMessage.js`](examples/VoiceMessage.js)                               | 🎤 Send a voice message                         |
| [`ActivityMessage.js`](examples/ActivityMessage.js)                         | 🎧 Send a Spotify "listen along" invite         |
| [`SlashCommand.md`](examples/SlashCommand.md)                               | ⚡ Run slash commands from a user account       |
| [`JoinGuild.js`](examples/JoinGuild.js)                                     | 🚪 Join a server from an invite                 |
| [`AddBot.js`](examples/AddBot.js)                                           | 🤖 Add a bot to a server, with a captcha solver |
| [`AuthorizeUserApps.js`](examples/AuthorizeUserApps.js)                     | 🧩 Install user apps                            |
| [`Proxy.js`](examples/Proxy.js)                                             | 🌐 REST and gateway proxies                     |
| [`VoiceChannel/JoinVoice.js`](examples/VoiceChannel/JoinVoice.js)           | 🔊 Join a voice channel                         |
| [`VoiceChannel/PlayAudio.js`](examples/VoiceChannel/PlayAudio.js)           | 🎵 Play audio                                   |
| [`VoiceChannel/PlayVideo.js`](examples/VoiceChannel/PlayVideo.js)           | 📺 Play video and go live                       |
| [`VoiceChannel/RecordingAudio.js`](examples/VoiceChannel/RecordingAudio.js) | 🎙️ Record audio                                 |
| [`VoiceChannel/RecordingVideo.js`](examples/VoiceChannel/RecordingVideo.js) | 🎬 Record someone's stream                      |

## 🛠️ Development

```sh
npm install
npm run lint          # ESLint and Prettier
npm run test:typings  # Type-check the typings
npm run build         # Fix lint, format and type-check
```

Every push and pull request runs the [CI workflow](.github/workflows/ci.yml). Publishing a GitHub release runs the
[Publish workflow](.github/workflows/publish.yml), which releases the version from `package.json` to npm.

## 🙏 Credits

- [discord.js](https://github.com/discordjs/discord.js): the library this code is derived from (v13).
  Licensed under the Apache License 2.0 ([LICENSE-APACHE](LICENSE-APACHE)). Copyright 2015 - 2021 Noel Buechler,
  Copyright 2015 - 2021 Amish Shah.
- [discord.js-selfbot-v13](https://github.com/aiko-chan-ai/discord.js-selfbot-v13) by
  [aiko-chan-ai](https://github.com/aiko-chan-ai): the selfbot fork this project is based on.
  Licensed under the GNU General Public License v3.0. Copyright (C) 2022 aiko-chan-ai and discordjs.

## 📄 License

[GPL-3.0-only](LICENSE)
