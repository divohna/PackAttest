'use strict';

const path = require('path');

const RULES = [
  {
    test: p => p.endsWith('.map'),
    label: 'source map',
  },
  {
    test: p => /\.(zip|tar|tar\.gz|tgz|rar|7z)$/i.test(p),
    label: 'archive',
  },
  {
    test: p => p.endsWith('.log'),
    label: 'log file',
  },
  {
    test: p => /\.env(\.|$)/i.test(path.basename(p)),
    label: 'env file',
  },
  {
    test: p => /\.(pem|key|p12|pfx|jks)$/i.test(p),
    label: 'key/cert file',
  },
  {
    test: (p, size) => size > 1024 * 1024,
    label: 'large file (>1MB)',
  },
];

function checkPolicy(entry) {
  return RULES
    .filter(rule => rule.test(entry.path, entry.size))
    .map(rule => rule.label);
}

module.exports = { checkPolicy };
