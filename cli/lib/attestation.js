'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ATTESTATION_FILE = '.packattest';

function gitUser() {
  try {
    return 'git:' + execSync('git config user.name', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return 'git:unknown';
  }
}

function sourceCommit() {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function write(cwd, { packageName, packageVersion, artifactHash, selectedFiles }) {
  const pkg = require('../../package.json');
  const record = {
    version: 1,
    package_name: packageName,
    package_version: packageVersion,
    artifact_hash: artifactHash,
    selected_files: selectedFiles,
    reviewed_at: new Date().toISOString(),
    reviewer: gitUser(),
    source_commit: sourceCommit(),
    tool_version: pkg.version,
  };

  const dest = path.join(cwd, ATTESTATION_FILE);
  fs.writeFileSync(dest, JSON.stringify(record, null, 2) + '\n');
  return { path: dest, record };
}

function read(cwd) {
  const src = path.join(cwd, ATTESTATION_FILE);
  if (!fs.existsSync(src)) return null;
  try {
    return JSON.parse(fs.readFileSync(src, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = { write, read, ATTESTATION_FILE };
