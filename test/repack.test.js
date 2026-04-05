'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { repack } = require('../cli/lib/repack');
const { enumerate } = require('../cli/lib/artifact');
const { makeTarball } = require('./helpers');

const FILES = [
  { name: 'package/a.js', content: 'const a = 1;' },
  { name: 'package/b.js', content: 'const b = 2;' },
  { name: 'package/c.js', content: 'const c = 3;' },
];

let sourceTarball;
let sourceEntries;
const tmpOutputs = [];

before(async () => {
  sourceTarball = await makeTarball(FILES);
  sourceEntries = await enumerate(sourceTarball);
});

after(() => {
  if (sourceTarball) try { fs.unlinkSync(sourceTarball); } catch {}
  for (const p of tmpOutputs) try { fs.unlinkSync(p); } catch {}
});

function tmpOut() {
  const p = path.join(os.tmpdir(), `pa-repack-${Date.now()}-${Math.random().toString(36).slice(2)}.tgz`);
  tmpOutputs.push(p);
  return p;
}

test('repack: selects a single file correctly', async () => {
  const out = tmpOut();
  await repack(sourceEntries, ['package/a.js'], out);
  const repacked = await enumerate(out);
  assert.equal(repacked.length, 1);
  assert.equal(repacked[0].path, 'package/a.js');
});

test('repack: selects two files correctly', async () => {
  const out = tmpOut();
  await repack(sourceEntries, ['package/a.js', 'package/c.js'], out);
  const repacked = await enumerate(out);
  assert.equal(repacked.length, 2);
  const paths = repacked.map(e => e.path).sort();
  assert.deepEqual(paths, ['package/a.js', 'package/c.js']);
});

test('repack: all three files resolves without error', async () => {
  const out = tmpOut();
  await repack(sourceEntries, FILES.map(f => f.name), out);
  const repacked = await enumerate(out);
  assert.equal(repacked.length, 3);
});

test('repack: content is preserved', async () => {
  const out = tmpOut();
  await repack(sourceEntries, ['package/b.js'], out);
  const repacked = await enumerate(out);
  assert.equal(repacked[0]._content.toString(), 'const b = 2;');
});

test('repack: sha256 is preserved', async () => {
  const out = tmpOut();
  const original = sourceEntries.find(e => e.path === 'package/b.js');
  await repack(sourceEntries, ['package/b.js'], out);
  const repacked = await enumerate(out);
  assert.equal(repacked[0].sha256, original.sha256);
});

test('repack: throws when selected path not in entries', async () => {
  const out = tmpOut();
  await assert.rejects(
    () => repack(sourceEntries, ['package/nonexistent.js'], out),
    /not found in artifact/
  );
});

test('repack: empty selection produces empty tarball', async () => {
  const out = tmpOut();
  await repack(sourceEntries, [], out);
  const repacked = await enumerate(out);
  assert.equal(repacked.length, 0);
});

test('repack: preserves symlink entries', async () => {
  const symlinkTarball = await makeTarball([
    { name: 'package/lib/cli.js', content: '#!/usr/bin/env node' },
    { name: 'package/bin.js', linkname: './lib/cli.js' },
  ]);

  try {
    const entries = await enumerate(symlinkTarball);
    assert.equal(entries.length, 2);

    const out = tmpOut();
    await repack(entries, ['package/lib/cli.js', 'package/bin.js'], out);
    const repacked = await enumerate(out);

    assert.equal(repacked.length, 2);
    const sym = repacked.find(e => e.path === 'package/bin.js');
    assert.ok(sym, 'symlink entry missing after repack');
    assert.equal(sym._header.type, 'symlink');
    assert.equal(sym._header.linkname, './lib/cli.js');
  } finally {
    try { fs.unlinkSync(symlinkTarball); } catch {}
  }
});

test('repack: preserves file mode', async () => {
  const modeTarball = await makeTarball([
    { name: 'package/run.sh', content: '#!/bin/sh\necho hi', mode: 0o755 },
  ]);

  try {
    const entries = await enumerate(modeTarball);
    const out = tmpOut();
    await repack(entries, ['package/run.sh'], out);
    const repacked = await enumerate(out);

    assert.equal(repacked.length, 1);
    assert.equal(repacked[0]._header.mode, 0o755);
  } finally {
    try { fs.unlinkSync(modeTarball); } catch {}
  }
});
