'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatSize, choiceTitle } = require('../cli/lib/ui');

// ── formatSize ────────────────────────────────────────────────────────────────

test('formatSize: 0 bytes', () => assert.equal(formatSize(0), '0B'));
test('formatSize: 1 byte', () => assert.equal(formatSize(1), '1B'));
test('formatSize: 1023 bytes', () => assert.equal(formatSize(1023), '1023B'));
test('formatSize: 1024 bytes → 1.0KB', () => assert.equal(formatSize(1024), '1.0KB'));
test('formatSize: 1536 bytes → 1.5KB', () => assert.equal(formatSize(1536), '1.5KB'));
test('formatSize: just under 1MB → KB', () => assert.ok(formatSize(1024 * 1024 - 1).endsWith('KB')));
test('formatSize: 1MB → 1.0MB', () => assert.equal(formatSize(1024 * 1024), '1.0MB'));
test('formatSize: 2.5MB', () => assert.equal(formatSize(1024 * 1024 * 2.5), '2.5MB'));

// ── choiceTitle ───────────────────────────────────────────────────────────────

function entry(status, filePath = 'package/index.js', size = 500) {
  return { status, path: filePath, size };
}

test('choiceTitle: added status starts with "+ "', () => {
  assert.ok(choiceTitle(entry('added'), []).startsWith('+ '));
});

test('choiceTitle: modified status starts with "~ "', () => {
  assert.ok(choiceTitle(entry('modified'), []).startsWith('~ '));
});

test('choiceTitle: removed status starts with "- "', () => {
  assert.ok(choiceTitle(entry('removed'), []).startsWith('- '));
});

test('choiceTitle: unchanged status starts with "  "', () => {
  assert.ok(choiceTitle(entry('unchanged'), []).startsWith('  '));
});

test('choiceTitle: unknown status falls back to two spaces', () => {
  assert.ok(choiceTitle(entry('bogus'), []).startsWith('  '));
});

test('choiceTitle: no warnings → no brackets in output', () => {
  assert.ok(!choiceTitle(entry('added'), []).includes('['));
});

test('choiceTitle: one warning appears bracketed', () => {
  assert.ok(choiceTitle(entry('added'), ['source map']).includes('[source map]'));
});

test('choiceTitle: two warnings both appear', () => {
  const title = choiceTitle(entry('added'), ['source map', 'archive']);
  assert.ok(title.includes('[source map]'));
  assert.ok(title.includes('[archive]'));
});

test('choiceTitle: size is formatted and appears in parentheses', () => {
  const title = choiceTitle(entry('unchanged', 'package/a.js', 1024), []);
  assert.ok(title.includes('(1.0KB)'));
});

test('choiceTitle: full format check', () => {
  const title = choiceTitle(
    { status: 'added', path: 'package/index.js', size: 500 },
    ['log file']
  );
  assert.equal(title, '+ package/index.js  (500B)  [log file]');
});
