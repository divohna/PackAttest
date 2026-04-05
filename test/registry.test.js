'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fetchPreviousArtifact } = require('../cli/lib/registry');

const tmpFiles = [];
after(() => {
  for (const p of tmpFiles) try { fs.unlinkSync(p); } catch {}
});

// Helper: build a mock _fetch that returns canned responses per URL pattern
function mockFetch(responses) {
  return async function _fetch(url) {
    for (const [pattern, response] of responses) {
      if (url.includes(pattern)) {
        if (response instanceof Error) throw response;
        return response;
      }
    }
    throw new Error(`Unexpected URL in mock: ${url}`);
  };
}

test('registry: returns null for 404 (genuinely unpublished)', async () => {
  const _fetch = mockFetch([
    ['registry.npmjs.org', { status: 404, body: Buffer.from('Not Found') }],
  ]);
  const result = await fetchPreviousArtifact('nonexistent-pkg-xyz', { _fetch });
  assert.equal(result, null);
});

test('registry: throws on non-404 HTTP error from metadata', async () => {
  const _fetch = mockFetch([
    ['registry.npmjs.org', { status: 503, body: Buffer.from('Service Unavailable') }],
  ]);
  await assert.rejects(
    () => fetchPreviousArtifact('some-pkg', { _fetch }),
    /Registry returned HTTP 503/
  );
});

test('registry: throws on network error during metadata fetch', async () => {
  const _fetch = mockFetch([
    ['registry.npmjs.org', new Error('getaddrinfo ENOTFOUND')],
  ]);
  await assert.rejects(
    () => fetchPreviousArtifact('some-pkg', { _fetch }),
    /Failed to fetch registry metadata.*ENOTFOUND/
  );
});

test('registry: throws when manifest has no tarball URL', async () => {
  const manifest = JSON.stringify({ version: '1.0.0', dist: {} });
  const _fetch = mockFetch([
    ['registry.npmjs.org', { status: 200, body: Buffer.from(manifest) }],
  ]);
  await assert.rejects(
    () => fetchPreviousArtifact('some-pkg', { _fetch }),
    /has no tarball URL/
  );
});

test('registry: throws on tarball download failure', async () => {
  const manifest = JSON.stringify({
    version: '1.0.0',
    dist: { tarball: 'https://registry.npmjs.org/some-pkg/-/some-pkg-1.0.0.tgz' },
  });
  const _fetch = mockFetch([
    ['registry.npmjs.org/some-pkg/latest', { status: 200, body: Buffer.from(manifest) }],
    ['some-pkg-1.0.0.tgz', { status: 500, body: Buffer.from('Internal Server Error') }],
  ]);
  await assert.rejects(
    () => fetchPreviousArtifact('some-pkg', { _fetch }),
    /Failed to download previous tarball/
  );
});

test('registry: returns path and version on success', async () => {
  const tgzContent = Buffer.from('fake-tarball-bytes');
  const manifest = JSON.stringify({
    version: '2.3.4',
    dist: { tarball: 'https://registry.npmjs.org/my-pkg/-/my-pkg-2.3.4.tgz' },
  });
  const _fetch = mockFetch([
    ['registry.npmjs.org/my-pkg/latest', { status: 200, body: Buffer.from(manifest) }],
    ['my-pkg-2.3.4.tgz', { status: 200, body: tgzContent }],
  ]);

  const result = await fetchPreviousArtifact('my-pkg', { _fetch });
  assert.ok(result);
  assert.equal(result.version, '2.3.4');
  assert.ok(fs.existsSync(result.path));
  assert.deepEqual(fs.readFileSync(result.path), tgzContent);
  tmpFiles.push(result.path);
});

test('registry: handles scoped package names', async () => {
  const _fetch = mockFetch([
    ['registry.npmjs.org', { status: 404, body: Buffer.from('Not Found') }],
  ]);
  const result = await fetchPreviousArtifact('@scope/my-pkg', { _fetch });
  assert.equal(result, null);
});
