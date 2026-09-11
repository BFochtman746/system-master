# CONTROLLER-FOUNDATION-002C-C1 — Production Control-State Activation Closure Gate

Status: **IMPLEMENTED / TARGETED PORTABLE QUALIFICATION PASS / LIVE PRODUCTION ACTIVATION BLOCKED_EXTERNAL_SETUP**

Parent freeze: `CONTROLLER-FOUNDATION-002C` document freeze commit `040947b8ac82e78071caa34d3de2e484d8e9be81`.

Frozen qualified 002C code subject: `8b0f9517570fa29f3f09bc7f1db38c34fcbe84fa`.

## Purpose

Close the semantic gap between “the 002C GitHub durable-journal implementation is qualified” and “this exact external GitHub control-state installation is admissible as production Controller authority.”

C1 does **not** rewrite 002C, provision GitHub administration, or promote `system-master` into controller state. It composes the already-qualified 002C authoritative constructor and emits one deterministic, content-addressed activation standing only after the runtime has passed the frozen preflight and durable-byte verification path.

## Authority rule

Production Controller control-state authority is admissible only when all of the following are simultaneously true:

1. the exact frozen 002C qualified subject is bound;
2. the runtime reports `authoritative:true`, meaning the qualified authority preflight passed;
3. System Master subject repository and control-state repository are distinct;
4. the control-state repository is bound by stable numeric repository ID;
5. journal and anchor refs are distinct;
6. journal and anchor GitHub App principals are distinct;
7. journal replay verification and the durable checkpoint document agree exactly on `{size, head_digest}`;
8. the observed journal transport revision is an immutable Git object ID;
9. anchor count and anchor-extension standing agree;
10. if an anchor exists, its checkpoint is not ahead of the verified journal;
11. the control-state genesis Git object ID is bound into the closure standing.

Failure of any item blocks activation. No warning-only activation state exists.

## Implementation

`src/control-state-activation-closure.js`

Exports:

- `CONTROLLER_FOUNDATION_002C_QUALIFIED_SUBJECT`
- `CONTROL_STATE_ACTIVATION_PROTOCOL`
- `summarizeQualifiedControlStateActivation(runtime, options)`
- `closeQualifiedControlStateActivation(options)`

`closeQualifiedControlStateActivation` invokes the qualified `createAuthoritativeGitHubControlState` constructor exactly once, then converts the verified runtime standing into a canonical activation state.

The canonical state binds:

- protocol version;
- exact qualified 002C subject;
- genesis SHA;
- subject repository;
- control-state repository and stable numeric ID;
- journal/anchor branches;
- journal/anchor GitHub App identities;
- verified journal transport revision;
- verified journal size and head digest;
- anchor count, anchored standing and latest anchor digest when present.

`activation_fingerprint` is SHA-256 over canonical JSON for that state. Re-evaluating the exact same authority state yields the exact same fingerprint.

## Why this is a child closure instead of a 002C rewrite

002C is already reference-qualified and frozen. Its hosted qualification proved the journal, anchor, App-token, protection-preflight, bootstrap, failure, rate-limit, lost-ack and integration semantics. C1 therefore adds no new journal protocol and no new authority substrate. It closes only the production-admission composition boundary.

This preserves evidence lineage:

`002B qualified transaction kernel -> 002C qualified GitHub durability -> 002C-C1 activation closure -> 002D durable ingress`

## Targeted qualification

Local isolated Node qualification executed against the C1 module contract:

- tests: **11**
- passed: **11**
- failed: **0**

Covered cases:

1. deterministic content-addressed activation fingerprint;
2. verified empty/genesis authority before first anchor;
3. wrong 002C qualified subject rejected;
4. non-authoritative runtime rejected;
5. subject/control repository collision rejected;
6. shared journal/anchor GitHub App principal rejected;
7. verified checkpoint versus durable checkpoint mismatch rejected;
8. mutable/invalid transport revision rejected;
9. anchor count/standing disagreement rejected;
10. anchor checkpoint ahead of journal rejected;
11. closure invokes the qualified 002C authoritative constructor exactly once.

This is targeted C1 qualification, not a claim that the entire repository test denominator was re-executed in this chat environment.

## External activation blocker remains real

The production control-state installation still requires external GitHub administration that is not available through the current connector:

1. create the dedicated control-state repository;
2. create explicit journal and anchor refs using the privileged provisioner;
3. activate the frozen layered rulesets;
4. install/configure separate Journal and Anchor GitHub Apps;
5. inspect effective rulesets and bypass actors with privileged authority;
6. run authoritative preflight against the actual repository ID, refs, principals and protection bytes;
7. construct the writable runtime and execute C1 against the real installation.

Until those facts exist, C1 code is qualified but live production activation remains `BLOCKED_EXTERNAL_SETUP`.

No branch or state inside `BFochtman746/system-master` is reclassified as production controller authority by C1.

## Closure standing

- 002C qualified implementation: **PRESERVED / UNMODIFIED**
- 002C-C1 activation closure code: **IMPLEMENTED**
- targeted C1 portable qualification: **PASS 11/11**
- production external installation evidence: **NOT PRESENT**
- production activation: **BLOCKED_EXTERNAL_SETUP**

## Exact successor

`CONTROLLER-FOUNDATION-002D — DURABLE COMMAND INBOX + CHAT-TO-CONTROLLER INGRESS`

002D consumes the frozen 002B transaction/idempotency kernel, the frozen 002C GitHub durability substrate, and this C1 fail-closed activation boundary. It must preserve the rule that notifications/wakeups are hints only and never become command authority.
