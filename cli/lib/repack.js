'use strict';

const fs = require('fs');
const zlib = require('zlib');
const tar = require('tar-stream');
const { enumerate } = require('./artifact');

async function repack(entries, selectedPaths, outputPath) {
  const selectedSet = new Set(selectedPaths);
  const selectedEntries = entries.filter(e => selectedSet.has(e.path));

  if (selectedEntries.length !== selectedPaths.length) {
    const found = new Set(selectedEntries.map(e => e.path));
    const missing = selectedPaths.filter(p => !found.has(p));
    throw new Error(`Selected files not found in artifact: ${missing.join(', ')}`);
  }

  await new Promise((resolve, reject) => {
    const pack = tar.pack();
    const out = fs.createWriteStream(outputPath);

    pack.pipe(zlib.createGzip()).pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    pack.on('error', reject);

    (async () => {
      for (const entry of selectedEntries) {
        await new Promise((res, rej) => {
          if (entry._header && entry._header.type === 'symlink') {
            const hdr = { name: entry.path, type: 'symlink', linkname: entry._header.linkname };
            if (entry._header.mode != null) hdr.mode = entry._header.mode;
            if (entry._header.mtime != null) hdr.mtime = entry._header.mtime;
            if (entry._header.uid != null) hdr.uid = entry._header.uid;
            if (entry._header.gid != null) hdr.gid = entry._header.gid;
            if (entry._header.uname != null) hdr.uname = entry._header.uname;
            if (entry._header.gname != null) hdr.gname = entry._header.gname;
            pack.entry(hdr, err => (err ? rej(err) : res()));
          } else {
            const hdr = { name: entry.path, size: entry._content.length };
            if (entry._header) {
              if (entry._header.mode != null) hdr.mode = entry._header.mode;
              if (entry._header.mtime != null) hdr.mtime = entry._header.mtime;
              if (entry._header.uid != null) hdr.uid = entry._header.uid;
              if (entry._header.gid != null) hdr.gid = entry._header.gid;
              if (entry._header.uname != null) hdr.uname = entry._header.uname;
              if (entry._header.gname != null) hdr.gname = entry._header.gname;
            }
            pack.entry(hdr, entry._content, err => (err ? rej(err) : res()));
          }
        });
      }
      pack.finalize();
    })().catch(reject);
  });

  // Verify: re-enumerate and check exact match
  const repacked = await enumerate(outputPath);
  const repackedPaths = new Set(repacked.map(e => e.path));

  for (const p of selectedPaths) {
    if (!repackedPaths.has(p)) {
      throw new Error(`Verification failed: ${p} is missing from constrained artifact`);
    }
  }
  if (repacked.length !== selectedPaths.length) {
    throw new Error(
      `Verification failed: constrained artifact has ${repacked.length} files, expected ${selectedPaths.length}`
    );
  }
}

module.exports = { repack };
