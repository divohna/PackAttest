'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const tar = require('tar-stream');

/**
 * Creates a real .tgz at a temp path containing the given virtual files.
 * files: [{ name: string, content: string | Buffer }]
 * Returns the absolute path to the .tgz file.
 */
async function makeTarball(files) {
  const tmpPath = path.join(
    os.tmpdir(),
    `pa-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tgz`
  );

  await new Promise((resolve, reject) => {
    const pack = tar.pack();
    const out = fs.createWriteStream(tmpPath);

    pack.pipe(zlib.createGzip()).pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    pack.on('error', reject);

    (async () => {
      for (const file of files) {
        if (file.linkname != null) {
          // symlink entry
          const hdr = { name: file.name, type: 'symlink', linkname: file.linkname };
          if (file.mode != null) hdr.mode = file.mode;
          await new Promise((res, rej) => {
            pack.entry(hdr, err => err ? rej(err) : res());
          });
        } else {
          // regular file entry
          const content = Buffer.isBuffer(file.content)
            ? file.content
            : Buffer.from(file.content);
          const hdr = { name: file.name, size: content.length };
          if (file.mode != null) hdr.mode = file.mode;
          await new Promise((res, rej) => {
            pack.entry(hdr, content, err => err ? rej(err) : res());
          });
        }
      }
      pack.finalize();
    })().catch(reject);
  });

  return tmpPath;
}

module.exports = { makeTarball };
