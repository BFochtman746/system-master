# BOOK-RECONSTRUCTION-B00-F6A — ISOLATED QUALIFICATION 001

Status: **F6A PASS / F6B ADMITTED / B00.018 VOCABULARY SEAM REPAIRED / B00 NOT CLOSED / NO PASS TRANSFER**

Owner: **SYSTEM_MASTER/BOOK**

Controlling method: `BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001`

Design repair: `BOOK-RECONSTRUCTION-B00-F6-LIFECYCLE-LOSSLESS-REBIND-DESIGN-REPAIR-001.md`

Qualified implementation lineage: `book-system/reconstruction-b00-parent-v2`

Exact qualified subject: `7a76887006d4326054922cea1189b1ac52441d04`

Hosted workflow run: **34679724866**

Observed live Book owner immediately before this evidence write: `book-system/control-v1@5cb7ea0f25efee382f192cc0a8dd6ca026933126`.

Observed reconstructed parent head immediately before promotion: `book-system/reconstruction-b00-parent-v2@fdfc2879c09cd098be9a0a49bbc4ddf26d5eadfa`.

The reconstruction branch was re-read before promotion and remained on the exact F5-qualified predecessor. It was then fast-forwarded, non-force, to the exact F6A-qualified subject above.

## 1. Defect repaired

F6 archaeology found a material losslessness contradiction before lifecycle rebind BUILD:

- the recovered canonical Book-state model and recovered lifecycle transition contract both preserve the detailed twelve-state project lifecycle;
- B00-A and D1 assign project lifecycle status to canonical parent truth and unit/dependency lifecycle state to the specialist lifecycle ledger;
- reconstructed F1 had narrowed canonical project status to `PLANNING / RESEARCH / DRAFTING / REVISING / EXPORT_FROZEN / PUBLISHED_OR_DELIVERED / ARCHIVED`, collapsing multiple recovered canonical review/author/finalization states.

F6A restores the recovered canonical project lifecycle vocabulary and graph exactly:

- `CREATED`
- `BRIEFING`
- `PLANNING`
- `DRAFTING`
- `STRUCTURAL_REVIEW`
- `PROSE_REFINEMENT`
- `BOOK_EVALUATION`
- `AUTHOR_REVIEW`
- `FINALIZATION`
- `EXPORT_FROZEN`
- `PUBLISHED_OR_DELIVERED`
- `ARCHIVED`

`RESEARCH` and `REVISING` are rejected as canonical project statuses in the repaired subject. `PROSE_REFINEMENT` is only a Book lifecycle state label; no Prose peer lane or Prose ownership was recreated.

## 2. Qualified implementation surface

F6A adds:

- `system-master/book-system/canonical-parent-v2-f6-core.js` — lossless canonical project lifecycle vocabulary/edge repair over the F5 parent surface;
- `.github/scripts/book-reconstruction-b00-f6a-lifecycle-graph-001-qualify.js` — exhaustive recovered-status/edge/non-edge and predecessor-surface matrix;
- `.github/workflows/book-reconstruction-b00-f6a-qualify.yml` — exact-subject hosted cumulative qualification.

The F6A parent wrapper also fails closed on project-status effects that do not carry at least one lifecycle specialist receipt reference plus an exact SHA-256 specialist-ledger identity. This is an interim authority fence for F6B; it is not yet proof that the referenced lifecycle specialist receipt exists in the durable store.

Non-lifecycle F5 parent effects remain usable under detailed lifecycle states and preserve those states. F5 content admission is specifically exercised through the F6 wrapper.

## 3. Exact qualification result

Hosted run `34679724866` completed successfully on exact subject `7a76887006d4326054922cea1189b1ac52441d04`.

Both hosted matrix jobs passed:

- Node 22 — **PASS**;
- Node 24 — **PASS**.

On each runtime, the exact subject passed:

- Q001-Q036 canonical parent predecessor baseline;
- Q037-Q050 durable parent-store predecessor baseline;
- Q051-Q058 F5 version/content-admission predecessor baseline;
- Q067-Q076 rights/custody predecessor denominator;
- Q077-Q084 governing-style predecessor denominator;
- recovered lifecycle predecessor harness;
- F6A lossless lifecycle graph matrix.

The F6A matrix contains **155 deterministic cases**:

- all 12 recovered canonical project statuses accepted;
- 3 non-canonical/reconstruction-only statuses rejected;
- all 28 recovered legal directed project transition edges accepted;
- all 104 other directed non-self pairs rejected as non-edges;
- lifecycle specialist receipt and exact specialist-ledger binding required;
- stale parent version and digest rejected before mutation;
- exact replay converges to one logical receipt/successor;
- conflicting idempotency reuse fails closed;
- a non-lifecycle parent effect preserves detailed `AUTHOR_REVIEW` state;
- F5 content admission remains functional while preserving detailed `FINALIZATION` state.

## 4. Evidence artifacts

Node 22:

- artifact id `10293421614`;
- name `book-reconstruction-b00-f6a-node-22-7a76887006d4326054922cea1189b1ac52441d04`;
- digest `sha256:82fc0a0afcfa58b058c49ccda881d43e1529b33be344041aa737d17c0a68ab17`.

Node 24:

- artifact id `10294146300`;
- name `book-reconstruction-b00-f6a-node-24-7a76887006d4326054922cea1189b1ac52441d04`;
- digest `sha256:59114b51ea33cd32dc4e1e97ceb4a1fbb917ce4e13642a647b8fd6cf3896919f`.

## 5. What this PASS does not prove

F6A repairs and qualifies the canonical project lifecycle vocabulary/edge surface only. It does **not** yet qualify the reconstructed lifecycle specialist prepare/commit/reconcile integration required by Q059-Q060.

In particular, F6A does not yet prove:

- that a lifecycle specialist receipt ref supplied to a parent effect exists or is current in the durable Book store;
- same-transaction lifecycle specialist + project parent persistence;
- specialist rollback when parent CAS/validation fails;
- parent rollback when lifecycle specialist persistence fails;
- durable response-loss reconciliation across parent + lifecycle receipts;
- unit lifecycle specialist persistence under the reconstructed parent;
- author-gated lifecycle transitions against real author decisions;
- publication authorization;
- private/native/external/A-01/production installation.

No historical PASS was transferred. F6A is qualified only for the exact bytes and hosted environments above.

## 6. Current denominator standing

Fresh reconstruction evidence now covers:

- Q001-Q058;
- Q067-Q084;
- F6A 155-case lossless lifecycle vocabulary/edge matrix;
- recovered lifecycle predecessor regression on the same exact F6A repository subject.

Still open under the frozen B00 denominator:

- Q059-Q060 — reconstructed lifecycle project/unit rebind;
- Q061-Q066 — author decision, proposal, export/workflow/external/native rebind/fence work;
- Q085-Q090 — cross-surface privacy/native/publication fences;
- Q091-Q096 — v1->v2 migration and cumulative seam behavior.

B00 remains open and cannot freeze until the exact integrated reconstructed implementation passes the remaining isolated and cumulative denominator with blocker/evidence boundaries preserved.

## 7. Exact next operation

**`BOOK-RECONSTRUCTION-B00-F6B — LIFECYCLE SPECIALIST PREPARE/COMMIT/RECONCILE REBIND + Q059-Q060 + FULL LIFECYCLE LOSSLESS MATRIX`**

F6B shall reuse the recovered lifecycle transition engine rather than rewrite it. Project-scope transition validation remains specialist logic, but canonical project status can commit only through the v2 parent `ADVANCE_PROJECT_STATUS` effect with exact parent + lifecycle-ledger identities and an immutable specialist receipt. Unit/dependency lifecycle state remains specialist truth and must not mutate canonical parent bytes.

The F6B durable store must prove same-transaction local parent/specialist commit, rollback on either-side failure, exact idempotent replay/reconciliation after response loss, stale parent/specialist/evidence/author/proposal denial, and explicit publication/human authority fences. No human, author, private, native, publication, A-01 or production evidence may be synthesized.
