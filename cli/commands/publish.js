'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const { read: readAttestation } = require('../lib/attestation');
const { pack, enumerate, canonicalHash } = require('../lib/artifact');
const { repack } = require('../lib/repack');

async function publish({ otp } = {}) {
  const cwd = process.cwd();

  console.log('PackAttest — publish\n');

  // Load attestation
  const attestation = readAttestation(cwd);
  if (!attestation) {
    console.error('No .packattest file found. Run `pa review` first.');
    process.exit(1);
  }

  console.log(`Attested by:    ${attestation.reviewer}`);
  console.log(`Attested at:    ${attestation.reviewed_at}`);
  console.log(`Attested hash:  ${attestation.artifact_hash}`);
  console.log(`Files selected: ${attestation.selected_files.length}\n`);

  // Pack + enumerate current artifact
  process.stdout.write('Packing current artifact... ');
  let tarballPath;
  try {
    tarballPath = await pack(cwd);
  } catch (err) {
    console.error('\nnpm pack failed:', err.message);
    process.exit(1);
  }
  console.log(path.relative(cwd, tarballPath));

  const entries = await enumerate(tarballPath);
  const hash = canonicalHash(entries);

  // Verify hash matches attestation
  process.stdout.write('Verifying artifact hash... ');
  if (hash !== attestation.artifact_hash) {
    console.error('\nFAIL: artifact has changed since review.');
    console.error(`  Attested: ${attestation.artifact_hash}`);
    console.error(`  Current:  ${hash}`);
    console.error('\nRun `pa review` again.');
    try { fs.unlinkSync(tarballPath); } catch {}
    process.exit(1);
  }
  console.log('ok');

  // Verify all selected files exist in current artifact
  const entryPaths = new Set(entries.map(e => e.path));
  for (const f of attestation.selected_files) {
    if (!entryPaths.has(f)) {
      console.error(`\nFAIL: attested file not found in artifact: ${f}`);
      try { fs.unlinkSync(tarballPath); } catch {}
      process.exit(1);
    }
  }

  // Repack
  const tmpPath = path.join(os.tmpdir(), `packattest-${Date.now()}.tgz`);
  process.stdout.write('Repacking constrained artifact... ');
  try {
    await repack(entries, attestation.selected_files, tmpPath);
  } catch (err) {
    console.error('\nRepack failed:', err.message);
    try { fs.unlinkSync(tarballPath); } catch {}
    process.exit(1);
  }
  console.log('ok');

  // Publish
  console.log('Publishing...\n');
  try {
    const otpFlag = otp ? ` --otp ${otp}` : '';
    execSync(`npm publish "${tmpPath}"${otpFlag}`, { stdio: 'inherit', cwd });
  } catch {
    console.error('\nPublish failed.');
    process.exit(1);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
    try { fs.unlinkSync(tarballPath); } catch {}
  }

  console.log('\nDone.');
}

module.exports = publish;
