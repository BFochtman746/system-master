# BOOK-RECONSTRUCTION-B00-F6 — LIFECYCLE LOSSLESS REBIND DESIGN REPAIR 001

Status: **F6 DESIGN REPAIR LOCKED / BUILD NOT YET ADMITTED / B00.018 NARROWLY REOPENED / B00 NOT CLOSED**

Owner: **SYSTEM_MASTER/BOOK**

Controlling method: `BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001`

Observed live Book owner before this write: `book-system/control-v1@69d4bd9de55dc6a2180e1e3c479e82d41d8673fd`.

Qualified predecessor implementation subject: `book-system/reconstruction-b00-parent-v2@fdfc2879c09cd098be9a0a49bbc4ddf26d5eadfa`.

Predecessor evidence: `BOOK-RECONSTRUCTION-B00-F5-ISOLATED-QUALIFICATION-001.md`.

## 1. Why F6 stopped before BUILD

F6 re-read the recovered canonical Book-state model, lifecycle transition contract/runtime, compatibility/rebind adapters, the B00-A lossless census, B00-B gap analysis, D1 truth-owner adjudication, E1 formal design lock and the exact F5 qualified implementation before mutation.

That re-read found a material losslessness contradiction in B00.018:

- the recovered canonical Book-state model defines the canonical project lifecycle as:
  `CREATED -> BRIEFING -> PLANNING -> DRAFTING -> STRUCTURAL_REVIEW -> PROSE_REFINEMENT -> BOOK_EVALUATION -> AUTHOR_REVIEW -> FINALIZATION -> EXPORT_FROZEN -> PUBLISHED_OR_DELIVERED -> ARCHIVED`, with the explicitly frozen reverse/rework/archive edges;
- the recovered lifecycle transition engine contract uses the same detailed project statuses and gates;
- B00-A classifies project lifecycle status as canonical parent truth and the lifecycle unit/dependency ledger as specialist truth;
- D1 repeats that adjudication: project lifecycle status belongs to the canonical parent; the lifecycle runtime proposes/validates and the parent commits;
- the reconstructed F1 parent core instead narrowed project status to `PLANNING / RESEARCH / DRAFTING / REVISING / EXPORT_FROZEN / PUBLISHED_OR_DELIVERED / ARCHIVED`.

`RESEARCH` and `REVISING` are not lossless replacements for the recovered canonical lifecycle states. In particular, collapsing STRUCTURAL_REVIEW, PROSE_REFINEMENT, BOOK_EVALUATION, AUTHOR_REVIEW and FINALIZATION into REVISING removes canonical distinctions that carry different evidence/author gates. F6 therefore cannot truthfully rebind the recovered lifecycle runtime to the current F1 vocabulary.

This is a reconstruction design defect, not a reason to rewrite the lifecycle engine or to silently weaken its gates.

## 2. Authority adjudication

B00.018 is reopened **only for the reconstructed canonical parent project-status vocabulary/transition graph**. The rest of B00-A remains frozen.

The recovered canonical state model + lifecycle transition contract are the controlling source for project lifecycle semantics because both independently preserve the same detailed graph and because B00-A/D1 explicitly assign project lifecycle status to the canonical parent.

Therefore the F6 repair shall restore that detailed project lifecycle graph in canonical parent v2.

Canonical project statuses after repair:

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

Canonical transition edges after repair must match the recovered canonical-state model exactly, including legal rework/archive edges.

The labels `PROSE_REFINEMENT` and `BOOK_EVALUATION` are lifecycle state names only. They do **not** recreate a Prose peer lane or transfer ownership out of BOOK. Historical Prose remains retired provenance.

## 3. Disposition of reconstruction-only `RESEARCH` and `REVISING`

`RESEARCH` and `REVISING` were introduced by the un-frozen reconstruction implementation but are not present in the recovered canonical project lifecycle source and do not have a B00-A requirement row authorizing them as replacements.

No production/native/A-01 installation of the reconstructed parent has been claimed. Therefore there is no authoritative installed production state requiring migration from these two reconstruction-only statuses.

They shall be removed from the active repaired lifecycle vocabulary rather than retained as ambiguous aliases.

Historical exact-subject F1-F5 qualification remains valid evidence only for those exact bytes. It is not transferred to the repaired F6 subject. F6 must rerun all admitted predecessor reconstruction denominators.

## 4. F6 specialist / parent truth split

The existing lifecycle engine and its unit/dependency semantics are reused, not rewritten.

### Project-scope transition

A project transition shall execute as:

1. re-read exact canonical parent and lifecycle specialist ledger;
2. validate the transition request, exact parent identity, exact lifecycle-ledger identity, legal edge, required evidence, author decision refs and proposal refs against current canonical truth;
3. run the recovered lifecycle transition rules against a bounded parent projection;
4. produce a deterministic lifecycle specialist delta/receipt with disposition `PREPARED_FOR_PARENT`;
5. produce one typed canonical `ADVANCE_PROJECT_STATUS` effect carrying the exact expected parent identity, project subject identity, evidence/author/proposal refs as applicable, specialist receipt ref and exact expected specialist-ledger identity;
6. inside one local Book store transaction, re-read parent + specialist identities, apply the parent effect, persist the lifecycle delta and persist both immutable receipts;
7. on response loss, reconcile from immutable request/effect/specialist receipt identity before retrying;
8. no transition is complete if only the specialist ledger advanced.

### Unit-scope transition

Unit state/dependency/invalidation truth remains entirely lifecycle-specialist state:

1. validate against exact current canonical parent + exact lifecycle ledger;
2. apply the recovered unit transition/invalidation rules to specialist state only;
3. persist one specialist successor + immutable receipt under specialist CAS/idempotency;
4. canonical parent version, digest, project status and active pointers remain byte-for-byte unchanged;
5. unit transition success cannot synthesize a canonical Book mutation.

## 5. Evidence and authority gates

Recovered lifecycle gates remain fail-closed.

- Provider/service success is evidence only, never transition authority.
- Any author-required transition resolves only a current finalized author decision/authority ref; no author choice may be fabricated.
- Publication/delivery remains separately blocked unless explicit current publication authority is present. Export/freeze PASS is insufficient.
- Private/native/external results are accepted only as exact-subject evidence/refs under their owning fence; F6 does not synthesize them.
- A stale parent, stale lifecycle ledger, stale evidence projection, stale author decision or stale proposal fails before mutation.

## 6. F6 test denominator repair

Frozen B00 semantic cases Q059-Q060 remain mandatory:

- **Q059** — project lifecycle transition commits only through canonical parent `ADVANCE_PROJECT_STATUS` plus same-transaction specialist lifecycle successor;
- **Q060** — unit lifecycle/dependency state remains specialist truth and does not mutate canonical parent bytes.

Because the vocabulary contradiction was found before BUILD, F6 also requires a supplementary losslessness matrix before freeze:

1. every recovered canonical project status is accepted;
2. every recovered legal project edge is accepted only when its required gates are satisfied;
3. every non-edge project transition fails closed;
4. `RESEARCH` and `REVISING` are rejected as canonical project statuses after repair;
5. every unit transition class remains specialist-only;
6. transitive invalidation/restoration remains specialist-only;
7. stale parent and stale specialist identities fail before write;
8. specialist persistence failure rolls back project parent commit;
9. parent validation/CAS failure rolls back specialist project delta;
10. response-loss reconciliation returns the same logical parent + lifecycle receipts;
11. author-gated transitions cannot pass on caller assertions;
12. `EXPORT_FROZEN -> PUBLISHED_OR_DELIVERED` remains blocked without explicit publication authority evidence.

F6 qualification must also rerun the exact-subject predecessor reconstruction baseline Q001-Q058 + Q067-Q084 and the recovered lifecycle predecessor harnesses relevant to transition legality, idempotency, invalidation, compatibility/currentness and rebind behavior.

## 7. Targeted research decision

No external research is warranted for this repair. The design-sensitive question is resolved by current Book authority: two recovered Book-owned canonical contracts agree on the detailed lifecycle graph, while the narrowed F1 graph conflicts with the lossless B00.018 trace. External sources cannot override that repository authority.

## 8. Build admission gate

F6 BUILD is admitted only after the implementation branch is freshly re-read and remains descended from exact qualified F5 subject `fdfc2879c09cd098be9a0a49bbc4ddf26d5eadfa`.

The first build mutation must repair canonical-parent lifecycle vocabulary/edges before wiring the lifecycle rebind. No lifecycle adapter may compensate by hiding detailed project lifecycle state in the specialist ledger.

## 9. Exact successor

**`BOOK-RECONSTRUCTION-B00-F6A — RESTORE LOSSLESS CANONICAL PROJECT LIFECYCLE GRAPH IN V2 PARENT + EXPAND F1 LIFECYCLE REGRESSION DENOMINATOR`**

Only after F6A exact-subject qualification passes may the lane proceed to:

`BOOK-RECONSTRUCTION-B00-F6B — LIFECYCLE SPECIALIST PREPARE/COMMIT/RECONCILE REBIND + Q059-Q060 + FULL LIFECYCLE LOSSLESS MATRIX`.

B00 remains open. No author/private/native/publication/A-01/production evidence is claimed or transferred.
