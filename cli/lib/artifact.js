'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const tar = require('tar-stream');

async function pack(cwd = process.cwd()) {
  const raw = execSync('npm pack --json', {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const result = JSON.parse(raw.toString());
  return path.resolve(cwd, result[0].filename);
}

async function enumerate(tarballPath) {
  return new Promise((resolve, reject) => {
    const entries = [];
    const extract = tar.extract();

    extract.on('entry', (header, stream, next) => {
      if (header.type === 'symlink') {
        const linkTarget = header.linkname || '';
        const hash = crypto.createHash('sha256').update(linkTarget).digest('hex');
        entries.push({
          path: header.name,
          size: 0,
          sha256: hash,
          _content: Buffer.alloc(0),
          _header: { mode: header.mode, mtime: header.mtime, uid: header.uid, gid: header.gid, uname: header.uname, gname: header.gname, type: 'symlink', linkname: linkTarget },
        });
        stream.resume();
        next();
        return;
      }

      if (header.type !== 'file') {
        stream.resume();
        next();
        return;
      }

      const chunks = [];
      const hash = crypto.createHash('sha256');

      stream.on('data', chunk => {
        chunks.push(chunk);
        hash.update(chunk);
      });

      stream.on('end', () => {
        const content = Buffer.concat(chunks);
        entries.push({
          path: header.name,
          size: content.length,
          sha256: hash.digest('hex'),
          _content: content,
          _header: { mode: header.mode, mtime: header.mtime, uid: header.uid, gid: header.gid, uname: header.uname, gname: header.gname },
        });
        next();
      });

      stream.on('error', reject);
    });

    extract.on('finish', () => resolve(entries));
    extract.on('error', reject);

    fs.createReadStream(tarballPath)
      .on('error', reject)
      .pipe(zlib.createGunzip())
      .on('error', reject)
      .pipe(extract);
  });
}

function canonicalManifest(entries) {
  return [...entries]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(e => ({ path: e.path, size: e.size, sha256: e.sha256 }));
}

function canonicalHash(entries) {
  const manifest = canonicalManifest(entries);
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(manifest))
    .digest('hex');
  return `sha256:${digest}`;
}

module.exports = { pack, enumerate, canonicalManifest, canonicalHash };
