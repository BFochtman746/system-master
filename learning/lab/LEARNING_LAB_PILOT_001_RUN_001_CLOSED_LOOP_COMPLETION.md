# LEARNING-LAB-PILOT-001-RUN-001 — CLOSED-LOOP PARTICIPANT COMPLETION

**Status:** BUILDING / DEPENDENCY-VALID SUCCESSOR TO EXECUTION-PREP  
**Base subject:** `f36e10ac432a5d949826fe833689a579a9638c44`  
**Protocol authority:** frozen `PILOT-001-v1`

## Objective

Complete the participant-facing execution path after stage-one verification without changing the frozen PILOT-001-v1 protocol or manufacturing human evidence.

The execution shell must support the full protocol path:

`CONSENT -> BASELINE -> ADAPTIVE ROUTE -> INSTRUCTION/REMEDIATION OR SKIP -> INDEPENDENT VERIFICATION -> DELAYED RETENTION -> NOVEL TRANSFER -> OUTCOME`

## Required behavior

1. Preserve the already-qualified human-response boundary, digest-only persistence, contamination controls, and zero-evidence withdrawal repair.
2. Do not expose a retention prompt before `verification.occurred_at + 3600` seconds.
3. Never collect or submit a participant response for a `WAIT` surface.
4. A failed verification must not be mislabeled as retention-ready.
5. A failed retention must not be treated as transfer-ready.
6. Transfer completion authority must come from a captured `TRANSFER_CHECK` runtime receipt whose `next_action.action_type` is `COURSE_COMPLETE`.
7. Final terminalization must use the existing runtime-bound completion function and frozen v1 adjudicator.
8. The local completion package may contain pseudonymous identifiers, scored fractions, timing, outcome, and record digests, but no raw answer text or direct PII.
9. Existing stage-one manifests must remain resumable; do not require a synthetic restart or fresh consent solely because the launcher gained completion support.
10. Qualification fixtures and A-01 runs are software evidence only. They must never be relabeled as real-participant evidence.

## Truth boundary

A completed real participant record can establish only the recorded outcome for that participant under this protocol. It does not prove population effectiveness, psychometric validity, production iPhone behavior, certification, or job readiness.

This successor branch must not alter the exact A-01 subject already scheduled for `LEARNING-PILOT-001-RUN-001-EXECUTION-PREP`. It earns separate qualification if and when it becomes a promotion subject.
