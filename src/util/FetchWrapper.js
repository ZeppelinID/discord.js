'use strict';

const { Impit } = require('impit');

/**
 * Wrapper around `impit` to provide a drop-in `fetch` replacement.
 * All fetch call points should import from this file for easy future replacement.
 *
 * This module exports:
 * - `fetch` - singleton impit fetch (browser: chrome, followRedirects: true)
 * - `FormData`, `Headers`, `Response`, `Request`, `Blob` - global web APIs
 * - `Impit` - the Impit class itself
 * - `createImpit` / `getDefaultImpit` / `createFetch` helpers for per-client instances
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
 * Create a bound fetch function from an Impit instance.
 * @param {Object} [options={}] Impit options
 * @returns {Function}
 */
function createFetch(options = {}) {
  const impit = createImpit(options);
  return impit.fetch.bind(impit);
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
 * Helper to extract proxy URL string from client.http.agent options.
 * Supports string, URL, or { uri } objects (same as previous Util.checkUndiciProxyAgent).
 * @param {string|URL|Object} data Proxy data
 * @returns {string|undefined}
 */
function getProxyUrl(data) {
  if (!data) return undefined;
  if (typeof data === 'string' && data.length > 0) return data;
  if (data instanceof URL) return data.toString();
  if (typeof data === 'object' && typeof data.uri === 'string' && data.uri.length > 0) return data.uri;
  // Also support { proxyUrl } shape
  if (typeof data === 'object' && typeof data.proxyUrl === 'string') return data.proxyUrl;
  // If it's an object with httpAgent/httpsAgent (ProxyAgent instance), can't extract URL - return undefined
  return undefined;
}

module.exports = {
  fetch,
  getDefaultImpit,
  createImpit,
  createFetch,
  getProxyUrl,
  Impit,
  FormData: globalThis.FormData,
  Headers: globalThis.Headers,
  Response: globalThis.Response,
  Request: globalThis.Request,
  Blob: globalThis.Blob,
  File: globalThis.File,
};
