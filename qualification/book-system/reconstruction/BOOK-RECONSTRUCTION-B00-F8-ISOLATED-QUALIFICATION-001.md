# BOOK-RECONSTRUCTION-B00-F8 — ISOLATED QUALIFICATION 001

Status: **F8 PASS / F9 ADMITTED / INTEGRATION PROPOSAL SPECIALIST REBOUND / B00 NOT CLOSED / PROSE REMAINS RETIRED / NO PASS TRANSFER**

Owner: **SYSTEM_MASTER/BOOK**

Controlling method: `BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001`

Design lock: `BOOK-RECONSTRUCTION-B00-E1-FORMAL-DESIGN-LOCK-001.md`

F7 predecessor evidence: `BOOK-RECONSTRUCTION-B00-F7-ISOLATED-QUALIFICATION-001.md`

Qualified implementation lineage: `book-system/reconstruction-b00-f8-integration-proposal-rebind`

Exact qualified subject: `9c612d61e7ab02f25e9807a41e8b8de387983ac6`

Hosted workflow run: **34680849265**

Observed Book control immediately before this evidence write: `book-system/control-v1@986c6ffddbf062dc50eb65cc13bcade7e4d28a0e`.

Reconstructed parent lineage was fast-forwarded after qualification to exact subject `9c612d61e7ab02f25e9807a41e8b8de387983ac6`.

## 1. Recovered defect and reuse decision

The recovered integration-proposal runtime remains useful specialist substrate and was not discarded. Its request/response contracts, source/artifact/provenance currentness indexes, proposal families/snapshots, admission transitions, author-decision handoff semantics, rights/privacy boundaries, deduplication, outbox and adversarial qualification are preserved and rerun.

A reconstruction-critical authority defect was confirmed: recovered `registerInParent(...)` directly cloned canonical parent state, appended an integration proposal, incremented parent state version and resealed the parent. Both initial proposal intake and subsequent proposal state transitions called that helper. Therefore proposal workflow truth and canonical Book truth were not separated by the frozen B00 one-parent-writer boundary required by Q063.

F8 repairs only that authority seam. Proposal workflow/admission state remains specialist truth. Only a **current, latest, ADMITTED** proposal may prepare a typed `REGISTER_ADMITTED_INTEGRATION_PROPOSAL` parent effect, and the parent plus specialist registration successor are then persisted atomically.

## 2. New reusable surfaces

Exact subject `9c612d61e7ab02f25e9807a41e8b8de387983ac6` adds:

- `system-master/book-system/integration-proposal-v2-rebind.js`;
- `system-master/book-system/integration-proposal-v2-sqlite-store.js`;
- `.github/scripts/book-reconstruction-b00-f8-integration-proposal-rebind-001-qualify.js`;
- `.github/workflows/book-reconstruction-b00-f8-qualify.yml`.

The rebind requires exact canonical-parent identity, exact integration-specialist identity, latest proposal-family identity, `ADMITTED` standing, fresh source/artifact/provenance identities, a fresh parent revalidation binding, explicit Book integration authority, rights/privacy boundaries, and any required current approved author-decision reference before it can produce a parent effect.

Preparation does not mutate parent or specialist input bytes. The SQLite commit path writes canonical parent successor, specialist successor, parent receipt and specialist receipt under one `BEGIN IMMEDIATE` transaction using compare-and-swap identities. Response loss is reconciled from durable receipts; replay is idempotent and does not assume read-after-write response delivery.

## 3. Prose retirement and authority fence

Recovered proposal history may contain `SYSTEM_MASTER/BOOK/PROSE` or `PROSE_SYSTEM` as historical source provenance. F8 does not recreate that as an authority lane. Canonical registration is BOOK-owned (`SYSTEM_MASTER/BOOK`) while the recovered source lane is retained only in a provenance field.

Open integration remains BOOK-owned. No new Prose lane, Prose control surface or Prose mutation authority was created.

## 4. Human/private/native/publication fences

F8 does not synthesize author approval. An author-gated proposal remains blocked when no current approved canonical author-decision reference exists. Fixture decisions used by qualification prove only the machine-side reference fence and are not evidence of a real human choice.

A proposal whose specialist snapshot claims `publication_authorized=true` is rejected. The registered canonical proposal always carries `publication_authorized=false`; proposal admission cannot authorize publication.

This PASS does **not** prove or synthesize:

- real author consent or choice;
- private-source permission or private payload authority;
- native PDF/DOCX/OCR fidelity;
- legal rights/license clearance beyond machine-side declared-boundary fixtures;
- publication authorization;
- production installation;
- A-01 target execution.

## 5. Exact hosted qualification

Hosted run `34680849265` completed successfully on exact subject `9c612d61e7ab02f25e9807a41e8b8de387983ac6`.

Both hosted jobs passed:

- Node 22 — **PASS**;
- Node 24 — **PASS**.

On each runtime the exact subject passed:

- Q001-Q036 canonical-parent pure-core predecessor baseline;
- Q037-Q050 durable parent-store predecessor baseline;
- Q051-Q058 version/admission predecessor baseline;
- Q067-Q076 rights/custody predecessor denominator;
- Q077-Q084 governing-style predecessor denominator;
- F6A lifecycle graph losslessness matrix;
- recovered lifecycle predecessor harness;
- Q059-Q060 F6B lifecycle rebind;
- recovered author-decision queue/current-subject/applicability predecessor harnesses;
- Q061-Q062 F7 author-decision rebind;
- recovered integration-proposal runtime predecessor harness;
- Q063 F8 prepare/commit/reconcile rebind plus stale-source, stale-parent, publication-fence, author-absence, rollback, response-loss, idempotency, recovery and retired-Prose authority cases.

Fresh exact-subject evidence was used. Historical PASS transfer count remains zero.

## 6. Durable hosted artifacts

Node 22:

- artifact id `10293402859`;
- name `book-reconstruction-b00-f8-node-22-9c612d61e7ab02f25e9807a41e8b8de387983ac6`;
- digest `sha256:915ddee669b39c610adbc4c9848da86a45f12c81aca8114e5c824a8f1f374576`.

Node 24:

- artifact id `10293519020`;
- name `book-reconstruction-b00-f8-node-24-9c612d61e7ab02f25e9807a41e8b8de387983ac6`;
- digest `sha256:8cbaaf8248b4bb8718bb0d3471c0cad881b97da2dfb1420594d67c5a5bab7a95`.

## 7. Current denominator standing

Fresh reconstructed evidence now covers:

- Q001-Q063;
- Q067-Q084;
- F6A lifecycle graph losslessness;
- recovered lifecycle, author-decision and integration-proposal predecessor harnesses on the exact F8 subject.

Still open under the frozen B00 denominator:

- Q064 — workflow evidence/provenance cannot create canonical effects by assertion;
- Q065 — export freeze/release cannot imply publication authorization;
- Q066 — external/native evidence requires a fresh parent re-read before use;
- Q085-Q090 — cross-surface privacy/native/publication boundary cases;
- Q091-Q096 — v1->v2 migration and cumulative seam behavior;
- final cumulative exact-subject regression across the complete frozen predecessor harness set.

B00 remains **OPEN**. Completion/freeze is not admitted until the full frozen denominator and cumulative evidence are fresh and valid with unaccounted requirements remaining at zero.

## 8. Exact next operation

**`BOOK-RECONSTRUCTION-B00-F9 — EXPORT FREEZE/RELEASE PREPARE/COMMIT/RECONCILE REBIND + Q065 + PUBLICATION-AUTHORITY FENCE REGRESSION`**

F9 shall reuse the recovered export-freeze/release substrate, exact manuscript/style/source identities and historical adversarial cases rather than rewrite without cause. Export readiness/freeze workflow remains specialist truth. A release may become canonical Book truth only through typed `REGISTER_EXPORT_RELEASE` parent authority after exact currentness and durable specialist receipt binding.

No export freeze, release receipt, rendered artifact, target-medium evidence or successful native conversion may imply publication authorization. Publication remains a separately blocked authority surface.
