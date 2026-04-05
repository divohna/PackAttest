'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const { read: readAttestation } = require('../lib/attestation');
const { pack, enumerate, canonicalHash } = require('../lib/artifact');
const { repack } = require('../lib/repack');

async function verify({ otp } = {}) {
  const cwd = process.cwd();

  console.log('PackAttest — verify (CI mode)\n');

  const attestation = readAttestation(cwd);
  if (!attestation) {
    console.error('FAIL: no .packattest attestation found.');
    process.exit(1);
  }

  console.log(`Package:        ${attestation.package_name}@${attestation.package_version}`);
  console.log(`Attested by:    ${attestation.reviewer}`);
  console.log(`Attested at:    ${attestation.reviewed_at}`);
  console.log(`Source commit:  ${attestation.source_commit}`);
  console.log(`Files selected: ${attestation.selected_files.length}\n`);

  // Step 1: Pack + enumerate
  process.stdout.write('[1/5] Packing artifact... ');
  let tarballPath;
  try {
    tarballPath = await pack(cwd);
  } catch (err) {
    console.error('\nFAIL: npm pack failed:', err.message);
    process.exit(1);
  }
  console.log('ok');

  const entries = await enumerate(tarballPath);
  const hash = canonicalHash(entries);

  // Step 2: Verify canonical hash
  process.stdout.write('[2/5] Verifying artifact hash... ');
  if (hash !== attestation.artifact_hash) {
    console.error('\nFAIL: artifact has changed since review.');
    console.error(`  Attested: ${attestation.artifact_hash}`);
    console.error(`  Current:  ${hash}`);
    try { fs.unlinkSync(tarballPath); } catch {}
    process.exit(1);
  }
  console.log('ok');

  // Step 3: Verify selected files exist in artifact
  process.stdout.write('[3/5] Verifying selected files exist... ');
  const entryPaths = new Set(entries.map(e => e.path));
  for (const f of attestation.selected_files) {
    if (!entryPaths.has(f)) {
      console.error(`\nFAIL: attested file missing from artifact: ${f}`);
      try { fs.unlinkSync(tarballPath); } catch {}
      process.exit(1);
    }
  }
  console.log('ok');

  // Step 4: Repack constrained artifact
  const tmpPath = path.join(os.tmpdir(), `packattest-ci-${Date.now()}.tgz`);
  process.stdout.write('[4/5] Repacking constrained artifact... ');
  try {
    await repack(entries, attestation.selected_files, tmpPath);
  } catch (err) {
    console.error('\nFAIL: repack failed:', err.message);
    try { fs.unlinkSync(tarballPath); } catch {}
    process.exit(1);
  }
  console.log('ok');

  // Step 5: Publish
  process.stdout.write('[5/5] Publishing... ');
  try {
    const otpFlag = otp ? ` --otp ${otp}` : '';
    execSync(`npm publish "${tmpPath}"${otpFlag}`, { stdio: 'inherit', cwd });
  } catch {
    console.error('\nFAIL: publish failed.');
    process.exit(1);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
    try { fs.unlinkSync(tarballPath); } catch {}
  }
  console.log('\nDone.');
}

module.exports = verify;
