'use strict';

const { Impit } = require('impit');

/**
 * Wrapper around `impit` to provide a drop-in `fetch` replacement.
 * All fetch call points should import from this file for easy future replacement.
 *
 * This module exports:
 * - `fetch` - shared impit fetch without a proxy, the fallback when no client is available
 * - `createImpit` - per-client instances (RESTManager)
 * - `getProxyUrl` - turns `client.options.http.agent` into an impit `proxyUrl`
 */

let defaultImpit = null;

/**
 * Get or create the default Impit instance.
 * @returns {Impit}
 */
function getDefaultImpit() {
  if (!defaultImpit) {
    defaultImpit = new Impit({
      browser: 'chrome',
      followRedirects: true,
      ignoreTlsErrors: false,
    });
  }
  return defaultImpit;
}

/**
 * Create a new Impit instance.
 * @param {Object} [options={}] Impit options
 * @returns {Impit}
 */
function createImpit(options = {}) {
  return new Impit({
    browser: 'chrome',
    followRedirects: true,
    ...options,
  });
}

/**
 * Singleton fetch - delegates to the default Impit instance.
 * API compatible with global fetch.
 * @param {string|URL|Request} resource The resource to fetch
 * @param {Object} [init] Request options
 * @returns {Promise<Response>}
 */
function fetch(resource, init) {
  return getDefaultImpit().fetch(resource, init);
}

/**
 * Extracts the impit `proxyUrl` from `client.options.http.agent`.
 * Accepts a URL string, a URL, or `{ uri }` (the shape of the old undici ProxyAgent options).
 * Anything else (e.g. a `proxy-agent` instance) means no REST proxy.
 * @param {string|URL|Object} data Proxy data
 * @returns {string|undefined}
 */
function getProxyUrl(data) {
  if (!data) return undefined;
  if (typeof data === 'string' && data.length > 0) return data;
  if (data instanceof URL) return data.toString();
  if (typeof data === 'object' && typeof data.uri === 'string' && data.uri.length > 0) return data.uri;
  return undefined;
}

module.exports = { fetch, createImpit, getProxyUrl };
