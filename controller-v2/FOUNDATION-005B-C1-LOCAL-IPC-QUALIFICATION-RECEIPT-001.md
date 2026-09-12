# Controller Foundation-005B-C1 — Local IPC Qualification Receipt 001

Status: FROZEN / HOSTED-PORTABLE QUALIFIED
Stage: CONTROLLER-FOUNDATION-005
Tested exact subject: `97f4d1d5d7e8e56578ef17b37b411009a8a56794`
Qualified workflow: `Controller v2 Foundation` run `34680573845` / run number `241`
Lineage: C1-derived `controller-v2/foundation-005-c1-rebind`
Production activation standing: `BLOCKED_EXTERNAL_SETUP`

## Scope and evidence identity

This receipt records observational qualification of the exact source subject above. This receipt commit is later evidence metadata and is **not** part of the tested subject. No PASS is transferred to later bytes without exact-subject requalification.

Foundation-005 adds one authenticated **local live command-intake adapter** to the current C1-derived Node Controller. It does not replace Foundation-002D protected-Git durable/offline command authority, Foundation-002B semantic create-once/idempotency authority, or Foundation-004 process-ownership/recovery/READY authority.

## Exact-subject hosted cumulative matrix

Workflow run `34680573845` checked out exact subject `97f4d1d5d7e8e56578ef17b37b411009a8a56794` and completed successfully across the required matrix:

| Environment | Runtime | Result |
| --- | --- | --- |
| `ubuntu-latest` | Node 22 | PASS |
| `ubuntu-latest` | Node 24 | PASS |
| `windows-latest` | Node 22 | PASS |
| `windows-latest` | Node 24 | PASS |

The Ubuntu Node 22 job reports **327 tests, 327 pass, 0 fail, 0 skipped**. That run includes all **52 Foundation-005 qualification cases** (`F005-T001` through `F005-T052`) plus the inherited Controller foundation regression suite. POSIX-only endpoint cases are intentionally environment-specific on Windows; the full hosted matrix concluded success.

## Repair provenance

The immediately preceding implementation/test subject `726bafaf3b8d1032d4bb616cf0529e36697fc93d` exposed one qualification-harness defect in `F005-T043`: a deep-equality assertion compared a Node SQLite null-prototype result row with a plain object even though the two scalar values were correct. The repair at the qualified subject changed only that assertion to compare the two required scalar fields independently. It did not weaken command-count, transaction-count, OPEN-state, server-owned Controller-version, or server-owned policy-version requirements.

## Qualified bounded behavior

Within the hosted-portable environments exercised by the exact-subject matrix, the tested source demonstrates the following bounded behavior:

- local IPC uses `node:net` IPC rather than a TCP listener;
- endpoint identity is derived from canonical database identity plus current Controller instance identity and is not treated as authentication authority;
- local credentials require bounded key identifiers, 32..128-byte secrets and configured provenance labels;
- raw credential bytes are excluded from endpoint identity, protocol responses, Controller status and durable command state in the exercised tests;
- client authenticates the server before sending command bytes;
- server authenticates the exact request bytes using a fresh connection nonce;
- responses are authenticated and bound to both request and response digests;
- request framing is explicit and bounded under fragmented/coalesced byte streams;
- invalid UTF-8, malformed JSON, recursive duplicate object keys, excessive nesting, unknown fields and unsupported client-controlled authority fields fail closed before semantic mutation;
- local request projection is deterministic, including replay-stable `created_at` derived from UUIDv7 command identity rather than retry wall-clock time;
- frozen Foundation-002B `ControllerKernel.acceptCommand()` remains the only semantic create-once/fingerprint/idempotency authority;
- exact semantic replay returns the original transaction rather than creating a second transaction;
- same command ID with changed semantic content returns bounded `IDEMPOTENCY_CONFLICT`;
- a lost response after durable acceptance can be reconciled by exact replay;
- successful transport authentication supplies transport provenance only and never auto-admits or activates the transaction;
- accepted local commands remain `OPEN` pending later semantic policy/approval/admission authority;
- historical parent/relation request fields remain rejected rather than silently recreating unowned lineage semantics;
- local intake contains no provider mutation, scheduler, worker-dispatch, qualification-execution or promotion-execution path;
- Foundation-002D durable protected-Git ingress remains present and cumulatively green for restart/offline rediscovery, duplicate/lost wakeup tolerance and wakeup-as-hint behavior.

## Requirement closure standing

Recovered historical Foundation-005 requirement intent: **20/20 accounted; 0 unaccounted**.

Current C1-derived bounded Foundation-005 requirement/invariant denominator: **32/32 accounted; 0 unaccounted**.

Foundation-005 isolated qualification denominator: **52/52 represented and passing on the environment(s) applicable to each case**, with the entire required Ubuntu/Windows × Node 22/24 cumulative matrix successful for the exact tested subject.

## Authority boundaries preserved

Foundation-005 does not own or infer:

- human identity, delegated authority or author approval;
- dangerous-command semantic approval;
- transaction admission policy;
- worker/scheduler/lane dispatch;
- qualification or promotion authority;
- GitHub/provider mutation authority;
- CORE, LEARNING, BOOK or DOCUMENTS specialist semantics or owner controls.

The local HMAC credential proves possession of a configured transport credential only. Later identity/delegation/policy/admission layers remain responsible for semantic authorization.

## Evidence boundaries / blockers

The following remain explicitly unclaimed:

- production Controller activation; standing remains `BLOCKED_EXTERNAL_SETUP`;
- production secret custody, rotation and revocation operations;
- Windows production named-pipe DACL/service-account hardening;
- hostile same-user-process isolation;
- prevention of arbitrary direct SQLite writes by a process already holding filesystem authority;
- network-filesystem, SMB/NFS, container-volume or multi-host IPC/SQLite semantics;
- A-01 execution;
- native iPhone/device qualification;
- real human identity/delegation/approval evidence;
- real GitHub/provider production execution authority;
- real sudden-power-loss durability.

## Freeze decision

RECOVER: PASS
INVENTORY: PASS
ANALYZE: PASS
TARGETED RESEARCH: PASS
ADJUDICATE: PASS
DESIGN-LOCK: PASS
BUILD: PASS
ISOLATED QUALIFICATION: PASS
CUMULATIVE REGRESSION/CALIBRATION: PASS — HOSTED PORTABLE
FREEZE: PASS — HOSTED PORTABLE
PRODUCTION ACTIVATION: `BLOCKED_EXTERNAL_SETUP`

## Dependency-valid successor

Do not descend into worker/scheduler/execution layers yet. Continue Controller foundation in dependency order.

Historical `controller-v2/foundation-006` currently carries only old lineage and must be treated as archaeology until recovered and rebound onto this C1-derived line.

Exact next operation: `CONTROLLER-FOUNDATION-006-C1-RECOVER-INVENTORY-ANALYZE-001`.
