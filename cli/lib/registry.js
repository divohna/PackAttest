'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'packattest/0.1.0' } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return httpsGet(res.headers.location).then(resolve).catch(reject);
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

async function fetchPreviousArtifact(packageName, { _fetch = httpsGet } = {}) {
  const encoded = packageName.startsWith('@')
    ? '@' + encodeURIComponent(packageName.slice(1))
    : encodeURIComponent(packageName);

  let manifest;
  try {
    const { status, body } = await _fetch(`https://registry.npmjs.org/${encoded}/latest`);
    if (status === 404) return null; // genuinely unpublished
    if (status !== 200) {
      throw new Error(`Registry returned HTTP ${status} for ${packageName}`);
    }
    manifest = JSON.parse(body.toString());
  } catch (err) {
    if (err.message && err.message.startsWith('Registry returned')) throw err;
    throw new Error(`Failed to fetch registry metadata for ${packageName}: ${err.message}`);
  }

  if (!manifest?.dist?.tarball) {
    throw new Error(`Registry metadata for ${packageName}@${manifest.version} has no tarball URL`);
  }

  const version = manifest.version;
  const safe = packageName.replace(/[^a-z0-9]/gi, '-');
  const tmpPath = path.join(os.tmpdir(), `packattest-prev-${safe}-${version}.tgz`);

  try {
    const { status, body } = await _fetch(manifest.dist.tarball);
    if (status !== 200) {
      throw new Error(`Tarball download returned HTTP ${status}`);
    }
    fs.writeFileSync(tmpPath, body);
    return { path: tmpPath, version };
  } catch (err) {
    throw new Error(`Failed to download previous tarball for ${packageName}@${version}: ${err.message}`);
  }
}

module.exports = { fetchPreviousArtifact };
