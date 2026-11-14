'use strict';

const { spawn } = require('child_process');
const { createSocket } = require('dgram');
const { EventEmitter } = require('events');
const { Buffer } = require('node:buffer');
const { Writable } = require('stream');
const { RtpPacket } = require('werift-rtp');
const Util = require('../../../util/Util');
const { randomPorts } = require('../util/Function');
const { StreamOutput } = require('../util/Socket');

/**
 * Represents a FFmpeg handler
 * @extends {EventEmitter}
 */
class Recorder extends EventEmitter {
  constructor(receiver, { userId, portUdpH264, portUdpOpus, output } = {}) {
    super();

    Object.defineProperty(this, 'receiver', { value: receiver });

    /**
     * The user ID
     * @type {Snowflake}
     */
    this.userId = userId;

    this.portUdpH264 = portUdpH264;
    this.portUdpH265 = null;
    this.portUdpOpus = portUdpOpus;

    this.promise = null;

    if (!portUdpH264 || !portUdpOpus) {
      this.promise = (async () => {
        // RTP needs even ports and about half of the random ones are odd, so draw until two distinct even ones
        const even = new Set();
        while (even.size < 2) {
          for (const port of await randomPorts(6, 'udp4')) if (port % 2 === 0) even.add(port);
        }
        const [first, second] = even;
        this.portUdpH264 ??= first;
        this.portUdpOpus ??= second;
      })();
    }

    /**
     * The output of the stream
     * @type {string|Readable}
     */
    this.output = output;

    /**
     * The FFmpeg process is ready or not
     * @type {boolean}
     */
    this.ready = false;

    /**
     * Whether the Recorder has been destroyed
     * @type {boolean}
     */
    this.destroyed = false;

    this.socket = createSocket('udp4');

    this.init(output);
  }
  async init(output) {
    await this.promise;
    // A destroy() during port picking must not leave an ffmpeg that nobody will stop
    if (this.destroyed) return;
    const sdpData = Util.getSDPCodecName(this.portUdpH264, this.portUdpH265, this.portUdpOpus);
    const isStream = output instanceof Writable;
    if (isStream) {
      this.outputStream = StreamOutput(output);
    }
    const stream = spawn('ffmpeg', [
      '-reorder_queue_size',
      '500',
      '-thread_queue_size',
      '500',
      '-err_detect',
      'ignore_err',
      '-flags2',
      '+export_mvs',
      '-fflags',
      '+genpts+discardcorrupt',
      '-use_wallclock_as_timestamps',
      '1',
      '-f',
      'sdp',
      '-analyzeduration',
      '1M',
      '-probesize',
      '1M',
      '-protocol_whitelist',
      'file,udp,rtp,pipe,fd',
      '-i',
      '-', // Read from stdin
      '-buffer_size',
      '4M',
      '-max_delay',
      '500000', // 500ms
      '-rtbufsize',
      '4M',
      '-c',
      'copy',
      '-y',
      '-f',
      'matroska',
      isStream ? this.outputStream.url : output,
    ]);

    /**
     * The FFmpeg process
     * @type {ChildProcessWithoutNullStreams}
     */
    this.stream = stream;
    // A missing ffmpeg (ENOENT) arrives here; unhandled it would crash the whole process, so it goes to
    // 'error' when someone listens and to 'debug' otherwise (like Receiver does with packet errors)
    stream.once('error', error => {
      this.destroy();
      if (this.listenerCount('error')) this.emit('error', error);
      else this.emit('debug', `FFmpeg failed to start: ${error.message}`);
    });
    this.stream.stdin.write(sdpData);
    this.stream.stdin.end();
    this.stream.stderr.once('data', data => {
      this.emit('debug', `stderr: ${data}`);
      this.ready = true;
      this.emit('ready');
    });
  }
  /**
   * Send a payload to FFmpeg via UDP
   * @param {RtpPacket|string|Buffer} payload The payload
   * @param {*} callback Callback
   */
  feed(
    payload,
    callback = e => {
      if (e) {
        console.error('Error sending packet:', e);
      }
    },
  ) {
    // The UDP socket is closed by destroy(); a late packet must not throw from the receive handler
    if (this.destroyed) return;
    if (!(payload instanceof RtpPacket)) {
      payload = RtpPacket.deSerialize(Buffer.isBuffer(payload) ? payload : Buffer.from(payload));
    }
    const message = payload.serialize();
    // Get port from payloadType
    let port;
    if (payload.header.payloadType === Util.getPayloadType('opus')) {
      port = this.portUdpOpus;
    } else if (payload.header.payloadType === Util.getPayloadType('H264')) {
      port = this.portUdpH264;
    } else if (payload.header.payloadType === Util.getPayloadType('H265')) {
      port = this.portUdpH265;
    } else {
      return;
    }
    this.socket.send(message, 0, message.length, port, '127.0.0.1', callback);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    // `this.stream` is the ffmpeg process itself (spawned without a shell), so no process lookup is needed
    this.stream?.kill();
    this.socket.close();
    this.receiver?.videoStreams?.delete(this.userId);
    this.emit('closed');
  }

  /**
   * Emitted when the Recorder becomes ready to start working.
   * @event Recorder#ready
   */

  /**
   * Emitted when the Recorder is closed.
   * @event Recorder#closed
   */
}

module.exports = Recorder;
