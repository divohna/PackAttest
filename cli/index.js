#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const pkg = require('../package.json');

program
  .name('pa')
  .description('Artifact review and attestation for package publishes')
  .version(pkg.version);

program
  .command('review')
  .description('Enumerate artifact, review diff, select files, write attestation')
  .option('--otp <code>', 'npm one-time password for 2FA')
  .action((opts) => require('./commands/review')(opts).catch(err => { console.error(err.message); process.exit(1); }));

program
  .command('publish')
  .description('Verify current artifact against attestation, repack, and publish')
  .option('--otp <code>', 'npm one-time password for 2FA')
  .action((opts) => require('./commands/publish')(opts).catch(err => { console.error(err.message); process.exit(1); }));

program
  .command('verify')
  .description('CI: same verification, repack, and publish flow with step-by-step logs')
  .option('--otp <code>', 'npm one-time password for 2FA')
  .action((opts) => require('./commands/verify')(opts).catch(err => { console.error(err.message); process.exit(1); }));

program.parse();
