# LEARNING-LAB-PILOT-001-REFRESH-001 — Current Canonical Runtime Binding + Human-Ready Evidence Capture

Status: IMPLEMENTATION ACTIVE / A-01 READINESS QUALIFICATION NOT YET SCHEDULED

## Why this objective exists

The original `PILOT-001-v1` privacy, integrity, delayed-retention, transfer, withdrawal, and truth-boundary protocol was qualified on the older IMPL-016-era line. It intentionally did not prove production System Master integration and its software validator accepted a pilot record as input.

The Learning runtime is now canonical through IMPL-033, including the unified turn controller, durable answer-withheld turn binding, independent evidence continuation, IMPL-031 fresh-task admission, IMPL-032 configured provider acquisition, and IMPL-033 automatic fresh-evidence blocker recovery.

Before asking a human participant to generate evidence, PILOT-001 must be rebound to this current runtime so assessment scores, response digests, item-family identity, route selection, and evidence standing are derived from durable Learning receipts rather than supplied by the pilot caller.

## Frozen authority carried forward

The exact previously qualified blobs for these PILOT-001 artifacts are ported unchanged onto the IMPL-033 line:

- `LEARNING_LAB_PILOT_001_PROTOCOL.md`
- `learning_lab/real_learner_pilot.py`
- `tests/test_real_learner_pilot.py`
- `qualification_pilot001.py`

The evidence protocol remains `PILOT-001-v1`. This refresh does not loosen or reinterpret its human-evidence boundary.

## New current-runtime binding

Binding version: `PILOT-001-CURRENT-RUNTIME-BINDING-V1`

A runtime-bound pilot:

1. requires explicit consent before evidence capture;
2. freezes pilot, pseudonymous participant, journey, session, learner, and course scope;
3. accepts only a durable submitted `turn_id` for evidence capture;
4. does not accept caller-supplied score, pass/fail, response digest, item family, novelty, or evidence authority;
5. loads the canonical `system_master_learning_turn` and `system_master_learning_turn_submission` receipts;
6. rejects cross-learner, cross-course, cross-journey, or cross-session receipt reuse;
7. requires `response_echoed = false` and exports only the SHA-256 response digest;
8. derives diagnostic baseline observations from the durable diagnostic receipt;
9. derives independent-verification, retention, and transfer outcomes from the Learning evidence receipt;
10. derives item-family and transfer-novelty metadata from the frozen/admitted task authority rather than the participant record;
11. materializes a `PILOT-001-v1` record and runs the frozen validator/adjudicator over it;
12. preserves withdrawal as a valid terminal outcome excluded from effectiveness review;
13. permits completion only after a runtime-bound transfer receipt whose next action is `COURSE_COMPLETE`.

## Human boundary

A-01 may qualify this binding, its replay behavior, its scope controls, and its ability to derive a privacy-safe pilot record from deterministic qualification interactions.

A-01 MUST NOT create, simulate, or relabel those qualification interactions as a real participant record.

The first real participant stage still requires an explicitly consenting human to provide the actual learner responses. The delayed retention stage must occur after the protocol delay; novel transfer follows only after valid passed retention.

## Qualification target before human execution

The future readiness gate must prove, in one bundled A-01 milestone run:

- the frozen 14/14 PILOT-001 validator suite remains green unchanged;
- current-runtime binding focused tests pass;
- the current unified turn/submission path produces a valid in-progress baseline + independent-verification pilot record without raw response export;
- caller score/digest/family injection is impossible at the binding API;
- exact capture replay is stable and duplicate capture under a different operation fails closed;
- wrong runtime scope fails before pilot receipt creation;
- withdrawal remains valid and excluded;
- IMPL-030 through IMPL-033 predecessor/runtime regressions remain green;
- exact tested source and evidence artifact are preserved.

Only after that readiness gate passes should `LEARNING-LAB-PILOT-001-RUN-001` solicit the first human participant responses.

## Truth boundary

This refresh can prove software/runtime evidence binding. It cannot by itself prove:

- that any deterministic qualification interaction came from a human;
- real-learner effectiveness;
- psychometric validity;
- population validity;
- native iPhone behavior;
- certification or job readiness;
- external production-provider reliability.
