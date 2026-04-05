'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { write, read, ATTESTATION_FILE } = require('../cli/lib/attestation');

const OPTS = {
  packageName: 'testpkg',
  packageVersion: '1.2.3',
  artifactHash: 'sha256:deadbeef',
  selectedFiles: ['package/index.js', 'package/package.json'],
};

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-att-'));
});

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true });
});

test('write returns path and record', () => {
  const { path: p, record } = write(tmpDir, OPTS);
  assert.ok(p.endsWith(ATTESTATION_FILE));
  assert.ok(typeof record === 'object');
});

test('written file exists on disk', () => {
  write(tmpDir, OPTS);
  assert.ok(fs.existsSync(path.join(tmpDir, ATTESTATION_FILE)));
});

test('read returns null when file is absent', () => {
  const result = read(path.join(os.tmpdir(), 'pa-nonexistent-xyz-abc'));
  assert.equal(result, null);
});

test('round-trip: read returns what write wrote', () => {
  write(tmpDir, OPTS);
  const record = read(tmpDir);
  assert.equal(record.version, 1);
  assert.equal(record.package_name, OPTS.packageName);
  assert.equal(record.package_version, OPTS.packageVersion);
  assert.equal(record.artifact_hash, OPTS.artifactHash);
  assert.deepEqual(record.selected_files, OPTS.selectedFiles);
});

test('reviewed_at is a valid ISO date string', () => {
  write(tmpDir, OPTS);
  const record = read(tmpDir);
  assert.ok(!isNaN(Date.parse(record.reviewed_at)));
});

test('tool_version is a non-empty string', () => {
  write(tmpDir, OPTS);
  const record = read(tmpDir);
  assert.equal(typeof record.tool_version, 'string');
  assert.ok(record.tool_version.length > 0);
});

test('reviewer field starts with git:', () => {
  write(tmpDir, OPTS);
  const record = read(tmpDir);
  assert.equal(typeof record.reviewer, 'string');
  assert.ok(record.reviewer.startsWith('git:'));
});

test('source_commit is a non-empty string', () => {
  write(tmpDir, OPTS);
  const record = read(tmpDir);
  assert.equal(typeof record.source_commit, 'string');
  assert.ok(record.source_commit.length > 0);
});

test('read returns null on malformed JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-bad-'));
  try {
    fs.writeFileSync(path.join(dir, ATTESTATION_FILE), 'not valid json');
    assert.equal(read(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
