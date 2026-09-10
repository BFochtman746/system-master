# SYSTEM MASTER CORE / FOUNDATION & SPINE — Control Record 001

Status: **ACTIVE / PRIMARY CORE CONTROL AUTHORITY**  
Date: 2026-09-09  
Owner path: `SYSTEM_MASTER/CORE`  
Parent product: `SYSTEM_MASTER`  
Control branch: `system-master/control-v2`  
Topology authority: `governance/SYSTEM-TOPOLOGY-002.json` on canonical `main`

## Scope

CORE is the shared Foundation & Spine inside the System Master product. It owns the shared authority spine, data/platform/runtime foundations, continuity/recovery, assurance/reconciliation and shared A-01/control-plane integration.

CORE is **not** the System Master product root and does not own Learning product logic, Book product logic or Prose product logic. LEARNING and BOOK are sibling tool systems under SYSTEM MASTER; PROSE is a child of BOOK.

Historical references to `MASTER`, `MASTER SYSTEM` or `System Master foundation/spine` in this branch map to `SYSTEM_MASTER/CORE` under the current topology.

## Evidence preservation rule

Detailed dependency-spine history, candidate identities, qualification receipts, repair patches, source-custody forensics and historical blockers remain preserved in the technical records on this branch. This control record is intentionally concise so it does not duplicate large bodies of evidence and become a second stale authority source.

No evidence is deleted or transferred by this summary. Exact-subject PASS remains bound only to the exact bytes/commit that produced it.

Primary evidence records include:

- `PLATFORM005-REDERIVED-ASSEMBLY-004.md`
- `PLATFORM005-RECONCILIATION-004.md`
- `PLATFORM005_TEMPORAL_PROJECTION_CACHE_PARITY_REPAIR_001.patch`
- `PLATFORM005_FAIL_CLOSED_NAVIGATION_PARITY_REPAIR_001.patch`
- `PLATFORM005_PARSED_PATH_API_ROUTE_REPAIR_002.patch`
- `CHAT001A-CUMULATIVE-ASSEMBLY-003.md`
- `CHAT001A-RECONCILIATION-003.md`
- `OPERATOROPS001_R024_REBUILD_001.patch`
- `OPERATOROPS001-RECONCILIATION-001.md`
- `USEREXPERIENCE001_R025_DB_PARITY_REPAIR_001.patch`
- `USEREXPERIENCE001-RECONCILIATION-001.md`
- `SMR021-ADMISSION-BINDING-TOMORROW-READINESS-001.md`
- `SMR021-AUTHORIZATION-CONTEXT-BINDING-RESEARCH-DELTA-001.md`
- `SMR021-OFFLINE-ACCESSIBILITY-RESEARCH-DELTA-001.md`
- `SMR021-PERSISTENCE-CONCURRENCY-RESEARCH-DELTA-001.md`
- `SMR021-TOMORROW-READINESS-CHECKPOINT-001.md`
- `SMR020-DEPENDENCY-CURRENT-SOURCE-CUSTODY-RECOVERY-001.md`
- `SMR020-RUNNER-CUSTODY-FORENSICS-001.md`
- `SMR020-EXTERNAL-RECONSTRUCTION-OBJECT-RECOVERY-001.md`
- `CORE-AUTHORITY-DELTA-DD74915F-RECONCILIATION-001.md`
- `CORE-SOURCE-CUSTODY-DEADLOCK-REPAIR-001.md`

## Current standing

### Historical/local exact-subject evidence retained

The following subjects remain valid evidence identities for the exact bytes previously qualified locally:

- SMR018 / PLATFORM-005: `cc67826bb608fc82459e23c59d5e0106d10422c6fe79f45f0571be60356b7d54`
- SMR019 / CHAT-001A: `9571b3f4f876980047facbdd77cf17f8a8a2d3255bab9704ceb3fd49cddbd5f3`
- SMR020 / OPERATOR-OPS-001: `89066e5662554b1810691473e0ed9bf49d8cc2fd4964444043b878461ed75477`

They proved important semantics and portable qualification on those exact bytes. Their complete runnable source trees were not preserved in ordinary GitHub-native immutable custody, and exhaustive currently accessible custody searches did not recover them.

Those hashes therefore remain **historical/local evidence identities, not mandatory future product identities**.

The failed SMR021 diagnostic subject `ca2c9348040936a7b11d5367d16aed1251abc3e92dd5ec7b62326ff5c1f7aef8` remains failed evidence only and must never be promoted.

### Historical recovered source available for a fresh lineage

An independently recovered exact historical SMR018 archive/source exists with source/test subject:

`66657a53d962e045d3f24baee9da4d6a107a152a404b84e3c9973b90b22b906c`

The repository also preserves the PLATFORM-005 correction streams required to reconstruct the current intended semantics. This makes forward reconstitution executable without recovering the lost textual identity of `cc67826...`.

## Source-custody deadlock adjudication

The prior recovery path is closed as a blocking critical path.

`SMR020-EXTERNAL-RECONSTRUCTION-OBJECT-RECOVERY-001.md` established that all currently accessible GitHub, branch/ref/PR/release, ChatGPT Library delta, Google Drive, current-runner and relevant workflow-artifact surfaces are negative. Its successor required an owner-external backup not available to the workstream.

That is preserved as an optional historical custody-recovery path only. A future real backup may still be inspected, but the product must not remain indefinitely blocked on a cryptographic preimage or absent owner backup.

`CORE-SOURCE-CUSTODY-DEADLOCK-REPAIR-001.md` therefore authorizes a fresh superseding dependency train with **no inherited PASS**.

## Current Core objective

`CORE-SMR018-SUPERSEDING-LINEAGE-RECONSTITUTION-001`

Build a new dependency-valid PLATFORM-005 / SMR018 exact subject from the recovered historical SMR018 source `66657...` plus the durable repair semantics already recorded in GitHub.

The new candidate is **not required to reproduce `cc67826...` byte-for-byte**. The `37e904e4...` and `cc67826...` hashes remain historical reconstruction/evidence oracles only; open-ended hash-preimage/source guessing is prohibited.

### Phase 1 — SMR018 new exact subject

Apply and reconcile the three durable PLATFORM-005 correction streams:

1. temporal projection/cache parity;
2. fail-closed navigation/schema/browser/cache-generation parity;
3. parsed-path `/api` route rejection.

Recreate corresponding tests/verifier guards from the governing contracts. Run the full applicable SMR018 campaign. On PASS:

- compute a new exact source/test subject;
- preserve the complete runnable source in ordinary GitHub-native immutable custody;
- run hosted qualification on that exact GitHub subject when applicable;
- retain old SMR018 hashes as evidence only.

### Phase 2 — SMR019 cumulative rebuild

Rebase the preserved CHAT-001A repair onto the new exact SMR018 subject. Run the full cumulative CHAT-001A + PLATFORM-005 campaign. On PASS, compute and preserve a new exact SMR019 subject in GitHub-native custody.

### Phase 3 — SMR020 dependency-current rebuild

Reapply the preserved R024 OPERATOR-OPS repair/migration semantics onto the new exact SMR019 subject. Run the full applicable OPERATOR + predecessor campaign. On PASS, compute and preserve a new exact SMR020 subject in GitHub-native custody.

### Phase 4 — SMR021 dependency-current rebuild

Use the new exact SMR020 subject as the predecessor for `SYSTEM-MASTER-REBUILD-021 / USER-EXPERIENCE-001`.

The already-completed SMR021 readiness packet remains valid as design/research input but transfers no qualification result. Before mutation, verify the current PLATFORM-006 owner-defined descriptor action-grant contract. If that owner-defined grant is absent, stop with an explicit cross-owner PLATFORM-006 contract dependency; USER-EXPERIENCE may consume admission authority but may not invent it.

If the grant exists, apply the work/descriptor/action binding repair plus R025 database-parity transplant, then run the authorization-focused micro-gate and complete portable, persistence/concurrency, offline/accessibility, coherence/congruence, exact-subject and release-manifest qualification.

## Qualification / A-01 boundary

A-01 infrastructure is unchanged.

- No historical/local PASS transfers to a new subject.
- The exact tested Git commit SHA is the A-01 qualification subject.
- Deterministic prequalification must occur before A-01.
- A-01 is not modified merely because old local source bytes were lost.
- Hosted/A-01 promotion evidence must bind to the new exact GitHub-native subject.

## Parallel unresolved Core obligations

- `RECON-001C` remains blocked on credentialed sealed-history Git import under Assurance/Reconciliation.
- PC/target-only empirical obligations remain distinct; historical SMR020 O012/O013 remain under `PC-ENDGAME-027` until a superseding current-lineage disposition is produced.
- R025 physical device/accessibility/usability evidence remains empirical and unclaimed.
- The harmless duplicate `tmp-noop` ref recorded by external-recovery forensics is not authority and may be deleted when a supported branch-deletion path is available.

## Boundary rules

- Qualification evidence remains bound to exact tested subjects; this control record transfers no PASS.
- Local portable PASS is not hosted/A-01/production authority.
- Historical hashes are evidence labels, not required preimages for future work.
- New source/test bytes receive new identities and full qualification.
- Assurance/Reconciliation and Continuity remain Core subsystem/evidence lanes, not peer systems.
- A-01 is shared System Master infrastructure, administratively integrated through Core; it is not Core product logic and not a peer product system.
- Core may expose shared interfaces to Learning, Book and Prose, but may not select or overwrite their product critical paths.

## Second Shift

Core Second Shift delegation is owned by `governance/second-shift/CORE-DELEGATIONS.json` on canonical `main` and must be revalidated whenever this control head moves.

The new dependency-valid unattended work is the bounded SMR018 superseding-lineage reconstitution/qualification preparation. Completed custody searches, runner forensics, SMR021 research and failed hash-preimage candidate families must not be repeated.

## Exact next step

`CORE-SMR018-SUPERSEDING-LINEAGE-RECONSTITUTION-001`

Start from exact recovered historical SMR018 source subject `66657...`, apply the three preserved PLATFORM-005 correction streams, create contract-derived tests/verifiers without attempting to reproduce the lost `cc678...` bytes, run the full applicable SMR018 qualification, and preserve the passing runnable candidate in ordinary GitHub-native immutable custody under its newly computed exact subject.
