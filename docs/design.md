# Design Overview

## Summary

PackAttest is a publish-time verification layer for package publishing.

It does not try to guess what is safe.
It exposes the final artifact, highlights differences from the previous release, requires explicit human selection, and publishes only a constrained artifact built from what was reviewed.

## Why This Exists

The main failure in current workflows is not that tools cannot list files.
It is that tools do not force intentional review of the exact final publish payload.

PackAttest addresses that by making publish-time selection the control point.

## Trust Model

PackAttest deliberately avoids trusting a single baseline file.

Instead, final decisions are based on four signals:

1. **Current artifact**  
   What exists right now.

2. **Previous published artifact**  
   What was last shipped to users.

3. **Explicit user selection**  
   What the user chooses now.

4. **Policy checks**  
   What deserves extra attention.

An attestation file records what a human reviewed and selected. It is not an authority — it is valid only when its canonical manifest hash matches the artifact being published.

## Main Components

### 1. Artifact Collector
Builds or retrieves the exact publish artifact via `npm pack --json`.

### 2. Artifact Enumerator
Lists every file in the artifact, records path, size, and content hash per entry. Derives the canonical manifest (sorted entries) and computes the canonical manifest hash.

### 3. Previous Artifact Retriever
Fetches the last published package from the npm registry (via `https`). Returns `null` only for a genuine 404 (first publish); throws on network or parse errors to prevent fail-open.

### 4. Diff Engine
Computes added, removed, modified, and unchanged files by comparing canonical manifests.

### 5. Selection Interface
Lets the user explicitly choose files. No files are pre-selected.

### 6. Policy Engine
Flags suspicious files or risky conditions (source maps, archives, oversized files, etc.).

### 7. Attestation Writer
After successful selection and confirmation, writes a `.packattest` record containing the canonical manifest hash, selected files, reviewer identity, and tool metadata.

### 8. Repacker
Constructs a constrained tarball containing only selected files. Per-file tar headers (mode, mtime, uid, gid, uname, gname) are preserved from the original artifact. The constrained tarball is verified to contain exactly the selected files before publish.

### 9. Publish Executor
Publishes only after all validations succeed, using the constrained tarball.

## Attestation File Format

```json
{
  "version": 1,
  "package_name": "packattest",
  "package_version": "0.1.0",
  "artifact_hash": "sha256:<canonical manifest hash>",
  "selected_files": ["package/dist/cli.js"],
  "reviewed_at": "2026-04-04T12:00:00Z",
  "reviewer": "git:susanapfel",
  "source_commit": "abcdef1234567890abcdef1234567890abcdef12",
  "tool_version": "0.1.0"
}
```

`artifact_hash` is the hash of the canonical manifest, not raw tarball bytes. Raw tarball bytes vary across environments (gzip metadata, entry ordering, timestamps). The canonical manifest is deterministic.

## Command Model

```text
pa review    # interactive: enumerate, diff, present, select, write attestation
pa publish   # verify current artifact against attestation, repack, publish
pa verify    # CI: same verification + repack + publish flow with step-by-step logs
```

For local use, `pa review` and `pa publish` can be a single combined session.

`pa verify` is the CI entry point. It fails if no valid attestation exists for the current artifact.

## Local Interactive Flow

```
npm pack --json
  → enumerate entries + compute canonical manifest hash
  → fetch previous published artifact (registry https)
  → compute diff
  → display file list with warnings and diff markers
  → user explicitly selects files
  → write attestation
  → user types confirmation phrase ("publish N files")
  → repack constrained tarball from selected files only
  → verify constrained tarball contains exactly selected files
  → npm publish <constrained-tarball>
  → clean up temp files
```

## CI Flow

```
npm pack --json
  → enumerate entries + compute canonical manifest hash
  → load .packattest
  → verify artifact_hash matches computed canonical hash
  → verify all selected_files exist in current artifact
  → repack constrained tarball
  → verify constrained tarball contents match selected_files
  → npm publish <constrained-tarball>
  → clean up temp files
```

If any step fails: block publish, report failure reason, exit non-zero.

## Key Design Decisions

**Why repack instead of filter-in-place?**  
`npm publish` cannot publish a subset of a tarball directly. Repacking constructs a stricter artifact, not a modified one. PackAttest is not changing the project; it is constructing a more restrictive release artifact. This gives PackAttest full control over the published payload.

**Why hash the canonical manifest, not raw tarball bytes?**  
Gzip output is not deterministic. Timestamps, entry ordering, and compression metadata can differ across environments and tools. The canonical manifest is derived from contents only and is stable.

**Why is the attestation file advisory, not authoritative?**  
A locally editable file is too weak as a trust anchor. An attacker or mistake that changes the artifact will automatically invalidate the attestation via hash mismatch. The artifact is the authority; the attestation records intent against a specific artifact state.

## Example Session

```text
Files in artifact:

[ ] package/dist/cli.js
[ ] package/dist/cli.js.map   ⚠ source map
[ ] package/dist/internal.zip ⚠ archive
[ ] package/package.json

Changes since last publish:
+ package/dist/internal.zip
~ package/dist/cli.js

Select files to publish:
> 1, 4

Publishing 2 files:
- package/dist/cli.js
- package/package.json

Type: publish 2 files

Repacking constrained artifact...
Verifying constrained artifact... ok
Publishing...
```

## Open Design Questions

- How should large file sets be grouped for usability?
- Should policy warnings be configurable per project?
- Should CI attestations support GPG signing for stronger reviewer verification?
- How should `pa review` handle a stale attestation (artifact changed since last review)?
