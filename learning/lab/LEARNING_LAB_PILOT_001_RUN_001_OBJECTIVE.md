# LEARNING-LAB-PILOT-001-RUN-001 — First Real-Participant Stage

Status: BUILDING / HUMAN CONSENT NOT YET RECORDED

## Objective

Execute the first real participant through the already-qualified `PILOT-001-v1` current-runtime binding without fabricating or weakening the human evidence boundary.

Stage 1 is:

`EXPLICIT CONSENT -> BASELINE -> ADAPTIVE ROUTE -> INSTRUCTION/REMEDIATION OR SKIP -> INDEPENDENT VERIFICATION -> RETENTION WAIT`

Delayed retention and novel transfer remain later stages of the same participant record.

## Governing authorities

- `SYSTEM-MASTER-WORKSTREAM-BOOTSTRAP.md` on canonical `main`
- `qualification/a01/A01-OPERATING-CONTRACT.md`
- `qualification/a01/a01-policy.json`
- `qualification/a01/registry.json`
- GitHub Issue #4, A01-CONTROL-PLANE-001 legacy migration queue
- canonical A-01 infrastructure baseline `c51046152eaf749d672ce923ea983e1c7893d3f2`
- frozen pilot protocol `PILOT-001-v1`
- canonical current-runtime pilot binding `PILOT-001-CURRENT-RUNTIME-BINDING-V1`

No new direct self-hosted A-01 workflow may be created for this workstream. The existing direct Learning workflow history is preserved. The next machine-qualification boundary must migrate forward through the shared A-01 control plane.

## Human execution invariants

A real participant turn must not be accepted merely because a text response exists. Every participant submission must be accompanied by a durable source/integrity attestation bound to the exact prepared turn:

- `response_source = HUMAN_PARTICIPANT`
- `participant_present = true`
- `response_was_actually_provided_by_participant = true`
- `assistance_used` explicitly recorded
- `answer_revealed_before_commit` explicitly recorded
- attestation bound to `pilot_id`, participant key, learner, course, journey, session, turn ID, turn-binding digest, and submission time
- raw learner response MUST NOT be stored in the attestation or pilot record
- only a SHA-256 response digest may survive the submission boundary

For baseline and independent verification, any `assistance_used = true` or `answer_revealed_before_commit = true` must fail closed for pilot evidence capture.

The software can enforce that an attestation was supplied and internally consistent. It cannot independently prove the person behind the attestation is human; therefore real-participant standing remains contingent on genuine execution, not merely a software flag.

## Stage-one completion

Stage 1 is complete only when the runtime-bound pilot record contains:

1. valid explicit consent;
2. baseline evidence derived from submitted diagnostic turn receipts;
3. the adaptive route selected by Learning;
4. any required instruction/remediation turns;
5. valid unassisted independent verification evidence;
6. no raw learner response in the pilot evidence record;
7. a computed earliest retention time at least 3600 seconds after the qualifying verification evidence.

At that point standing becomes `STAGE_1_COMPLETE_RETENTION_PENDING`.

## A-01 boundary

No A-01 execution is required to merely prepare the human execution path or collect an actual participant's responses.

If this stage introduces new machine-qualified integrity machinery, safe deterministic prequalification must be completed first. At the next A-01 boundary the Learning workstream must migrate forward using the registered shared gateway, exact subject SHA, return ticket, and conforming control-plane receipt. Existing passed direct-workflow history must not be rewritten.

## Truth boundary

RUN-001 can establish only what the actual participant record supports. It does not establish population effectiveness, psychometric validity, certification/job readiness, or native iPhone behavior.
