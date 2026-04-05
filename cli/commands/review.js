'use strict';

const fs = require('fs');
const path = require('path');
const prompts = require('prompts');
const { pack, enumerate, canonicalHash } = require('../lib/artifact');
const { computeDiff } = require('../lib/diff');
const { checkPolicy } = require('../lib/policy');
const { write: writeAttestation } = require('../lib/attestation');
const { repack } = require('../lib/repack');
const { fetchPreviousArtifact } = require('../lib/registry');
const { choiceTitle, printDiffSummary } = require('../lib/ui');

async function review({ otp } = {}) {
  const cwd = process.cwd();
  const pkgJson = require(path.join(cwd, 'package.json'));

  // Collect temp files for cleanup on any exit path
  const tmpFiles = [];
  process.on('exit', () => {
    for (const p of tmpFiles) try { fs.unlinkSync(p); } catch {}
  });

  console.log('PackAttest — review\n');

  // 1. Pack
  process.stdout.write('Packing artifact... ');
  let tarballPath;
  try {
    tarballPath = await pack(cwd);
  } catch (err) {
    console.error('\nnpm pack failed:', err.message);
    process.exit(1);
  }
  tmpFiles.push(tarballPath);
  console.log(path.relative(cwd, tarballPath));

  // 2. Enumerate + hash
  const entries = await enumerate(tarballPath);
  const hash = canonicalHash(entries);

  // 3. Fetch previous artifact + diff
  process.stdout.write('Fetching previous published version... ');
  let diffEntries;
  let prev;
  try {
    prev = await fetchPreviousArtifact(pkgJson.name);
  } catch (err) {
    console.error(`\nRegistry lookup failed: ${err.message}`);
    console.error('Cannot verify diff against previous version. Aborting to avoid skipping review.');
    process.exit(1);
  }

  if (prev) {
    tmpFiles.push(prev.path);
    console.log(`v${prev.version}`);
    const prevEntries = await enumerate(prev.path);
    diffEntries = computeDiff(entries, prevEntries);
    printDiffSummary(diffEntries);
  } else {
    console.log('not found (first-publish mode)');
    diffEntries = entries.map(e => ({ ...e, status: 'added' }));
  }

  // 4. Policy checks
  const policyMap = new Map();
  for (const entry of entries) {
    const warnings = checkPolicy(entry);
    if (warnings.length) policyMap.set(entry.path, warnings);
  }

  // 5. Build multiselect choices (current-artifact files only, sorted)
  const current = diffEntries.filter(e => e.status !== 'removed');
  if (current.length === 0) {
    console.log('\nNo files in artifact.');
    process.exit(0);
  }

  const choices = current.map(entry => ({
    title: choiceTitle(entry, policyMap.get(entry.path) || []),
    value: entry.path,
  }));

  // 6. Interactive selection
  console.log('');
  const { selectedPaths } = await prompts({
    type: 'multiselect',
    name: 'selectedPaths',
    message: 'Select files to publish',
    choices,
    hint: '- Space to toggle, A to select all, Enter to confirm',
    min: 1,
    onState(state) {
      if (state.aborted) {
        console.log('\nAborted.');
        process.exit(1);
      }
    },
  });

  if (!selectedPaths || selectedPaths.length === 0) {
    console.log('No files selected. Aborting.');
    process.exit(1);
  }

  // 7. Confirmation phrase
  const n = selectedPaths.length;
  const expected = `publish ${n} file${n === 1 ? '' : 's'}`;

  console.log(`\nReady to publish ${n} file${n === 1 ? '' : 's'}:\n`);
  selectedPaths.forEach(p => console.log(`  ${p}`));
  console.log('');

  const { confirmation } = await prompts({
    type: 'text',
    name: 'confirmation',
    message: `Type "${expected}" to confirm`,
    onState(state) {
      if (state.aborted) {
        console.log('\nAborted.');
        process.exit(1);
      }
    },
  });

  if (confirmation !== expected) {
    console.log('Confirmation did not match. Aborting.');
    process.exit(1);
  }

  // 8. Write attestation
  const { path: attPath } = writeAttestation(cwd, {
    packageName: pkgJson.name,
    packageVersion: pkgJson.version,
    artifactHash: hash,
    selectedFiles: selectedPaths,
  });
  console.log(`\nAttestation written: ${path.relative(cwd, attPath)}`);

  // 9. Offer to publish now
  const { publishNow } = await prompts({
    type: 'confirm',
    name: 'publishNow',
    message: 'Publish now?',
    initial: true,
    onState(state) {
      if (state.aborted) {
        console.log('');
        process.exit(0);
      }
    },
  });

  if (!publishNow) {
    console.log('\nRun `pa publish` when ready.');
    return;
  }

  // 10. Repack + publish
  await runPublish({ entries, selectedPaths, cwd, tmpFiles, otp });
}

async function runPublish({ entries, selectedPaths, cwd, tmpFiles, otp }) {
  const os = require('os');
  const { execSync } = require('child_process');
  const tmpPath = path.join(os.tmpdir(), `packattest-${Date.now()}.tgz`);
  tmpFiles.push(tmpPath);

  process.stdout.write('\nRepacking constrained artifact... ');
  try {
    await repack(entries, selectedPaths, tmpPath);
  } catch (err) {
    console.error('\nRepack failed:', err.message);
    process.exit(1);
  }
  console.log('ok');

  console.log('Publishing...\n');
  try {
    const otpFlag = otp ? ` --otp ${otp}` : '';
    execSync(`npm publish "${tmpPath}"${otpFlag}`, { stdio: 'inherit', cwd });
  } catch {
    console.error('\nPublish failed.');
    process.exit(1);
  }

  console.log('\nDone.');
}

module.exports = review;
