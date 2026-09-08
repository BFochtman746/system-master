# PILOT-001-RUN-001 Participant Consent

Protocol: `PILOT-001-v1`

## Purpose

This is a single-participant Learning System pilot. Its purpose is to test whether the current System Master Learning runtime can capture one real learner's path through baseline assessment, adaptive routing, independent verification, delayed retention, and novel transfer without overstating what one participant can establish.

Participation is voluntary.

## What participation involves

If you consent, the session will:

1. create a pseudonymous participant record;
2. present one or more baseline tasks with answers withheld;
3. adapt the route based on your submitted work;
4. provide instruction/remediation when the Learning runtime requires it;
5. present independent verification tasks;
6. pause until the protocol's minimum retention delay has elapsed;
7. later present a fresh retention task;
8. if retention passes, later present a novel transfer task;
9. preserve either passing or non-passing outcomes without rewriting them to success.

The stage-one session may finish before the delayed retention and transfer stages. The minimum retention delay for this pilot slice is 3600 seconds. That interval is a system policy for this qualification slice, not a universal scientific claim about memory.

## Data boundary

The pilot record is designed to retain:

- a pseudonymous participant key;
- task/evidence identifiers;
- scored outcomes and routing information;
- whether assistance or an answer reveal occurred;
- timestamps needed for protocol ordering and retention delay;
- a SHA-256 digest of each submitted response.

The pilot record must not contain direct personally identifying information or the raw free-text response itself.

The runtime can enforce the software-side storage boundary. It cannot independently prove that the person making a human-source attestation is actually a human; genuine participation is therefore required.

## Independent-task rules

For baseline, independent verification, delayed retention, and transfer tasks:

- answer personally;
- do not use ChatGPT, another AI system, search, documentation, another person, answer keys, or other assistance unless the session explicitly says assistance is allowed;
- do not view or request the reference answer before committing your response;
- if you did use assistance or saw the answer, say so truthfully; that independent evidence must not be counted as valid pilot evidence.

Instruction/remediation turns are different: assistance provided by the Learning system as part of the assigned instructional route is allowed there.

## Withdrawal

You may withdraw at any point. A withdrawal remains a valid terminal pilot state and is excluded from effectiveness review. You do not need to complete the pilot once you withdraw.

## What this pilot cannot prove

One participant record cannot establish population-level effectiveness, psychometric validity, certification, job readiness, or native iPhone performance. A completed record establishes only the recorded outcome for that participant under this protocol.

## Explicit consent statement

To begin a real participant record, the participant must personally provide this statement or an unambiguous equivalent:

`I consent to participate in PILOT-001-RUN-001. I understand that my participation is voluntary, that I can withdraw, that independent tasks must be my own work without assistance or answer reveal, and that the pilot record retains scored evidence and response digests rather than my raw free-text responses.`

No participant record may be created merely from an operator, ChatGPT, A-01, fixture, or model asserting consent on someone else's behalf.
