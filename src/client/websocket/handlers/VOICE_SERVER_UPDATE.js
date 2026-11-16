'use strict';

const Util = require('../../../util/Util');

module.exports = (client, packet) => {
  client.emit('debug', `[VOICE] received voice server: ${Util.redactedStringify(packet)}`);
  client.voice.onVoiceServer(packet.d);
};
