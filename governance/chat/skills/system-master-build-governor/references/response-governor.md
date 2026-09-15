# System Master Development Response Governor 001

Canonical contract: `SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001`.
Receipt protocol: `control-gateway.development-response-receipt.v1`.

## FULL

Use these headings exactly once and in this order:

1. `## STATUS`
2. `## WHERE WE ARE`
3. `## SYSTEM COMPLETION STANDING`
4. `## LOCKED JOB`
5. `## WHAT CHANGED`
6. `## EVIDENCE / RESULT`
7. `## WHERE WE ARE GOING`
8. `## EXACT NEXT STEP`

Every section must contain content.

The first non-empty line under `## STATUS` must be exactly one of:

- `CHAT READY`
- `CHAT READY WITH DECISION`
- `NOT READY`
- `WORKING`
- `BLOCKED`
- `QUALIFICATION PENDING`
- `COMPLETE WITH EVIDENCE`

Under `## EXACT NEXT STEP`, include each label exactly as written with non-empty content:

- `Objective:`
- `First action:`
- `PASS boundary:`
- `Successor:`
- `Failure route:`
- `Forbidden authority:`

## CONTINUATION

Use these headings exactly once and in this order:

1. `## STATUS`
2. `## WORK COMPLETED`
3. `## EVIDENCE / RESULT`
4. `## CURRENT BLOCKER`
5. `## EXACT NEXT STEP`

Every section must contain content. Use the same allowed STATUS values as FULL.

Do not include any FULL-only peer heading in a CONTINUATION response:

- `## WHERE WE ARE`
- `## SYSTEM COMPLETION STANDING`
- `## LOCKED JOB`
- `## WHAT CHANGED`
- `## WHERE WE ARE GOING`

Under `## EXACT NEXT STEP`, include:

- `Objective:`
- `First action:`
- `PASS boundary:`

## Selection rule

Use FULL for:
- new-chat startup;
- context recovery;
- authority, topology, or owner changes;
- major execution completion;
- qualification;
- merge;
- material failure or blocker.

Use CONTINUATION only for an ordinary turn in the same established development session where authority, owner, objective, and execution standing remain unchanged.

## Evidence and execution rules

- Never claim product/system completion from a phase, branch, test, or subsystem closure alone.
- Changed subjects require fresh evidence; do not transfer PASS across changed bytes, authority, topology, ownership, or readiness boundaries.
- Exact rendered response bytes are what the controller binds into the response receipt.
- A missing, stale, tampered, wrong-contract, or wrong-authority receipt must fail closed before raw GitHub/A-01 authorization.
- The Skill does not mint the controller receipt and does not itself grant GitHub, A-01, production, human, private, native-device, external-provider, credential, or publication authority.
