# CORE-IDENTITY-O-WP-002-BUILD-006 / RECONCILIATION-007

Status: **MERGED / HOSTED-QUALIFIED PORTABLE MECHANICS / NARROW EVIDENCE-SEAM REOPENED BEFORE FINAL FREEZE**  
Owner: **SYSTEM_MASTER/CORE/Foundation & Spine/Identity, Principal & Delegation**  
Method: **RECOVER -> INVENTORY -> ANALYZE -> TARGETED RESEARCH -> ADJUDICATE -> DESIGN-LOCK -> BUILD -> ISOLATED QUALIFICATION -> CUMULATIVE REGRESSION -> FREEZE**

## 1. Exact lineage

- Tonight reconstruction/design-lock branch checkpoint before build: `second-shift/2026-09-12-forensic-restart@0c80aa27cbcc031038efc74f347257a090e7f340`.
- Exact live CORE owner head immediately before O-WP-002 mutation: `system-master/control-v2@4da156f9707c2f9aa31984d3fb958fd01e5b375b`.
- Bounded candidate branch: `foundation/identity-owp002-20260912`.
- Candidate commit: `023392cc6ed80031ed9f75f682d431d5a149bff5`.
- Candidate executable tree: `e7a828d35a569967d455416682678580cce657a6`.
- Pull request: `#64`.
- Hosted pull-request merge-ref subject: `219d480831b8c37b492768ec9caa819c3cebdf78`.
- Live merged CORE head after admission: `fd1e6191f656577f3629c691dd1f0e7e1104e7e5`.
- Live merged CORE executable tree: `e7a828d35a569967d455416682678580cce657a6`.

The hosted PR merge-ref and live merged owner head have the **same executable tree SHA**. This establishes tree-identical hosted-qualified bytes. It does **not** relabel `fd1e6191...` as separately exact-commit-SHA qualified.

## 2. Built package

O-WP-002 now has current owner-branch implementation for the bounded deterministic mechanics:

- immutable/versioned `IdentityProofingProfile` contracts;
- `IdentityProofingProfileRegistry`;
- durable `IdentityEnrollmentRecord` mechanics;
- `IdentityEnrollmentService`;
- append-only `ProofingJournalStore` with SHA-256 frame integrity, OS/JVM locking, replay, monotonic revisions and corruption/truncation fail-closed behavior;
- command fingerprint idempotency and changed-semantic-bytes conflict rejection;
- stale profile-version protection;
- principal-kind and principal-standing checks;
- REQUIRED / OPTIONAL / NOT_REQUIRED proofing policy distinctions;
- required-evidence and minimum-assurance mechanical checks;
- no raw identity-document/biometric persistence in the package contract;
- proofing/authentication separated from mutation authorization and principal lifecycle authority;
- exact O-WP-002 traceability ledger.

Exact recovered O-WP-002 requirement denominator remains 13:

`O-RQ-003, O-RQ-004, O-RQ-053, O-RQ-054, O-RQ-105, O-RQ-106, O-RQ-164, O-RQ-165, O-RQ-166, O-RQ-167, O-RQ-272, O-RQ-310, O-RQ-317`.

Current traceability reports `unaccounted_requirement_count = 0` for this bounded package.

## 3. Hosted qualification evidence

Candidate/PR qualification produced:

- O-WP-002 workflow run: `34675073619` — **SUCCESS**;
- O-WP-001 cumulative workflow run on the same PR subject: `34675073571` — **SUCCESS**;
- O-WP-002 test result: **17/17 PASS**;
- qualifier predicate: `PASS FOUNDATION_IDENTITY_OWP002_HOSTED_PORTABLE_MECHANICS`;
- cumulative predicate: `PASS FOUNDATION_SYSTEM_ROOT_PLUS_IDENTITY_OWP001_OWP002_CUMULATIVE`;
- evidence artifact ID: `10291772501`;
- evidence artifact name: `foundation-identity-owp002-evidence-34675073619`;
- evidence artifact size: `118250` bytes;
- evidence artifact ZIP digest: `sha256:15f0d474d396bd1cab8f66e3e4cfaed03540ac134f525c22b8a9289a7d2b9acd`.

A-01 control-plane enforcement also passed for the PR, but that is control-plane policy evidence only. It is **not** O-WP-002 A-01 subject qualification.

## 4. Evidence boundaries retained

The package does **not** claim:

- that a real human identity was proven;
- that any external proofing provider assertion is valid;
- that an asserted assurance value is trustworthy merely because the deterministic mechanics persist/check it;
- native/device proofing success;
- A-01 subject PASS;
- production persistence or production admission.

The live merge is therefore classified as **HOSTED-QUALIFIED PORTABLE MECHANICS**, with tree identity to the qualified PR merge-ref, not as native/A-01/production identity proof.

## 5. Forensic parallel-work collision discovered

A separate pre-existing Second Shift branch exists:

- branch: `second-shift/core-identity-owp002-20260912`;
- head: `2c9f12a4bd7d770b968a5bc32d5b57c5f8ebbcb4`;
- implementation parent: `c55676c6cee9f03c432fd0220916513d8ad80919`.

That branch is **not** the live CORE owner state and had no admitted PR at reconciliation time, but it contains a materially stronger candidate seam for external proofing evidence:

- an `EnrollmentEvidenceValidator` boundary;
- explicit provider/evidence outcome handling;
- service-derived assurance/evidence results instead of direct caller-supplied assurance as the final trusted input;
- explicit UNKNOWN / REJECTED / PASSED provider-evidence outcomes;
- bounded provider/evidence reference handling;
- additional adversarial hardening.

Under the reconstruction rule, this parallel work cannot be discarded merely because another O-WP-002 implementation reached main first. It is archaeological/current parallel evidence that must be adjudicated against the admitted package.

## 6. Reconciliation finding

The admitted O-WP-002 implementation is valid for the claims it actually makes: deterministic portable proofing/enrollment mechanics. Its traceability already refuses to claim external provider validity.

However, the parallel validator seam exposes a stronger design for preventing future callers from accidentally treating self-supplied `assertedAssurance` plus a generic evidence reference as proofing truth. Because Foundation identity is an authority boundary, that seam should be resolved before declaring O-WP-002 finally frozen.

Therefore:

- the merged portable mechanics remain preserved;
- hosted qualification evidence remains valid for the exact qualified tree;
- no rollback of the merged package is justified;
- **final O-WP-002 freeze is reopened only for the narrow external-evidence/assurance trust seam**;
- O-WP-003 must not silently bypass this adjudication if it depends on trusted proofing standing.

## 7. Exact successor

`CORE-IDENTITY-O-WP-002-EVIDENCE-SEAM-RECONCILIATION-008`

Execute only the narrow reconciliation:

1. compare the admitted `ProofingContracts` / `IdentityEnrollmentService` / `ProofingJournalStore` semantics with the parallel `EnrollmentEvidenceValidator` design;
2. define one truth owner for provider evidence outcome and asserted assurance;
3. prevent caller-supplied values from becoming trusted proofing evidence without an admitted validator/adapter result;
4. preserve REQUIRED / OPTIONAL / NOT_REQUIRED policy semantics and the no-raw-document rule;
5. retain explicit UNKNOWN as a real state;
6. add adversarial tests for forged/high assurance, stale provider result, provider/evidence mismatch, unavailable validator, replay, restart and concurrent completion;
7. rerun O-WP-002 isolated qualification plus O-WP-001 + System Root cumulative regression on the changed exact subject;
8. freeze O-WP-002 only after the seam passes, or preserve an exact blocker if a real external provider is required for a claim that cannot be proven portably.

No specialist-system semantics may enter this package. No Book, Learning, Documents or Programming ownership is transferred by this successor.
