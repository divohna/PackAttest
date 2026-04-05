'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeDiff } = require('../cli/lib/diff');

function entry(path, sha256 = 'abc123', size = 100) {
  return { path, sha256, size };
}

test('all added when previous is empty', () => {
  const current = [entry('package/a.js'), entry('package/b.js')];
  const result = computeDiff(current, []);
  assert.equal(result.filter(e => e.status === 'added').length, 2);
  assert.equal(result.filter(e => e.status !== 'added').length, 0);
});

test('all removed when current is empty', () => {
  const previous = [entry('package/a.js'), entry('package/b.js')];
  const result = computeDiff([], previous);
  assert.equal(result.filter(e => e.status === 'removed').length, 2);
  assert.equal(result.filter(e => e.status !== 'removed').length, 0);
});

test('unchanged when sha256 matches', () => {
  const e = entry('package/a.js', 'deadbeef');
  const result = computeDiff([e], [e]);
  assert.equal(result[0].status, 'unchanged');
});

test('modified when sha256 differs', () => {
  const current = entry('package/a.js', 'newhash');
  const previous = entry('package/a.js', 'oldhash');
  const result = computeDiff([current], [previous]);
  assert.equal(result[0].status, 'modified');
});

test('modified entry uses current size and sha256', () => {
  const current = { path: 'package/a.js', sha256: 'newhash', size: 200 };
  const previous = { path: 'package/a.js', sha256: 'oldhash', size: 100 };
  const result = computeDiff([current], [previous]);
  assert.equal(result[0].sha256, 'newhash');
  assert.equal(result[0].size, 200);
});

test('mixed: one of each status', () => {
  const current = [
    entry('package/added.js', 'hash-a'),
    entry('package/modified.js', 'hash-new'),
    entry('package/unchanged.js', 'hash-same'),
  ];
  const previous = [
    entry('package/modified.js', 'hash-old'),
    entry('package/unchanged.js', 'hash-same'),
    entry('package/removed.js', 'hash-r'),
  ];
  const result = computeDiff(current, previous);
  const byPath = Object.fromEntries(result.map(e => [e.path, e.status]));
  assert.equal(byPath['package/added.js'], 'added');
  assert.equal(byPath['package/modified.js'], 'modified');
  assert.equal(byPath['package/unchanged.js'], 'unchanged');
  assert.equal(byPath['package/removed.js'], 'removed');
});

test('result is sorted by path', () => {
  const current = [
    entry('package/z.js'),
    entry('package/a.js'),
    entry('package/m.js'),
  ];
  const result = computeDiff(current, []);
  const paths = result.map(e => e.path);
  assert.deepEqual(paths, [...paths].sort());
});

test('preserves original entry fields', () => {
  const e = { path: 'package/a.js', sha256: 'abc', size: 42, _content: Buffer.from('x') };
  const result = computeDiff([e], []);
  assert.equal(result[0].size, 42);
  assert.ok(Buffer.isBuffer(result[0]._content));
  assert.equal(result[0].status, 'added');
});

test('empty inputs return empty result', () => {
  assert.deepEqual(computeDiff([], []), []);
});
