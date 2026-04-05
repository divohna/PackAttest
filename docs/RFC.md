# RFC: Secure Artifact Publishing via Interactive Selection

- **Status:** Draft
- **Version:** 0.1.0
- **Date:** 2026-04-04

## 1. Abstract

This document defines a secure publish-time verification model for package publishing systems.

The model requires users to explicitly select which files from the final build artifact may be published. It further requires review of differences between the current artifact and the previously published artifact. The objective is to eliminate accidental publication of unintended files caused by ignore-based rules, packaging drift, and insufficient artifact review.

## 2. Motivation

Current release workflows often rely on configuration such as `.gitignore`, `.npmignore`, or package inclusion fields. These mechanisms are useful for workflow hygiene, but they are not sufficient as the primary defense against artifact leaks.

Problems with existing approaches include:

1. **Negative logic**  
   They describe what to exclude, which is brittle under change.

2. **Pre-artifact timing**  
   They are typically maintained before the final artifact is generated.

3. **Implicit trust**  
   They do not force review of the exact final package contents.

4. **Configuration drift**  
   Build systems evolve, packaging rules evolve, and old assumptions silently become wrong.

5. **Single-point trust failure**  
   Static allowlists or baselines become dangerous if treated as the sole source of truth.

This RFC proposes a model that shifts trust toward actual artifact contents and explicit publish-time intent.

## 3. Goals

The system defined by this RFC MUST:

1. enumerate the exact files contained in the publishable artifact
2. require explicit user selection of files to publish
3. prohibit implicit inclusion of files
4. highlight differences from the previous published artifact
5. reduce reviewer effort by focusing attention on changed files
6. avoid dependence on pre-created allowlists as an authority
7. make publish-time intent visible and auditable
8. repack a constrained artifact containing only selected files before publishing

## 4. Non-Goals

This RFC does NOT attempt to:

1. detect all secrets or sensitive values in content
2. replace package registries
3. replace secure build pipelines
4. prevent a malicious actor from intentionally selecting dangerous files
5. define a universal policy language for all ecosystems

## 5. Terminology

### 5.1 Artifact
The final package payload intended for publication, such as the `.tgz` produced by `npm pack`.

### 5.2 File Set
The complete set of files contained in an artifact, including paths and optionally metadata such as size and hash.

### 5.3 Previous Published Artifact
The artifact corresponding to the latest already-published version available from the registry.

### 5.4 Diff
The comparison between the current artifact file set and the previous published artifact file set. A diff may identify files as:
- added
- removed
- modified
- unchanged

### 5.5 Selection
The set of files explicitly chosen by the user for inclusion in the publish operation.

### 5.6 Policy Check
A validation performed by the system to identify suspicious or prohibited conditions, such as source maps, archives, unexpected file types, or unusually large deviations.

### 5.7 Canonical Manifest
A deterministic, sorted representation of artifact contents used for stable hashing. Computed by enumerating all entries in the artifact, sorting by path, and recording path, size, and content hash for each entry. Hashing the canonical manifest rather than raw tarball bytes avoids false mismatches caused by gzip metadata, entry ordering, or timestamp differences across environments.

### 5.8 Attestation
A machine-readable record written after a successful local review session. Contains the canonical manifest hash, the selected file list, reviewer identity, and tool metadata. Used by CI to verify that a human reviewed the exact artifact being published. The attestation is a record of intent — it is only valid when its canonical manifest hash matches the canonical manifest hash of the current artifact.

### 5.9 Constrained Artifact
A new tarball constructed from only the files explicitly selected during review. The constrained artifact is derived from the reviewed artifact and contains identical package metadata. It is the artifact that is actually submitted to the registry.

## 6. Design Principles

### 6.1 Artifact Is Ground Truth
The system MUST operate on the final artifact contents rather than the source tree.

### 6.2 Explicit User Intent
The system MUST require deliberate user action to choose files for publishing.

### 6.3 No Silent Inclusion
A file MUST NOT be published unless it has been explicitly selected in the current review flow.

### 6.4 Diff-Based Attention
The system SHOULD minimize review burden by emphasizing changes relative to the previous published artifact.

### 6.5 Federated Risk
No single baseline file, local configuration file, or previously generated allowlist SHALL be treated as authoritative on its own.
Trust is distributed across:
- current artifact contents
- previous published artifact contents
- explicit current user selection
- policy validation

### 6.6 Constrained Publish
The system MUST construct a new artifact containing only selected files and publish that artifact. The system MUST NOT publish the original unpacked artifact directly if it contains unselected files.

### 6.7 Attestation Is Advisory
An attestation file is a record, not an authority. No attestation file SHALL authorize publishing on its own. Validity requires a matching canonical manifest hash against the current artifact.

## 7. System Model

The system consists of the following logical components:

1. **Artifact Collector**  
   Generates or retrieves the final publishable artifact.

2. **Artifact Enumerator**  
   Extracts the full file list and metadata from the artifact. Computes the canonical manifest and its hash.

3. **Previous Artifact Retriever**  
   Obtains the last published artifact from the registry.

4. **Diff Engine**  
   Compares current artifact with previous published artifact.

5. **Selection Interface**  
   Presents files to the user and records explicit selection.

6. **Policy Engine**  
   Evaluates suspicious conditions and enforces validation rules.

7. **Attestation Writer**  
   Records the result of a completed review session, including the canonical manifest hash and selected files.

8. **Repacker**  
   Constructs a constrained artifact containing only the selected files, with package metadata preserved.

9. **Publish Executor**  
   Performs publish only after all required validations and confirmations succeed, using the constrained artifact.

## 8. Workflow

### 8.1 Artifact Generation

The system MUST generate or obtain the exact artifact that would be published.

For npm-based implementations, this may be done using:

```bash
npm pack --json
```

The system MUST perform validation against the generated artifact rather than against the working directory alone.

### 8.2 Artifact Enumeration

The system MUST enumerate all files in the artifact.

At minimum, enumeration MUST record:
- file path
- file size

The system SHOULD also record:
- content hash
- file type classification
- warning annotations

After enumeration, the system MUST compute a canonical manifest and derive a canonical manifest hash.

### 8.3 Retrieval of Previous Published Artifact

The system SHOULD retrieve the latest previously published artifact from the package registry.

If a previous published artifact exists, the system MUST use it as one input to the review process.

If no previous published artifact exists, the system MUST enter first-publish mode.

### 8.4 Diff Computation

If a previous published artifact is available, the system MUST compute the diff between:
- the current artifact
- the previous published artifact

The diff MUST classify files as:
- added
- removed
- modified
- unchanged

A file SHOULD be considered modified if content hash changes. If hashing is unavailable, size-based or metadata-based comparison MAY be used, but hash comparison is preferred.

### 8.5 File Presentation

The system MUST present the current artifact file list to the user.

The presentation MUST:
- include every file in the current artifact
- clearly indicate which files are added or modified
- clearly indicate warnings generated by policy checks

The system SHOULD:
- group files by directory
- support paginated or grouped display for large file sets
- support convenient but explicit selection flows

### 8.6 Selection

The system MUST require explicit user selection of files to publish.

The system MUST NOT:
- pre-select all files
- auto-generate a trusted allowlist on behalf of the user
- silently reuse stale selection state when the current artifact differs

The system MAY provide convenience based on previous publish history, such as:
- highlighting files that were previously published
- allowing reuse of prior selections only after validating they still match current artifact reality
- presenting only changes for review while preserving explicit confirmation semantics

Any convenience feature MUST NOT reduce the requirement that the user explicitly confirms current publish intent.

### 8.7 Attestation

After a successful review and selection session, the system MUST write an attestation record.

The attestation MUST include:

```json
{
  "version": 1,
  "package_name": "<name>",
  "package_version": "<version>",
  "artifact_hash": "sha256:<canonical manifest hash>",
  "selected_files": ["<path>", "..."],
  "reviewed_at": "<ISO 8601 timestamp>",
  "reviewer": "git:<git user>",
  "source_commit": "<full commit SHA>",
  "tool_version": "<packattest version>"
}
```

Field notes:
- `artifact_hash` is the hash of the canonical manifest, not raw tarball bytes
- `selected_files` paths match paths as recorded in the canonical manifest
- `source_commit` links the review to repository state at review time
- `version` allows format evolution without breaking parsers

The attestation MUST be stored in a location accessible to subsequent CI steps (e.g., committed to the repository as `.packattest` or passed as a build artifact).

The attestation is not an authority. It is a record. CI MUST verify it against the current artifact, not treat it as a pre-authorization.

### 8.8 Validation

The system MUST validate that:
1. every file to be published has been explicitly selected
2. no unselected file is included in the final publish set
3. all newly added files have been surfaced to the user
4. all modified files have been surfaced to the user

The system SHOULD also perform policy checks such as:
- source map detection
- archive detection
- oversized file detection
- absolute internal path detection
- suspicious file type detection

A policy warning MAY be non-blocking or blocking depending on implementation policy, but warnings MUST be displayed to the user.

### 8.9 Confirmation

Before publish execution, the system MUST require an explicit confirmation step.

The confirmation SHOULD require more than a generic yes/no response.
For example, the user may be required to type a phrase such as:

```text
publish 3 files
```

This requirement exists to reduce confirmation fatigue and force conscious acknowledgement.

### 8.10 Repack

After confirmation and before publish, the system MUST construct a constrained artifact.

The constrained artifact:
- MUST contain only the explicitly selected files
- MUST preserve package metadata (e.g., `package/package.json`) unchanged
- MUST NOT carry a different package identity from the reviewed artifact
- SHOULD be written to a temporary path and cleaned up after publish

The repacker MUST verify, after construction, that the constrained artifact contains exactly the selected files — no more, no fewer.

### 8.11 Publish Execution

The publish operation MUST NOT proceed unless:
- artifact enumeration completed successfully
- required diff analysis completed or was explicitly unavailable
- file selection completed successfully
- attestation was written
- validation passed
- confirmation completed successfully
- constrained artifact was constructed and verified

The publish operation MUST use the constrained artifact, not the original artifact.

## 9. Selection Semantics

### 9.1 Current-Session Selection Only
Selection authority MUST come from the current publish review session.

### 9.2 No Trusted Pre-Created Allowlist
A pre-created allowlist file MUST NOT, by itself, authorize publishing.

Such a file MAY be used as a convenience hint, but not as the sole authority.

### 9.3 No Wildcard Authorization by Default
Wildcard or broad-pattern inclusion such as `dist/**` SHOULD be disallowed by default, or treated as high-risk requiring additional review.

### 9.4 Changed Artifacts Require Fresh Review
If the current artifact differs from what was previously approved, the system MUST require fresh review of the differences.

## 10. First-Publish Mode

If no previous published artifact exists, the system MUST:

1. enumerate the full artifact
2. present the full file list
3. require explicit user selection for all files to publish
4. require explicit confirmation before publish

The system SHOULD clearly indicate that this is first-publish mode and therefore requires full review.

## 11. Security Considerations

### 11.1 What This Prevents
This model significantly reduces risk from:
- accidental source map publication
- accidental publication of debug or temporary files
- accidental inclusion of archives
- packaging drift between releases
- silent expansion of publish scope

### 11.2 What This Does Not Prevent
This model does not prevent:
- intentional malicious file selection
- secrets embedded inside approved files
- compromised build systems that produce malicious but plausibly named outputs
- registry compromise
- social engineering of the reviewer

### 11.3 Confirmation Fatigue
A trivial yes/no confirmation is insufficient. Implementations SHOULD use a confirmation mechanism that forces active awareness.

### 11.4 Single Baseline Risk
A locally editable baseline file is too powerful if treated as the sole authority. Implementations MUST avoid trusting a local baseline alone and MUST prefer registry-fetched previous artifacts as historical truth.

### 11.5 Canonical Hash Stability
Implementations MUST hash the canonical manifest rather than raw tarball bytes. Raw tarball bytes may vary across environments due to gzip metadata, entry ordering, and timestamp differences, producing false hash mismatches. The canonical manifest is derived deterministically from artifact contents and is stable across environments.

### 11.6 Constrained Artifact Integrity
After repacking, the system MUST verify the constrained artifact contains exactly the selected files. The verification step prevents bugs in the repacker from silently introducing or excluding files.

## 12. Usability Requirements

The system SHOULD be designed so that safety does not create unreasonable friction.

Recommended usability features include:
- directory grouping
- diff-first display
- keyboard-friendly selection
- clear warning icons or labels
- first-publish full review, then diff-focused review later

The system MUST NOT optimize away explicit intent.

## 13. CI / Non-Interactive Mode

A non-interactive mode MAY be provided for CI environments.

In CI mode, the verification flow is:

1. Build the artifact via `npm pack`
2. Compute the canonical manifest and its hash
3. Load the attestation file (e.g., `.packattest`)
4. Verify `artifact_hash` in the attestation matches the computed canonical manifest hash
5. Verify every file in `selected_files` exists in the current artifact
6. Repack a constrained artifact containing only `selected_files`
7. Verify the constrained artifact contains exactly `selected_files`
8. Publish the constrained artifact

If any step fails, the system MUST block publish and report the failure reason.

The system MUST NOT silently default to publishing all files under any failure condition.

A CI mode SHOULD be used only when paired with a review workflow that already captured explicit human approval and wrote a valid attestation.

## 14. Reference npm Mapping

For npm ecosystems, a reference implementation MUST:

1. generate the artifact via `npm pack --json`
2. extract and enumerate all tarball entries, computing per-entry content hashes
3. construct the canonical manifest (sorted entries: path, size, content hash)
4. hash the canonical manifest to produce `artifact_hash`
5. retrieve the latest published tarball from the registry (e.g., via `pacote`)
6. compute diff between current and previous canonical manifests
7. present the file list and diff to the user
8. record the attestation after explicit selection
9. construct a constrained tarball containing only selected entries
10. verify the constrained tarball contents match `selected_files`
11. run `npm publish <constrained-tarball-path>`

Package identity (name, version, description, etc.) inside `package.json` within the constrained tarball MUST be identical to the original.

The constrained tarball MUST use a temporary filename and be cleaned up after publish completes or fails.

## 15. Command Model

A reference CLI implementation SHOULD expose the following commands:

```text
pa review    # interactive: enumerate, diff, present, select, write attestation
pa publish   # verify current artifact against attestation, repack, publish
pa verify    # CI: same verification + repack + publish flow with step-by-step logs
```

`pa review` and `pa publish` MAY be combined into a single interactive session for local use.

`pa verify` is the CI-safe entry point and MUST fail if no valid attestation exists for the current artifact.

## 16. Implementation Guidance

A reference implementation SHOULD:
- compute hashes for accurate modification detection
- use canonical manifest hashing rather than raw tarball byte hashing
- store attestation only as a record, never as the sole trust anchor
- treat prior local state as advisory
- make suspicious files visible but not silently suppress them
- log user decisions for auditability where appropriate
- clean up temporary artifacts after use

## 17. Backward Compatibility

This RFC is intended to wrap existing publishing workflows rather than replace them.
It is compatible with existing package registries and existing build systems, though practical integration depth may vary by ecosystem.

## 18. Future Work

Future enhancements may include:
- registry-side enforcement
- signed review attestations (GPG or similar)
- organization-wide policy enforcement
- IDE-assisted preview before publish
- richer anomaly scoring
- support for ecosystems beyond npm

## 19. Conclusion

This RFC specifies a publish-time security model based on five principles:

1. trust the final artifact
2. require explicit human selection
3. surface changes from prior published reality
4. avoid single-point trust in static configuration
5. publish only what was reviewed, by constructing a constrained artifact

In this model, no file is published unless it is:
- present in the actual artifact
- visible to the reviewer
- explicitly selected
- attested in a record bound to the artifact's canonical hash
- present in the constrained tarball submitted to the registry
