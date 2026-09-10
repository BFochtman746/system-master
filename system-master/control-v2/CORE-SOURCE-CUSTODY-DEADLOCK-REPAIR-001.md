# CORE Source-Custody Deadlock Repair 001

Date: 2026-09-09
Owner: `SYSTEM_MASTER/CORE`
Status: **CONTROL-PATH REPAIRED / LOST-HASH RECOVERY DEMOTED / FORWARD RECONSTITUTION AUTHORIZED**

## Problem

The prior immediate successor `CORE-SMR020-OWNER-EXTERNAL-BACKUP-INGEST-001` is not an executable Core work item unless an independently supplied owner-external backup actually exists.

The bounded recovery record `SMR020-EXTERNAL-RECONSTRUCTION-OBJECT-RECOVERY-001.md` closes all custody surfaces currently accessible to this workstream: current GitHub/branch/ref/PR/release surfaces, ChatGPT Library delta, Google Drive, current self-hosted runner surfaces, and relevant workflow-artifact history. It therefore leaves progress contingent on an object outside current workstream access.

That condition is a legitimate evidence fact, but it is not a valid indefinite product critical path. Preserving historical exact-subject evidence must not be converted into an obligation to recover cryptographically identical lost source/test bytes when the repository already contains sufficient semantic repair inputs to build and fully requalify a new subject.

## Governing precedent

`PLATFORM005-REDERIVED-ASSEMBLY-004.md` already established the controlling rule for this exact class of problem:

- an unavailable prior exact composite need not be recovered;
- preserved exact local/historical source plus durable correction streams may be assembled into a **new exact superseding subject**;
- historical/intermediate PASS does not transfer;
- the new subject must receive fresh qualification on its own exact bytes.

The same dependency law is already used downstream:

- `CHAT001A-CUMULATIVE-ASSEMBLY-003.md` rebases CHAT-001A onto the exact dependency-valid SMR018 state and treats identities as non-transferable evidence classes;
- `OPERATOROPS001-RECONCILIATION-001.md` derives SMR020 from the dependency-current SMR019 state and freshly qualifies the resulting exact subject.

A-01 likewise binds qualification to the exact tested commit SHA and forbids PASS transfer between SHAs. Nothing in the A-01 contract requires preservation of the historical `cc67826...`, `9571b3...`, or `89066e56...` hashes as future product identities.

## Repair decision

The following hashes remain preserved evidence identities, but are no longer mandatory future product-lineage identities:

- SMR018 local re-derived evidence subject: `cc67826bb608fc82459e23c59d5e0106d10422c6fe79f45f0571be60356b7d54`;
- SMR019 local cumulative evidence subject: `9571b3f4f876980047facbdd77cf17f8a8a2d3255bab9704ceb3fd49cddbd5f3`;
- SMR020 local dependency-current evidence subject: `89066e5662554b1810691473e0ed9bf49d8cc2fd4964444043b878461ed75477`.

They remain useful to prove what was previously tested and to detect accidental regression. They do not block a fresh superseding dependency train.

The exact PLATFORM-005 component/final oracles `37e904e4...` and `cc67826...` remain historical reconstruction oracles only. They MUST NOT be used as hash-preimage targets for open-ended source guessing.

## New critical path

The active Core recovery strategy is now **forward reconstitution**, not lost-byte recovery.

### Phase 1 — SMR018 superseding reconstitution

Start from the independently recovered exact historical SMR018 archive/source subject:

`66657a53d962e045d3f24baee9da4d6a107a152a404b84e3c9973b90b22b906c`

Apply the durable PLATFORM-005 semantic correction streams recorded in GitHub:

1. `PLATFORM005_TEMPORAL_PROJECTION_CACHE_PARITY_REPAIR_001.patch`;
2. `PLATFORM005_FAIL_CLOSED_NAVIGATION_PARITY_REPAIR_001.patch`;
3. `PLATFORM005_PARSED_PATH_API_ROUTE_REPAIR_002.patch`.

Recreate corresponding source/test/verifier guards from the governing contracts. Exact textual identity with the lost `cc67826...` bytes is neither required nor claimed.

Run the full applicable SMR018 qualification campaign. If PASS, assign a **new exact SMR018 source/test subject** and preserve its complete runnable source in ordinary GitHub-native immutable custody.

### Phase 2 — SMR019 cumulative rebuild

Rebase the preserved CHAT-001A semantic repair onto the new exact SMR018 subject. Run all applicable CHAT-001A + PLATFORM-005 cumulative qualification. Assign a new exact SMR019 subject and preserve its complete runnable source in GitHub-native immutable custody.

### Phase 3 — SMR020 dependency-current rebuild

Reapply the preserved R024 OPERATOR-OPS migration/semantic repair onto the new exact SMR019 subject. Run the full applicable OPERATOR + predecessor qualification. Assign a new exact SMR020 subject and preserve its runnable source in GitHub-native immutable custody.

### Phase 4 — SMR021 resume

Use the new exact SMR020 subject as the dependency-current predecessor for `SYSTEM-MASTER-REBUILD-021 / USER-EXPERIENCE-001`.

Resume the already-sealed SMR021 readiness packet:

- verify the current PLATFORM-006 owner-defined descriptor action-grant contract before mutation;
- apply minimum work/descriptor/action binding plus R025 database-parity transplant;
- run the minimum authorization-focused micro-gate plus full portable, persistence/concurrency, offline/accessibility, coherence/congruence, exact-subject and manifest qualification;
- create a new exact SMR021 subject;
- only then request hosted/A-01 evidence on the exact GitHub-native subject under normal control-plane rules.

## Evidence law

1. No PASS transfers from `66657...`, `cc678...`, `9571...`, `89066...`, or any historical carrier to any new subject.
2. Historical hashes remain immutable evidence labels and must not be relabeled as the new product identities.
3. Every new phase must independently compute and record its own exact source/test subject.
4. Semantic equivalence is not promotion authority; the new subject must pass the applicable executable, contract, recurrence, persistence, coherence/congruence, exact-subject and manifest gates.
5. GitHub-native immutable custody is established for the new runnable lineage as part of the rebuild, not deferred until after another local-only train is complete.
6. A-01 remains unchanged infrastructure. It qualifies the new exact commit subject after deterministic prequalification; it is not modified to rescue lost historical bytes.
7. If a future owner backup unexpectedly recovers the old exact bytes, preserve it as historical custody evidence. Do not roll the active lineage backward merely to recover an old hash.

## Why this fixes the deadlock

The prior path had a future trigger outside current workstream control and therefore could remain blocked forever despite having enough semantic/source evidence to rebuild safely.

The repaired path has an executable first action using source already recovered and repair streams already in repository custody. It preserves evidentiary honesty while restoring forward progress.

## Superseded immediate successor

`CORE-SMR020-OWNER-EXTERNAL-BACKUP-INGEST-001` is demoted from critical path to an **optional historical custody-recovery side path**. It may run only when a real owner-external candidate is supplied; its absence no longer blocks product reconstruction.

## Exact successor

`CORE-SMR018-SUPERSEDING-LINEAGE-RECONSTITUTION-001`

First action: reconstruct a new PLATFORM-005/SMR018 runnable candidate from exact historical subject `66657...` plus the three durable repair streams, generate contract-derived guards without attempting textual/hash preimage recovery of `cc678...`, run the full applicable SMR018 qualification, and preserve the passing candidate in ordinary GitHub-native immutable custody under its newly computed exact subject.
