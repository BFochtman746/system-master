# LEARNING-LAB-PILOT-001 — Real-Learner Closed-Loop Evidence Protocol

**Status:** `PROTOCOL_FROZEN / INSTRUMENTATION_UNDER_QUALIFICATION`  
**Protocol version:** `PILOT-001-v1`  
**Predecessor:** `LEARNING-LAB-QUAL-001 — PASS_PORTABLE_QUALIFICATION`

## Objective

Move beyond deterministic portable qualification without overclaiming what one human pilot can establish.

The pilot captures a real learner's path through:

`CONSENT -> BASELINE -> ADAPTIVE ROUTE -> INSTRUCTION/REMEDIATION OR SKIP -> INDEPENDENT VERIFICATION -> DELAYED RETENTION -> NOVEL TRANSFER -> OUTCOME`

## Evidence boundary

The pilot record MUST:

- use a pseudonymous participant key;
- contain no direct PII fields;
- contain no raw learner free-text responses;
- retain only scored evidence plus a SHA-256 response digest;
- record consent before baseline evidence;
- record baseline before instruction;
- reject assisted or answer-revealed independent evidence;
- require a fresh item family for retention;
- require the Lab runtime minimum retention delay of 3600 seconds;
- require passed retention before transfer;
- require a novel transfer context and a fresh transfer item family;
- preserve non-passing outcomes rather than rewriting them to success;
- exclude withdrawn records from effectiveness review.

The 3600-second retention delay is inherited Lab policy for this slice. It is not asserted to be a scientifically universal retention interval.

## Participant-level adjudication

A valid completed record may be classified as:

- `CLOSED_LOOP_PASS` — verification, delayed retention, and novel transfer all pass;
- `CLOSED_LOOP_NONPASS` — the closed loop completes but the final admissible outcome does not pass;
- `INCOMPLETE` — the record is valid but the required closed loop is unfinished;
- `WITHDRAWN` — participation ended and the record is excluded from effectiveness review.

Descriptive values such as baseline fraction, verification fraction, retention fraction, transfer fraction, and observed verification-minus-baseline may be reported for the participant. They are not psychometric effect estimates.

## Truth boundary

PILOT-001 instrumentation qualification may establish only that the evidence-capture/adjudication mechanism is deterministic and fail-closed.

A real completed participant record may establish only that the specified participant produced the recorded outcome under this protocol.

It MUST NOT promote any of the following from one record:

- `real_learner_effectiveness = PROVEN`
- `psychometric_validity = PROVEN`
- `population_validity = PROVEN`
- `production_system_master_integration = PROVEN`
- `target_native_iphone_behavior = PROVEN`
- certification or job-readiness claims

Those require separate, explicitly designed qualification objectives.

## Human boundary

A-01 can qualify the software, schema, ordering rules, contamination controls, evidence receipts, and predecessor regressions. It cannot manufacture a real-learner result.

Execution of the first participant record requires a human participant to explicitly consent and actually answer the baseline, verification, retention, and transfer tasks. Synthetic or model-generated answers cannot be relabeled as real-learner evidence.
