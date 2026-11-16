'use strict';

const { TypeError } = require('../errors');

const noop = () => {}; // eslint-disable-line no-empty-function
// A route part must stay one path segment. The HTTP client resolves "../" and "%2e%2e", so a part like
// "../users/@me" taken from user text would call a different endpoint with the account token.
const unsafeRoutePart = /^(?:\.|%2e){1,2}$|[/\\?#]|%2f|%5c/i;

function checkRoutePart(part) {
  if (unsafeRoutePart.test(String(part))) throw new TypeError('INVALID_ROUTE_PART', part);
  return part;
}

const methods = ['get', 'post', 'delete', 'patch', 'put'];
const reflectors = [
  'toString',
  'valueOf',
  'inspect',
  'constructor',
  Symbol.toPrimitive,
  Symbol.for('nodejs.util.inspect.custom'),
];

function buildRoute(manager) {
  const route = [''];
  const handler = {
    get(target, name) {
      if (reflectors.includes(name)) return () => route.join('/');
      if (methods.includes(name)) {
        const routeBucket = [];
        for (let i = 0; i < route.length; i++) {
          // Reactions routes and sub-routes all share the same bucket
          if (route[i - 1] === 'reactions') break;
          // Literal ids should only be taken account if they are the Major id (the Channel/Guild id)
          if (/\d{16,19}/g.test(route[i]) && !/channels|guilds/.test(route[i - 1])) routeBucket.push(':id');
          // All other parts of the route should be considered as part of the bucket identifier
          else routeBucket.push(route[i]);
        }
        return options =>
          manager.request(
            name,
            route.join('/'),
            Object.assign(
              {
                versioned: manager.versioned,
                route: routeBucket.join('/'),
              },
              options,
            ),
          );
      }
      route.push(checkRoutePart(name));
      return new Proxy(noop, handler);
    },
    apply(target, _, args) {
      route.push(...args.filter(x => x != null).map(checkRoutePart)); // eslint-disable-line eqeqeq
      return new Proxy(noop, handler);
    },
  };
  return new Proxy(noop, handler);
}

module.exports = buildRoute;
