# SYSTEM-STATE-RECONCILER-001

Status: CANDIDATE — HOSTED PREQUALIFICATION REQUIRED
Owner: `SYSTEM_MASTER/CORE`
Serves: `SYSTEM_MASTER`, `SYSTEM_MASTER/CORE`, `SYSTEM_MASTER/LEARNING`, `SYSTEM_MASTER/BOOK`, `SYSTEM_MASTER/BOOK/PROSE`, and shared infrastructure

## Purpose

Provide one deterministic repository-native truth compiler that reads the canonical authority/topology/completion/obligation/expectation/delegation records plus observed live control heads and emits one derived current-state projection and drift report.

The reconciler does not create product authority, does not transfer qualification, does not repair code, and does not replace source evidence. It detects disagreement between durable records and observed repository state before a chat, Second Shift worker, or A-01 admission path acts.

## Inputs

Canonical repository inputs:

- `governance/CURRENT-AUTHORITY.json`
- `governance/SYSTEM-TOPOLOGY-002.json`
- `governance/COMPLETION-LEDGER-001.json`
- `governance/WORK-OBLIGATION-REGISTRY-001.json`
- `governance/EXPECTATION-REGISTRY-001.json`
- current checkpoint selected by `CURRENT-AUTHORITY`
- `governance/second-shift/SECOND-SHIFT-REGISTRY-001.json`
- owner delegation files for CORE, LEARNING, BOOK, PROSE
- optional observed live heads for `main`, CORE, LEARNING, BOOK, PROSE
- optional recent A-01 receipt summaries for failure routing

## Outputs

The reconciler emits a derived projection with:

- product/topology identity;
- observed vs sealed control heads;
- per-owner authority standing;
- open/blocked obligations by owner;
- evidence-backed completed boundaries by owner;
- active Second Shift delegations and staleness standing;
- expectation ownership standing;
- deterministic findings;
- A-01 failure-route classifications when receipt summaries are supplied.

The projection is disposable and reproducible. It is never stronger authority than its inputs.

## Required findings

At minimum the reconciler must detect:

- `AUTHORITY_DELTA` — observed live head differs from the sealed checkpoint;
- `STALE_DELEGATION` — delegation is bound to a head other than the observed live owner head;
- `UNALLOCATED` — work/expectation/delegation owner cannot resolve through canonical topology or explicitly allowed shared infrastructure;
- `DUPLICATE_ID` — duplicate completion/obligation identifiers;
- `OPEN_COMPLETION_CONFLICT` — same boundary is simultaneously represented as completed and non-closed without an explicit supersession/adjudication relationship;
- `EVIDENCE_MISMATCH` — a claimed standing cannot be reconciled to its recorded evidence identity where the required identity is present;
- `CONTROL_POINTER_MISSING` — canonical topology control path/ref is absent from required state;
- `A01_REPAIRABLE_SUBJECT` — authoritative subject failure may enter bounded closed-loop repair;
- `A01_RETRYABLE_INFRA` — infrastructure failure may receive the configured bounded same-SHA retry;
- `A01_NON_AUTOMATABLE` — human/author/private/native/external/publication/production authority route;
- `A01_ADMISSION_ONLY` — stale/window/admission outcome that is not a subject defect;
- `A01_DEPENDENCY_ONLY` — predecessor/dependency block;
- `A01_CONTROL_PLANE_OWNER_ROUTE` — control-plane owner intervention required;
- `A01_UNKNOWN` — fail-closed unclassified receipt.

## Closed-loop repair integration

The reconciler may classify an A-01 receipt by calling the repository-owned closed-loop repair classifier. It may not mutate code or issue a PASS.

Only `A01_REPAIRABLE_SUBJECT` may produce a repair-worker route. The repair coordinator then applies its own bounded-attempt, changed-SHA, deterministic-prequalification, lineage and zero-authority rules.

`STALE_DELEGATION`, admission-window outcomes, dependency blocks, human/author/private/native/external authority and control-plane failures must never be mislabeled as repairable product defects.

## Concurrency and anti-surprise rule

Only one state projection should be published for a given reconciliation generation at a time. Hosted workflow execution should use one concurrency group for state reconciliation.

A chat or worker may read the projection for speed, but must still resolve the live owner head before executing if the projection is older than the live repository state. A mismatch becomes `AUTHORITY_DELTA`, never a surprise.

## Candidate qualification

The exact candidate must prove at least:

1. consistent synthetic model -> no hard findings;
2. changed owner head -> `AUTHORITY_DELTA`;
3. stale delegation -> `STALE_DELEGATION`;
4. unknown owner -> `UNALLOCATED`;
5. duplicate IDs -> `DUPLICATE_ID`;
6. open/completed same boundary -> `OPEN_COMPLETION_CONFLICT`;
7. A-01 subject failure -> repairable route;
8. A-01 infrastructure failure -> retryable-infra route;
9. A-01 human/private/native/admission/dependency/control-plane cases route outside product repair;
10. the reconciler never emits qualification PASS, promotion, publication or production authority;
11. current repository registries parse and project deterministically;
12. the closed-loop repair engine remains a separate executor/coordinator, not part of projection authority.

Hosted PASS is prequalification only. Any A-01 qualification added later remains exact-SHA and bounded to the reconciler implementation itself.
