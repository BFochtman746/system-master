# SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001

Status: C04 CHAT candidate runtime contract
Owner: `SYSTEM_MASTER/CORE`
Purpose: govern every substantive ChatGPT response used while designing, coding, testing, qualifying, repairing, or operating System Master, and hard-gate ChatGPT-originated GitHub/A-01 mutation admission on response compliance.

## Scope

This contract applies to substantive System Master development turns, not only chat startup. It does not claim that repository code can intercept or rewrite arbitrary native ChatGPT UI output. Generation is governed by Project instruction + Build Governor Skill; execution is enforced by the controller.

## Response classes

### FULL

Required headings, in order:

1. `CONTROL`
2. `WHERE WE ARE`
3. `SYSTEM COMPLETION STANDING`
4. `LOCKED JOB`
5. `WORK COMPLETED / WHAT CHANGED`
6. `EVIDENCE / VERIFICATION`
7. `WHERE WE ARE GOING`
8. `EXACT NEXT STEP`

### CONTINUATION

Required headings, in order:

1. `CONTROL`
2. `STATUS`
3. `WORK COMPLETED`
4. `EVIDENCE / RESULT`
5. `BLOCKER`
6. `EXACT NEXT STEP`

`CONTROL` must contain exactly one value for `RESPONSE CLASS`, `CONTRACT`, `AUTHORITY`, `OWNER LANE`, `OBJECTIVE`, and `READINESS`. `READINESS` is one of `CHAT READY`, `CHAT READY WITH DECISION`, or `NOT READY`.

## Controller enforcement

`control-gateway/src/chat-response-governor.js` validates exact response structure and authority/lane/objective binding and creates a content-addressed compliance receipt.

`control-gateway/src/chat-governed-mutation-admission.js` must validate/create that receipt before delegating to the existing GitHub mutation-admission gate. Malformed or missing response text must never reach the base mutation gate.

Raw GitHub/A-01 mutation routes remain separately authorized automation infrastructure and are not evidence that a ChatGPT-originated request complied. ChatGPT development instructions must route interactive mutations through the chat-governed path rather than directly through a raw mutation connector.

## Failure behavior

Fail closed for missing response text, missing/extra/reordered required sections, wrong response class, wrong contract, wrong authority, wrong owner lane, wrong objective, invalid readiness, tampered response, tampered receipt, or stale receipt. Preserve automation paths only under their own non-chat authority.

## Platform binding

The System Master Build Governor Skill carries the detailed workflow and output format. The System Master Project instruction is the always-on trigger requiring that Skill for substantive development turns. Installing/binding those ChatGPT-side controls requires an explicit user action in ChatGPT; repository code cannot silently change native Project instructions.
