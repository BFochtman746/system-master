# LRN-CUR-PRODUCTION-BINDING-002-T2A — I016 Contract Reconciliation + Cross-Domain Reference Resolution Design Lock

**Standing:** DESIGN-LOCK PASS / I016-L CANDIDATE REPAIRED / I016-C IMPLEMENTATION NOT YET AUTHORIZED

## Authority precedence

The active ownership constitution is the lossless `LRN-OWNERSHIP-FREEZE-001C` rebase: 113 requirements, 112 interfaces and 28 semantic objects after explicit splits of the historical 110/110/26 denominator. `001C` labels the active interface rows `REFROZEN_SEMANTIC_SIGNATURE_001C`. `001D` is an implementation-surface mapping/refreeze and does not explicitly supersede or narrow those semantic signatures.

Therefore, where a later implementation matrix abbreviates a payload, the 001C semantic signature controls unless an explicit semantic supersession transaction says otherwise. Implementation may internally rename fields only behind an adapter; it may not silently drop owner-significant information.

## I016-L repaired exact semantic signature

`I016-L CreateRemediationNeed` remains Learning-owned and accepts exactly `goal_id`, `learner_ref`, `skill_or_criterion_refs`, `evidence_refs`, `diagnosis_reason_codes`, and `client_operation_id`.

The candidate handler now rejects the condensed 001D aliases `diagnosis_reason` / `operation_id`, preserves learner/evidence/diagnosis references in the Learning-owned `RemediationNeed`, sets initial state `OPEN`, uses client-operation idempotency, and does not create Curriculum content or mastery.

The active object invariant remains: `LRN-E018-L RemediationNeed` is learner-specific diagnosis/evidence-gap state owned by Learning. It cannot define curriculum content or mint mastery.

## I016-C frozen public signature

`I016-C RequestRemediationPlan` remains Curriculum-owned and its public semantic payload is `remediation_need_ref`, `curriculum_version_ref`, `criterion_refs`, `instructional_constraints`, and `client_operation_id`.

Its output is a versioned Curriculum-owned `LRN-E018-C RemediationPlan` reference. It may not mutate learner mastery or other Learning canonical state.

## Cross-domain reference-resolution design

The current portable Curriculum implementation consumes the full immutable `RemediationNeed` value while the frozen public I016-C contract accepts only a reference. Production binding must preserve both facts without granting Curriculum direct access to Learning persistence and without adding a new public semantic interface.

### Selected design: owner-resolved immutable snapshot adapter

Master Core binds an internal `OwnerValueResolver` implementation behind the existing Learning dependency/query boundary. It is an integration mechanism, not a new semantic owner and not a new entry in the 112-interface public denominator.

Resolution contract:

1. I016-C handler validates the public payload and canonical owner of `remediation_need_ref`.
2. The handler asks the resolver for the exact Learning-owned `RemediationNeed` snapshot identified by the ref.
3. The resolver calls the Learning owner implementation through an admitted owner port; Curriculum receives no Learning repository handle and performs no foreign-store access.
4. The resolver verifies object kind, owner=`MOD-LEARNING-001`, immutable/version identity and digest supplied by the ref.
5. The resolver returns an ephemeral immutable snapshot plus verified identity metadata. It does not persist a shadow copy and does not become a truth owner.
6. Curriculum validates `criterion_refs`, active/pinned CurriculumVersion and instructional constraints against its own canonical state, then creates/version-updates a Curriculum-owned RemediationPlan.
7. The result returned across the public seam is a plan reference/digest, not mutable Curriculum store access.

### Failure law

- missing/unreachable owner resolver -> `DependencyUnavailable`
- missing/stale/tampered Learning ref -> `RemediationNeedStale`
- Curriculum version mismatch -> `CurriculumVersionMismatch`
- unknown criterion -> `CriterionUnknown`
- invalid constraints/payload -> `ValidationError`

Internal owner/digest/type mismatches are mapped fail-closed to the frozen public failure classes; new externally visible error semantics are not invented by this build packet.

## Rejected alternatives

- Curriculum direct-read of Learning storage — violates owner/store isolation.
- Copying RemediationNeed into Curriculum canonical storage — creates duplicate semantic truth.
- Adding `GetRemediationNeed` to the public 112-interface denominator — requires a separate architecture transaction.
- Passing an unverified full RemediationNeed in the public command — changes the frozen I016-C contract and weakens currentness semantics.

## Qualification after I016-L repair

- PB002 tranche tests: **11/11 PASS**
- Production Binding baseline tests: **15/15 PASS**
- REBIND-001: **20/20 PASS**
- REBIND-002: **34/34 PASS**
- IMPL016 owner-separated seam: **25/25 PASS**
- cumulative changed-surface denominator: **105/105 PASS**
- compileall for current authority/runtime/binding packages: **PASS**

No fresh 481-test historical-suite completion is claimed. The prior 481/481 audit remains historical exact-source evidence only.

## Truth boundary

This design lock and candidate repair do not establish live PostgreSQL execution, deployed Master Core transport, native iPhone behavior, real-learner effectiveness, psychometric validity, SME approval, certification, provider execution or A-01 qualification. The candidate source is isolated on the Second Shift build branch and does not mutate the canonical Learning control branch.

## Exact next operation

`LRN-CUR-PRODUCTION-BINDING-002-T2B — IMPLEMENT OWNER-RESOLVED I016-C HANDLER + CURRICULUM PLAN ATOMIC UOW / NEGATIVE FOREIGN-STORE + DIGEST/STALE/IDEMPOTENCY QUALIFICATION`
