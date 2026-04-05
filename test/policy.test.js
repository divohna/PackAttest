'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkPolicy } = require('../cli/lib/policy');

function e(p, size = 100) {
  return { path: p, size };
}

// source map
test('source map: .map file triggers warning', () => {
  assert.deepEqual(checkPolicy(e('package/dist/app.js.map')), ['source map']);
});

test('source map: .js file is clean', () => {
  assert.ok(!checkPolicy(e('package/dist/app.js')).includes('source map'));
});

// archives
test('archive: .zip triggers warning', () => {
  assert.deepEqual(checkPolicy(e('package/dist.zip')), ['archive']);
});

test('archive: .tar.gz triggers warning', () => {
  assert.deepEqual(checkPolicy(e('package/dist.tar.gz')), ['archive']);
});

test('archive: .tgz triggers warning', () => {
  assert.deepEqual(checkPolicy(e('package/dist.tgz')), ['archive']);
});

test('archive: case-insensitive (.ZIP)', () => {
  assert.deepEqual(checkPolicy(e('package/dist.ZIP')), ['archive']);
});

// log files
test('log file: .log triggers warning', () => {
  assert.deepEqual(checkPolicy(e('package/debug.log')), ['log file']);
});

// env files
test('env file: .env triggers warning', () => {
  assert.deepEqual(checkPolicy(e('package/.env')), ['env file']);
});

test('env file: .env.production triggers warning', () => {
  assert.deepEqual(checkPolicy(e('package/.env.production')), ['env file']);
});

test('env file: not-an-env-file.js is clean', () => {
  assert.ok(!checkPolicy(e('package/not-an-env-file.js')).includes('env file'));
});

// key/cert files
test('key/cert: .pem triggers warning', () => {
  assert.deepEqual(checkPolicy(e('package/server.pem')), ['key/cert file']);
});

test('key/cert: .key triggers warning', () => {
  assert.deepEqual(checkPolicy(e('package/server.key')), ['key/cert file']);
});

test('key/cert: .p12 triggers warning', () => {
  assert.deepEqual(checkPolicy(e('package/keystore.p12')), ['key/cert file']);
});

// large files
test('large file: above 1MB triggers warning', () => {
  assert.deepEqual(checkPolicy(e('package/big.bin', 1024 * 1024 + 1)), ['large file (>1MB)']);
});

test('large file: exactly 1MB is NOT flagged', () => {
  assert.ok(!checkPolicy(e('package/ok.bin', 1024 * 1024)).includes('large file (>1MB)'));
});

// clean file
test('clean file returns empty array', () => {
  assert.deepEqual(checkPolicy(e('package/index.js', 500)), []);
});

// multiple warnings
test('multiple warnings on one file', () => {
  const warnings = checkPolicy({ path: 'package/secrets.key', size: 2 * 1024 * 1024 });
  assert.ok(warnings.includes('key/cert file'));
  assert.ok(warnings.includes('large file (>1MB)'));
});
