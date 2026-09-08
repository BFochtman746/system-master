# LEARNING-LAB-IMPL-033 — Unified Fresh-Evidence Blocker Recovery Orchestration

Status: IMPLEMENTATION / QUALIFICATION PENDING

## Objective

Close the remaining caller-visible seam between the unified Learning turn controller and IMPL-032 fresh-evidence provider acquisition.

A normal authorized System Master turn-preparation request must be able to encounter a qualified fresh-evidence blocker, derive the required recovery scope from trusted Learning state, acquire a provider candidate through the configured HTTP boundary, require IMPL-031 independent admission, and resume into the ordinary answer-withheld Learning turn contract without requiring the caller to issue a second provider-specific command.

## Required behavior

- The caller supplies only ordinary turn identity and Learning scope: recovery ID, turn ID, state key, journey, session, learner, course, and time.
- The caller cannot supply or override provider/model/endpoint/credential configuration.
- The caller cannot select recovery kind, skill, criterion, or oracle authority.
- `MAINTENANCE_RESEARCH_REQUIRED` + `FRESH_RETENTION_FAMILY_REQUIRED` derives maintenance recovery.
- `TRANSFER_REMEDIATION` + `FRESH_TRANSFER_TASK_REQUIRED` derives transfer recovery.
- The criterion is derived fail-closed from the frozen course skill contract; ambiguous criterion scope is not guessed.
- Provider output remains an unverified candidate until IMPL-031 independently admits it.
- The Learning engine remains mastery authority.
- A successful recovery must resume through the ordinary unified turn controller with the answer withheld.
- Non-blocked turns must bypass provider acquisition entirely.
- Recovery intent is frozen before provider acquisition.
- Crash/replay after acquisition must not resample the provider.
- Recovery results must not expose provider credentials or reference answers.
- Existing IMPL-030 PREPARE/SUBMIT bridge behavior remains untouched.

## Qualification gates

1. focused maintenance and transfer auto-recovery tests;
2. non-blocked zero-provider-call gate;
3. invalid provider answer fail-closed gate;
4. crash/replay no-resample gate;
5. Java authorization + caller-scope-exclusion gate;
6. Java -> Python -> real local HTTP -> IMPL-031 admission -> unified turn gate;
7. IMPL-031/032 and unified-turn predecessor regressions;
8. evidence artifact publication with exact source commit.

## Truth boundary

This milestone does not establish external production-provider reliability, broad-domain oracle coverage, native iPhone behavior, real-learner effectiveness, psychometric validity, or population validity.
