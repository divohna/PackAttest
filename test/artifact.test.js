'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const { canonicalManifest, canonicalHash, enumerate } = require('../cli/lib/artifact');
const { makeTarball } = require('./helpers');

// ── Pure function tests ───────────────────────────────────────────────────────

test('canonicalManifest sorts entries by path', () => {
  const entries = [
    { path: 'package/z.js', size: 1, sha256: 'z' },
    { path: 'package/a.js', size: 2, sha256: 'a' },
    { path: 'package/m.js', size: 3, sha256: 'm' },
  ];
  const manifest = canonicalManifest(entries);
  assert.deepEqual(manifest.map(e => e.path), [
    'package/a.js',
    'package/m.js',
    'package/z.js',
  ]);
});

test('canonicalManifest strips _content field', () => {
  const entries = [{ path: 'package/a.js', size: 5, sha256: 'abc', _content: Buffer.from('x') }];
  const manifest = canonicalManifest(entries);
  assert.equal('_content' in manifest[0], false);
  assert.deepEqual(Object.keys(manifest[0]).sort(), ['path', 'sha256', 'size']);
});

test('canonicalManifest does not mutate input', () => {
  const entries = [
    { path: 'package/b.js', size: 1, sha256: 'b' },
    { path: 'package/a.js', size: 1, sha256: 'a' },
  ];
  canonicalManifest(entries);
  assert.equal(entries[0].path, 'package/b.js');
});

test('canonicalManifest: empty input returns []', () => {
  assert.deepEqual(canonicalManifest([]), []);
});

test('canonicalHash returns string starting with sha256:', () => {
  const entries = [{ path: 'package/a.js', size: 1, sha256: 'abc' }];
  assert.ok(canonicalHash(entries).startsWith('sha256:'));
});

test('canonicalHash is stable regardless of input order', () => {
  const a = { path: 'package/a.js', size: 1, sha256: 'aaa' };
  const b = { path: 'package/b.js', size: 2, sha256: 'bbb' };
  assert.equal(canonicalHash([a, b]), canonicalHash([b, a]));
});

test('canonicalHash differs for different entries', () => {
  const e1 = [{ path: 'package/a.js', size: 1, sha256: 'aaa' }];
  const e2 = [{ path: 'package/a.js', size: 1, sha256: 'bbb' }];
  assert.notEqual(canonicalHash(e1), canonicalHash(e2));
});

test('canonicalHash: changing one sha256 changes the hash', () => {
  const base = [
    { path: 'package/a.js', size: 1, sha256: 'aaa' },
    { path: 'package/b.js', size: 2, sha256: 'bbb' },
  ];
  const changed = [
    { path: 'package/a.js', size: 1, sha256: 'aaa' },
    { path: 'package/b.js', size: 2, sha256: 'ccc' },
  ];
  assert.notEqual(canonicalHash(base), canonicalHash(changed));
});

// ── enumerate tests (requires real tarball) ───────────────────────────────────

const FILE_A = { name: 'package/index.js', content: 'console.log("hello");' };
const FILE_B = { name: 'package/README.md', content: '# hello' };

let tarballPath;

before(async () => {
  tarballPath = await makeTarball([FILE_A, FILE_B]);
});

after(() => {
  if (tarballPath) try { fs.unlinkSync(tarballPath); } catch {}
});

test('enumerate returns one entry per file', async () => {
  const entries = await enumerate(tarballPath);
  assert.equal(entries.length, 2);
});

test('enumerate entry has path, size, sha256, _content fields', async () => {
  const entries = await enumerate(tarballPath);
  for (const entry of entries) {
    assert.ok('path' in entry);
    assert.ok('size' in entry);
    assert.ok('sha256' in entry);
    assert.ok('_content' in entry);
  }
});

test('enumerate entry size matches content byte length', async () => {
  const entries = await enumerate(tarballPath);
  for (const entry of entries) {
    assert.equal(entry.size, entry._content.length);
  }
});

test('enumerate _content is a Buffer matching original content', async () => {
  const entries = await enumerate(tarballPath);
  const a = entries.find(e => e.path === FILE_A.name);
  assert.ok(a, 'entry for FILE_A not found');
  assert.ok(Buffer.isBuffer(a._content));
  assert.equal(a._content.toString(), FILE_A.content);
});

test('enumerate sha256 is a 64-char hex string', async () => {
  const entries = await enumerate(tarballPath);
  for (const entry of entries) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  }
});

test('enumerate sha256 matches independently computed hash', async () => {
  const entries = await enumerate(tarballPath);
  const a = entries.find(e => e.path === FILE_A.name);
  const expected = crypto
    .createHash('sha256')
    .update(Buffer.from(FILE_A.content))
    .digest('hex');
  assert.equal(a.sha256, expected);
});

test('enumerate captures symlink entries', async () => {
  const symlinkTarball = await makeTarball([
    { name: 'package/lib/cli.js', content: '#!/usr/bin/env node' },
    { name: 'package/bin.js', linkname: './lib/cli.js' },
  ]);

  try {
    const entries = await enumerate(symlinkTarball);
    assert.equal(entries.length, 2);
    const sym = entries.find(e => e.path === 'package/bin.js');
    assert.ok(sym, 'symlink entry not found');
    assert.equal(sym.size, 0);
    assert.equal(sym._header.type, 'symlink');
    assert.equal(sym._header.linkname, './lib/cli.js');
    assert.match(sym.sha256, /^[0-9a-f]{64}$/);
  } finally {
    try { fs.unlinkSync(symlinkTarball); } catch {}
  }
});

test('enumerate preserves _header metadata for regular files', async () => {
  const modeTarball = await makeTarball([
    { name: 'package/run.sh', content: '#!/bin/sh', mode: 0o755 },
  ]);

  try {
    const entries = await enumerate(modeTarball);
    assert.equal(entries.length, 1);
    assert.ok(entries[0]._header, '_header missing');
    assert.equal(entries[0]._header.mode, 0o755);
  } finally {
    try { fs.unlinkSync(modeTarball); } catch {}
  }
});

test('enumerate skips directory entries', async () => {
  const { makeTarball: mkTar } = require('./helpers');
  // makeTarball only adds file entries; we need a tarball with a dir entry
  const tar = require('tar-stream');
  const zlib = require('zlib');
  const os = require('os');
  const path = require('path');
  const tmpPath = path.join(os.tmpdir(), `pa-dir-test-${Date.now()}.tgz`);

  await new Promise((resolve, reject) => {
    const pack = tar.pack();
    const out = fs.createWriteStream(tmpPath);
    pack.pipe(zlib.createGzip()).pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    pack.on('error', reject);

    pack.entry({ name: 'package/', type: 'directory', size: 0 }, Buffer.alloc(0), err => {
      if (err) { reject(err); return; }
      const content = Buffer.from('code');
      pack.entry({ name: 'package/index.js', size: content.length }, content, err2 => {
        if (err2) { reject(err2); return; }
        pack.finalize();
      });
    });
  });

  try {
    const entries = await enumerate(tmpPath);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].path, 'package/index.js');
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
});
