# PackAttest

> No file is published unless it is seen, selected, and confirmed.

Review the exact npm package artifact before publish.
PackAttest shows the final tarball, highlights what changed since the previous release, and publishes only the files you explicitly approve.

## Quick Start

```bash
npm install -g packattest
cd /path/to/your-package
pa review
```

Typical flow:

- run `pa review` before releasing
- inspect the exact packaged files and warnings
- select only the files you want shipped
- commit the resulting `.packattest` file for CI
- run `pa publish` locally or `pa verify` in CI

## Demo

Example review session:

```text
PackAttest — review

Packing artifact... your-package-1.4.0.tgz
Fetching previous published version... v1.3.9

Diff vs previous: 2 added, 1 modified, 8 unchanged

? Select files to publish  (Space to toggle, A to select all, Enter to confirm)
❯ ◯ + package/dist/index.js            (18.4KB)
  ◯ + package/dist/index.js.map        (41.2KB)  [source map]
  ◯ + package/.env.production          (0.6KB)   [env file]
  ◯ ~ package/package.json             (0.8KB)
  ◯   package/README.md                (5.6KB)

? Type "publish 3 files" to confirm › publish 3 files

Attestation written: .packattest
? Publish now? › Yes

Repacking constrained artifact... ok
Publishing...
Done.
```

The point is not to guess what is safe. The point is to force review of the actual package payload before it leaves your machine.

## Problem

Modern package publishing workflows rely on ignore files and implicit inclusion rules.
That is fragile for three reasons:

1. ignore rules are easy to forget or misconfigure
2. they are defined before the final build artifact exists
3. they do not force review of what will actually be published

As a result, accidental leaks often happen at the artifact stage rather than the source stage.

## Solution

PackAttest is a publish-time verification layer for package release workflows.

Before a package is published, PackAttest:

- enumerates the exact files in the final artifact
- shows the full file list to the user
- requires explicit user selection of files to publish
- compares the current artifact against the previous published version
- blocks publish if changes have not been reviewed

## Core Principles

1. **Artifact is truth**  
   Decisions are based on the final package contents, not source-tree assumptions.

2. **No implicit inclusion**  
   Nothing is published merely because it exists in a folder or matched an old rule.

3. **Explicit human intent**  
   The user must actively choose what to publish.

4. **Diff-based review**  
   Review effort should focus on what changed since the previous published version.

5. **Federated trust**  
   No single baseline file is trusted on its own. Decisions combine:
   - previous published artifact
   - current artifact
   - explicit user selection
   - policy checks

## Installation

```bash
npm install -g packattest
```

Or install from source:

```bash
git clone https://github.com/Divohna/PackAttest.git
cd <repo-dir>
npm install
npm install -g .
```

## Commands

| Command | Description |
|---|---|
| `pa review` | Enumerate artifact, diff against previous release, interactively select files, write attestation |
| `pa publish` | Verify the current artifact against an existing `.packattest`, repack the selected files, and publish |
| `pa verify` | CI mode: run the same verification, repack, and publish flow with step-by-step log output |

## How It Works

Run `pa review` from your package directory to inspect the exact artifact that `npm pack` would publish.

The `.packattest` file records the exact artifact hash, selected files, reviewer identity, and source commit. Commit it to your repository for CI use.

### CI mode

Add to your release workflow:

```bash
pa verify
```

`pa verify` re-packs the artifact, checks its hash against the `.packattest` attestation, repacks the constrained artifact, and publishes. It fails hard if the artifact has changed since the last `pa review`.

`pa publish` performs the same guarded publish flow locally, but with simpler interactive-oriented output.

## Why This Model Is Different

Traditional systems trust configuration.
PackAttest trusts reality and requires the user to confirm intent.

That means:

- the system may enumerate files automatically
- the system must not silently choose files on the user's behalf
- the system must not pre-select files by default
- the system must block unreviewed additions

## Security Properties

PackAttest is designed to prevent:

- accidental inclusion of source maps
- accidental inclusion of archives or debug files
- drift in build outputs
- silent scope expansion between releases

PackAttest does not claim to prevent:

- deliberate malicious publishing
- secrets embedded inside an explicitly approved file
- compromise of the developer workstation

## MVP Scope

Version 0.1.0 is a proof of concept focused on:

- `npm pack` integration
- file enumeration
- diff against previous published package
- interactive file selection
- publish confirmation
- blocking unselected files

## Repository Layout

```text
packattest/
├── README.md
├── LICENSE
├── package.json
├── .packattest           ← written by pa review, commit for CI use
├── docs/
│   ├── RFC.md
│   └── design.md
├── test/
│   ├── helpers.js
│   ├── artifact.test.js
│   ├── attestation.test.js
│   ├── diff.test.js
│   ├── policy.test.js
│   ├── repack.test.js
│   └── ui.test.js
└── cli/
    ├── index.js
    ├── commands/
    │   ├── review.js
    │   ├── publish.js
    │   └── verify.js
    └── lib/
        ├── artifact.js
        ├── attestation.js
        ├── diff.js
        ├── policy.js
        ├── registry.js
        ├── repack.js
        └── ui.js
```

## Status

The CLI is fully implemented. All three commands (`pa review`, `pa publish`, `pa verify`) are functional.

Current version: **v0.1.0**

## Contributing

Feedback, critiques, design objections, and implementation help are welcome.

### Development setup

```bash
git clone https://github.com/Divohna/PackAttest.git
cd <repo-dir>
npm install
```

Run tests:

```bash
npm test
```

Run the CLI locally without installing globally:

```bash
node cli/index.js review
node cli/index.js publish
node cli/index.js verify
```

After making changes, regenerate the `.packattest` attestation by running `pa review` (or `node cli/index.js review`) from the repo root and committing the updated file.

## License

MIT
