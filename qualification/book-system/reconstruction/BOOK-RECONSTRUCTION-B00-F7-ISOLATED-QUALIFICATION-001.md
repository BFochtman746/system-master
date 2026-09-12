# BOOK-RECONSTRUCTION-B00-F7 — ISOLATED QUALIFICATION 001

Status: **F7 PASS / F8 ADMITTED / AUTHOR DECISION SPECIALIST REBOUND / B00 NOT CLOSED / NO HUMAN-EVIDENCE SYNTHESIS / NO PASS TRANSFER**

Owner: **SYSTEM_MASTER/BOOK**

Controlling method: `BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001`

Design lock: `BOOK-RECONSTRUCTION-B00-E1-FORMAL-DESIGN-LOCK-001.md`

F6B predecessor evidence: `BOOK-RECONSTRUCTION-B00-F6B-ISOLATED-QUALIFICATION-001.md`

Qualified implementation lineage: `book-system/reconstruction-b00-f7-author-decision-rebind`

Exact qualified subject: `d87686c4dcf32934daee15ec2c6e046d855808a0`

Hosted workflow run: **34680625299**

Observed Book control immediately before this evidence write: `book-system/control-v1@b43b476f96f1166c9f7cddf54d74f2b029934cb7`.

Reconstructed parent lineage was fast-forwarded after qualification to exact subject `d87686c4dcf32934daee15ec2c6e046d855808a0`.

## 1. Recovered defect and reuse decision

The recovered author-decision runtime remains valuable specialist substrate and was not rewritten wholesale. Its queue states, immutable request snapshots, option-set digesting, current-subject guard, confirmation policies, applicability guard, stale-parent checks and historical adversarial qualification are preserved and rerun.

A reconstruction-critical authority seam was confirmed in the recovered v1 `resolveDecision` path: the queue runtime directly cloned and mutated canonical parent state, appended `author_decisions`, incremented parent state version and then handed the already-mutated parent to version/rollback authority. That behavior is incompatible with the frozen B00 parent-writer law and Q061.

F7 therefore rebinds only the final resolution/commit boundary. Queue workflow truth remains specialist truth; canonical Book truth changes only through the typed parent effect `REGISTER_FINAL_AUTHOR_DECISION` and one transactional parent/specialist commit.

## 2. New reusable surfaces

Exact subject `d87686c4dcf32934daee15ec2c6e046d855808a0` adds:

- `system-master/book-system/author-decision-v2-rebind.js`;
- `system-master/book-system/author-decision-v2-sqlite-store.js`;
- `.github/scripts/book-reconstruction-b00-f7-author-decision-rebind-001-qualify.js`;
- `.github/workflows/book-reconstruction-b00-f7-qualify.yml`.

The rebind requires exact canonical-parent identity, exact specialist identity, a current resolvable decision request, current subject identities, an explicit author actor evidence reference, an explicit author-authority proof reference, exactly one author choice, and any required confirmation evidence before it can produce a prepared parent effect.

Preparation does not mutate parent or specialist input bytes. The SQLite commit path writes the canonical parent successor, author-decision specialist successor and both immutable receipts under one `BEGIN IMMEDIATE` transaction with compare-and-swap identities. Response-loss reconciliation and replay use durable receipts rather than assuming read-after-write response delivery.

## 3. Privacy and author-authority fences

F7 does not assert that a fixture author actor or proof reference represents a real human. It proves only machine-side fail-closed contracts.

Missing author actor/proof references or missing explicit choice fail before a parent effect is admitted. Confirmation-required choices fail without exact confirmation evidence. Custom author wording is represented in canonical parent history only by a content digest identity; raw custom wording is not copied into canonical parent history by F7.

No author consent, authorship, legal authority, private-source permission or publication authority is synthesized by this qualification.

## 4. Exact hosted qualification

Run `34680625299` completed **SUCCESS** on exact subject `d87686c4dcf32934daee15ec2c6e046d855808a0`.

Both hosted jobs passed:

- Node 22 — **PASS**;
- Node 24 — **PASS**.

On both runtimes the exact subject passed:

- Q001-Q036 canonical-parent pure-core predecessor baseline;
- Q037-Q050 durable parent-store predecessor baseline;
- Q051-Q058 version/admission predecessor baseline;
- Q067-Q076 rights/custody predecessor denominator;
- Q077-Q084 governing-style predecessor denominator;
- F6A lossless lifecycle graph matrix;
- recovered lifecycle predecessor harness;
- Q059-Q060 F6B lifecycle prepare/commit/reconcile rebind;
- recovered 48-case author-decision queue predecessor harness;
- recovered author-decision current-subject guard;
- recovered content-admission author-decision applicability guard;
- Q061-Q062 F7 author-decision prepare/commit/reconcile rebind and additional rollback/recovery/adversarial cases.

Fresh exact-subject evidence was used. No historical PASS was transferred.

## 5. Durable hosted artifacts

Node 22:

- artifact id `10293413982`;
- name `book-reconstruction-b00-f7-node-22-d87686c4dcf32934daee15ec2c6e046d855808a0`;
- digest `sha256:240e13b4f432e2f7bbf3f3532d72d22a20b496787bd4ef6937ac6299fef91e25`.

Node 24:

- artifact id `10293588749`;
- name `book-reconstruction-b00-f7-node-24-d87686c4dcf32934daee15ec2c6e046d855808a0`;
- digest `sha256:fcdecf157051edd8387b7462b4bf5493a2baafbf2622caacbc98cf33e9aecc3e`.

## 6. Current denominator standing

Fresh reconstructed evidence now covers:

- Q001-Q062;
- Q067-Q084;
- F6A lifecycle graph losslessness;
- recovered lifecycle and author-decision predecessor harnesses on the exact F7 subject.

Still open under the frozen B00 denominator:

- Q063 — integration-proposal specialist cannot directly mutate parent and must rebind through `REGISTER_ADMITTED_INTEGRATION_PROPOSAL`;
- Q064 — workflow evidence/provenance cannot create canonical effects by assertion;
- Q065 — export freeze/release cannot imply publication authorization;
- Q066 — external/native evidence requires a fresh parent re-read before use;
- Q085-Q090 — cross-surface privacy/native/publication boundary cases;
- Q091-Q096 — v1->v2 migration and cumulative seam behavior;
- final cumulative exact-subject regression across the complete frozen predecessor harness set.

B00 remains **OPEN**. Completion is not admitted until the full frozen denominator and cumulative evidence are fresh and valid with unaccounted requirements remaining at zero.

## 7. Exact next operation

**`BOOK-RECONSTRUCTION-B00-F8 — INTEGRATION-PROPOSAL PREPARE/COMMIT/RECONCILE REBIND + Q063 + PROPOSAL-AUTHORITY FENCE REGRESSION`**

F8 shall reuse the recovered integration-proposal ledger/runtime, validation and historical adversarial cases. Proposal workflow state remains specialist truth. A proposal may become canonical Book truth only through a typed `REGISTER_ADMITTED_INTEGRATION_PROPOSAL` parent effect after exact currentness, admissibility, authority and durable specialist-receipt binding.

Historical Prose remains retired provenance only. Open integration remains BOOK-owned; F8 must not recreate a Prose lane or accept a proposal as canonical merely because a legacy integration runtime previously emitted or accepted it.
