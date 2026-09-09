# RECON-001B — Source Custody Reconciliation

Status: VERIFIED_DURABLE_CUSTODY / GITHUB_NATIVE_HISTORY_NOT_IMPORTED
Workstream: SYSTEM-MASTER-ASSURANCE-RECONCILIATION-001

## Decision

The current ASSURANCE-001 source-custody problem is not source loss. The exact sealed CQ-003 Step-003F source remains recoverable from durable Library custody, and a later complete-history FOUNDATION-006-G bundle contains that exact Step-003F commit as its direct parent.

The remaining defect is GitHub-native discoverability/import of the preserved historical objects. No replacement commit is allowed to impersonate the historical SHA.

## Sealed CQ-003 Step-003F authority

- Bundle: `/System Master/Architecture 1.0/Checkpoints/CQ_003_STEP_003F.gitbundle`
- Library file id observed during RECON-001B: `file_000000005f0c822f8a87c6944a65552c`
- Bundle SHA-256 from sealed manifest: `afffced3a5c1f425ed760c359398a1024e289821f7dedb24f1febd6107e6a677`
- Exact head: `75b643d740e0f6d27ecc5da603a188074455fa22`
- Parent: `cbd1574c265895c523d9a8a1006268edd7f01978`
- Bundle ref: `refs/heads/cq003-step003f`
- Bundle verification: COMPLETE HISTORY / PASS
- Fresh historical checkout: CLEAN

Step-003F remains portable-qualified historical evidence only. Its closure did not claim live PostgreSQL or A-01 exact-commit execution and does not authorize production standing.

## Later FOUNDATION-006-G custody anchor

- Bundle: `/System Master/Architecture 1.0/Checkpoints/UAF_FOUNDATION006_G.gitbundle`
- Library file id observed during RECON-001B: `file_000000001c00822f87172a3907a62303`
- Bundle SHA-256 from sealed manifest: `eabf579d2834c6f7dbee5e6bfcd93883661e9d1f6e5adab118b464b4ff47cc07`
- Exact head: `238fa67703c0818a9b84cf9d613512ddd6689d83`
- Exact parent: sealed Step-003F `75b643d740e0f6d27ecc5da603a188074455fa22`
- Bundle ref: `refs/heads/uaf-f006g-checkpoint-witness`
- Bundle verification: COMPLETE HISTORY / PASS
- Standing: PORTABLE PROVEN / VERSION SEALED

Direct bundle inspection during RECON-001B established that the G head descends immediately from the exact Step-003F commit and therefore preserves the CQ source lineage rather than reconstructing it from prose.

## Assurance source comparison

Step-003F and FOUNDATION-006-G each contain:

- 26 `src/main/java/org/systemmaster/assurance/**` production source files
- 12 `src/test/java/org/systemmaster/assurance/**` test source files

The Step-003F -> G delta does not replace the Assurance production implementation. The Assurance-specific change is the canonical qualification-DAG test expectation plus qualification/control metadata needed to repair an inherited three-way DAG parity defect.

G found that Step-003F had:

- JSON canonical census: 588
- TSV DAG rows: 587
- Java authority expectation: 584

G repaired only the missing Step-003F TSV row and the stale Java expectation so the canonical authority agrees at 588.

## Current GitHub state

GitHub's ordinary repository commit API does not currently resolve historical Step-003F SHA `75b643d740e0f6d27ecc5da603a188074455fa22` or FOUNDATION-006-G SHA `238fa67703c0818a9b84cf9d613512ddd6689d83` as repository-native commits.

Existing GitHub CQ recovery/A-01 branches contain manifests and recovery infrastructure, not the full sealed CQ source tree. No GitHub branch named for CQ-003J through CQ-003N was found during this reconciliation.

## Recovery law

1. Preserve the exact historical bundle objects and hashes.
2. Do not manufacture a new commit and label it equivalent to either historical SHA.
3. Do not reset, rebase or force-rewrite existing repository history.
4. If exact bundle objects are later imported to GitHub, preserve them under explicit historical/recovery refs and verify both exact SHA and ancestry before treating GitHub custody as reconciled.
5. Until that import occurs, durable Library bundle custody is accepted as historical source authority but GitHub-native lineage standing remains `NOT_IMPORTED`.
6. No production, target-native or current-subject PASS is inferred from this custody reconciliation.

## Standing update

- SOURCE_BYTES_LOST: NO
- SEALED_SOURCE_RECOVERABLE: YES
- COMPLETE_HISTORY_AVAILABLE: YES
- LATER_DESCENDANT_COMPLETE_HISTORY_AVAILABLE: YES
- GITHUB_NATIVE_HISTORICAL_OBJECTS_AVAILABLE: NO
- HISTORICAL_PORTABLE_QUALIFICATION: PRESERVED
- CURRENT_TARGET_NATIVE_QUALIFICATION: NOT_ESTABLISHED
- PRODUCTION_AUTHORIZED: NO

## Next use

Use the FOUNDATION-006-G bundle as the byte-authoritative predecessor for the earliest unresolved upstream Foundation packet, `UAF-S1-FOUNDATION006-H-TRUSTED-AUDIT-HEAD-REBUILD-001`, unless a newer exact sealed descendant is independently located and verified first.
