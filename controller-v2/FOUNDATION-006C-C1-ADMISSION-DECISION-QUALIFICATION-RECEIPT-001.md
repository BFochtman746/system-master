# CONTROLLER-FOUNDATION-006C-C1 — Admission Decision Qualification Receipt 001

Status: **FROZEN / HOSTED-PORTABLE QUALIFIED**
Stage: `CONTROLLER-FOUNDATION-006`
Lineage: frozen C1 `a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d` -> qualified C1-derived 002D `2ad38d6c431e76748dc21db2b1d23b0851cc1f83` -> frozen 003/004/005 -> Foundation-006 current line
Tested exact executable subject: `307edd3aa9b0e836648070421024632ea61c1988`
Qualified workflow: `Controller v2 Foundation` run `34683275010` / run number `253`
Production Controller activation: `BLOCKED_EXTERNAL_SETUP`

## 1. Evidence identity

This receipt records observational qualification of the exact executable subject above. This receipt commit is later evidence metadata and is **not** itself the tested executable subject. PASS standing does not transfer to changed executable bytes without fresh exact-subject qualification.

The tested subject is a direct descendant of the frozen C1-derived Controller foundation lineage. The pre-C1 historical `controller-v2/foundation-002d@9436cf761888542c0a801089615271a9fff4ab66` remains archaeology/provisional-design evidence only and is not an authority parent.

The frozen predecessor command-ingress authority remains C1-derived Foundation-002D. Foundation-006 does not replace immutable command acceptance, protected-Git/offline rediscovery, local IPC transport, durable journal, lifecycle ownership, or external-effect authority.

## 2. Hosted exact-subject cumulative matrix

Workflow run `34683275010` checked out exact SHA `307edd3aa9b0e836648070421024632ea61c1988` and completed successfully on all required jobs:

| Environment | Runtime | Result |
| --- | --- | --- |
| `ubuntu-latest` | Node 22 | **PASS** |
| `ubuntu-latest` | Node 24 | **PASS** |
| `windows-latest` | Node 22 | **PASS** |
| `windows-latest` | Node 24 | **PASS** |

The observed Ubuntu Node 22 cumulative run reported:

- tests: **385**
- pass: **385**
- fail: **0**
- skipped: **0**
- cancelled: **0**

The run includes all frozen Foundation-006 isolated cases `F006-A001` through `F006-A056`, the explicit design-lock regression `non-UUID decision IDs require explicit adapter acceptance`, and the inherited Controller foundation regression suite.

## 3. Foundation-006 isolated denominator closure

The frozen 56-case denominator is represented and passed within the cumulative run:

- exact request and durable transaction/command/fingerprint/repository/subject/policy-version binding;
- deterministic authorization-request digest;
- no specialist payload reinterpretation;
- ALLOW/DENY/DEFER validation with unknown fields/outcomes fail-closed;
- immutable policy revision/digest/input identity;
- approval/evidence failure normalization to DEFER rather than ALLOW;
- opaque evidence references and private/auth-secret non-persistence;
- bounded reason codes without raw fault leakage;
- one terminal admission decision per transaction;
- atomic `OPEN -> ADMITTED` and `OPEN -> REJECTED` commits;
- immutable normalized completion contract on ALLOW;
- semantic decision replay idempotency and conflict rejection;
- current-state/expiry/evidence-standing revalidation before commit;
- policy/evidence adapters outside the SQLite mutation transaction;
- restart rediscovery of undecided OPEN work;
- stable already-terminal reconciliation;
- lost-response reconciliation without second semantic transition;
- transient policy failure returns classified deferral without hidden semantic retry;
- local ingress, protected-Git durable ingress and worker ports expose no direct admission authority;
- admission code contains no scheduler, worker, provider, qualification or promotion execution path.

The added contract-regression case closes the final observed defect from the preceding subject: a non-UUID `decision_id` is no longer accepted merely because it is bounded text. UUIDv7 is directly accepted; any alternate immutable decision identity requires explicit adapter/profile acceptance. Arbitrary mutable tokens fail closed.

## 4. Migration and restart evidence

The cumulative run exercises schema-v5 storage and restart paths, including:

- fresh store reaches schema v5;
- v3-shaped stores upgrade through v4 effect authority into v5 admission authority;
- real v1 rows migrate through v2/v3/v4/v5 while preserving subject identity;
- schema-v4 store migrates once to v5, preserves rows and reopens at v5;
- failed earlier migration paths roll back instead of partially advancing version state;
- file-backed restart preserves current schema standing.

Foundation-006 therefore has hosted-portable evidence for the bounded schema-v5 admission-decision implementation. This is not target-native sudden-power-loss qualification.

## 5. Reconciliation and retry law preserved

The qualified implementation preserves the frozen reconciliation contract:

1. re-read durable current state on every pass;
2. return stable terminal standing without reevaluation when already decided;
3. construct canonical authorization input from durable truth, not mutable wakeup/chat/webhook metadata;
4. evaluate policy outside the SQLite mutation transaction;
5. normalize unsafe, incomplete or indeterminate policy results to DEFER;
6. validate owner-supplied evidence standing outside the mutation transaction;
7. re-read current state before the atomic terminal commit;
8. if state became stale, commit nothing and start a later fresh reconciliation pass;
9. exact semantic replay returns the durable existing result rather than reapplying transition/effect.

Foundation-006 contains no hidden policy retry loop. Retry ownership remains outside the admission decision method and is limited to classified transient policy/evidence-read failures with finite bounded backoff and jitter using the same durable transaction identity. Permanent denial, malformed authority, decision conflict, policy-version/revision mismatch, invalid digest/signature, revoked evidence and semantic conflict are not transient retries. Stacked retry layers remain forbidden.

## 6. Authority separation preserved

The qualified surface preserves strict separation between:

- **transport authorization/provenance** — proves only the transport credential/source standing defined by its adapter;
- **durable command acceptance** — immutable/create-once semantic ingress owned by frozen 002B/002D;
- **semantic admission authorization** — Foundation-006 decision authority;
- **execution** — later scheduler/worker/execution layers, which are not implemented or authorized by this freeze;
- **external effect authority** — frozen Foundation-003 bounded effect preparation/observation semantics;
- **specialist semantics** — remain owned by CORE, LEARNING, BOOK and DOCUMENTS and are not interpreted here.

A transport-authenticated chat, webhook, local-IPC client or protected-Git wakeup cannot directly cause admission. Wakeups remain hints; semantic truth is rediscovered from durable state.

## 7. Owner-control boundary scan

Comparison from the Foundation-005 exact executable subject `97f4d1d5d7e8e56578ef17b37b411009a8a56794` through the tested Foundation-006 subject shows changed files only under `controller-v2/`.

No CORE, LEARNING, BOOK or DOCUMENTS owner-control path is changed by the Foundation-006 implementation lineage covered by this receipt.

## 8. Blocker/evidence classes carried forward

The following are **not** synthesized or promoted to PASS:

- production Controller activation: **`BLOCKED_EXTERNAL_SETUP`**;
- real human identity or real human approval;
- real delegation validity or revocation standing;
- production policy correctness, policy-store availability or production policy revision custody;
- production secret/private-evidence custody;
- real external-provider/GitHub mutation authority;
- Windows production named-pipe/service-account hardening beyond hosted portable tests;
- hostile same-user/in-process/direct-SQLite isolation;
- network-filesystem/multi-host SQLite semantics;
- target-native sudden-power-loss durability;
- native iPhone/device qualification;
- A-01 execution.

These remain explicit evidence/environment blockers, not missing portable Foundation-006 behavior.

## 9. Freeze decision

- RECOVER: **PASS**
- INVENTORY: **PASS**
- ANALYZE: **PASS**
- TARGETED RESEARCH: **PASS**
- ADJUDICATE: **PASS**
- DESIGN-LOCK: **PASS**
- BUILD: **PASS**
- ISOLATED QUALIFICATION: **PASS — 56/56 represented on exact subject**
- CUMULATIVE REGRESSION/CALIBRATION: **PASS — 385/385 Ubuntu Node 22; required hosted matrix all successful**
- FREEZE: **PASS — HOSTED PORTABLE**
- PRODUCTION ACTIVATION: **`BLOCKED_EXTERNAL_SETUP`**

`CONTROLLER-FOUNDATION-006 — Durable Semantic Admission Decision` is therefore **FROZEN_HOSTED_PORTABLE** on exact executable subject `307edd3aa9b0e836648070421024632ea61c1988`.

## 10. Dependency-valid continuation

Do **not** descend into scheduler/worker/execution layers merely because Foundation-006 is frozen.

The next operation must first recover the remaining Controller-foundation obligations and historical successor evidence from the current C1-derived lineage, then select the first evidence-supported dependency-valid Foundation successor. No `FOUNDATION-007` implementation authority is invented by this receipt.

Exact next operation:

`CONTROLLER-FOUNDATION-NEXT-C1-RECOVER-INVENTORY-001 — CURRENT LINEAGE RE-READ -> REMAINING FOUNDATION OBLIGATION/BRANCH ARCHAEOLOGY -> REQUIREMENT/INVARIANT CENSUS -> DEPENDENCY ADJUDICATION -> BIND AT MOST ONE EVIDENCE-SUPPORTED FOUNDATION SUCCESSOR`

The recovery must preserve lossless traceability from requirement/invariant -> implementation/durable state -> interface/contract -> tests -> evidence -> environment -> blocker before any further build.