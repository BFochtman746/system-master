# CALENDAR - Foundation Contract 001

**Capability** `C03` - **Owner** `SYSTEM_MASTER/CONNECTED_ACTIONS` - **Lane** CONNECTED_ACTIONS - **Effective** 2026-09-13
**Authority** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Foundation implementation** `CALENDAR-FOUNDATION-1.0`

> **Foundation 1.0 implementation accepted for deterministic local calendar-action intent artifacts only.** This foundation does not grant provider API access, network access, account or credential authority, calendar write authority, invitation sending, notifications, synchronization, native-device authority, or any other external side effect.

## Known from current authority

- C03 CALENDAR is owned by `SYSTEM_MASTER/CONNECTED_ACTIONS` in capability crosswalk 003.
- CONNECTED_ACTIONS owns calendar intent/policy semantics; readiness does not grant external side-effect authority.
- Connector action runtime is separately represented by C27 PLUGINS after P14 absorption; C03 does not acquire provider-runtime ownership.
- Repository qualification is not production calendar authority.

## 1. Contract / interface

Provide a headless deterministic compiler/verifier for narrowly typed calendar mutation intents:

- implementation: `tools/calendar_action_plan.py`
- build: `python3 tools/calendar_action_plan.py build <calendar.json> <output>`
- verify: `python3 tools/calendar_action_plan.py verify <output>`
- input schema: `CALENDAR-ACTION-SPEC-1.0`
- output: `calendar-action-plan.json`, schema `CALENDAR-ACTION-PLAN-1.0`
- qualification: `python3 .github/scripts/calendar-foundation-qualify.py`
- representative corpus: `qualification/calendar/corpus/basic/calendar.json`
- CI: `.github/workflows/calendar-foundation-qualification.yml`

Foundation 1.0 admits `CREATE_EVENT`, `UPDATE_EVENT`, and `DELETE_EVENT` intent compilation. Every emitted action is explicitly marked `execution_permitted_by_foundation=false` and requires `SEPARATE_CALENDAR_RUNTIME_AND_USER_AUTHORITY_REQUIRED` before external execution.

The compiler validates bounded identifiers/text, explicit-offset timestamps, positive event durations, paired update start/end values, unique action IDs, current C03 ownership, a non-destructive output target, and a closed input schema. It emits a content-addressed local plan bound to current authority. It performs no live calendar read or write.

## 2. Ingress routes

- A caller supplies a local JSON calendar-intent document to the `build` command.
- The compiler reads `governance/CURRENT-AUTHORITY.json` and its selected capability crosswalk only to bind C03 ownership into the plan.
- The `verify` command accepts only a previously emitted local Foundation plan directory.
- No provider webhook, account session, remote calendar, credential, native calendar database, or external connector input is admitted by Foundation 1.0.

## 3. Egress routes

- `build` emits exactly one local `calendar-action-plan.json` artifact in a caller-selected new output directory.
- `verify` returns a local PASS/FAIL result without mutating the plan.
- qualification emits `qualification-output/calendar-foundation-1.0.json`.
- There is no provider API call, network request, calendar mutation, invitation delivery, notification, account change, synchronization, or other external side effect.

## 4. Persistence and canonical writer

`tools/calendar_action_plan.py` is the canonical writer for the Foundation 1.0 local calendar-action plan only. It refuses an existing output path, rejects symlink traversal for input/output paths, stages the plan in a sibling temporary directory, and promotes the completed directory with a filesystem rename. It does not overwrite or delete an existing caller artifact.

Actual provider calendar state is not written by this foundation. A future admitted calendar runtime/provider adapter must have its own canonical-writer and idempotency contract through the authorized connector/action boundary; C03 Foundation 1.0 does not claim that role.

## 5. Dependencies

- Python standard library only for the local compiler/verifier.
- `governance/CURRENT-AUTHORITY.json` for the current authority pointer.
- `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json` through the current authority pointer for C03 ownership.
- CONNECTED_ACTIONS for C03 calendar intent/policy semantics.
- C27 PLUGINS / an explicitly admitted external connector runtime for any future provider execution; that runtime is not a Foundation 1.0 dependency because this substrate never executes externally.

Foundation 1.0 has no package-manager, provider SDK, network, credential, account, native calendar, or external service dependency.

## 6. Failure semantics

Fail closed on malformed JSON, unknown top-level or action fields, unsupported action types, invalid or duplicate identifiers, missing required event fields, timestamps without a UTC offset, end times not after start times, partial update-time pairs, stale/incorrect C03 authority binding, symlink traversal, an existing output path, malformed plan hashes, altered plan schemas, tampering, or any attempt to escalate execution/user authority inside a rehashed plan.

For the same normalized source and authority state, compilation is deterministic and produces the same plan bytes and SHA-256. This is local artifact idempotency only; no claim is made about provider-side mutation idempotency because Foundation 1.0 performs no provider mutation.

## 7. Evidence target

The machine-readable evidence artifact is `qualification-output/calendar-foundation-1.0.json`. CI preserves it as the `calendar-foundation-1.0-evidence` artifact.

Required evidence includes the source identity, representative corpus path, qualification command, plan SHA-256, plan-file SHA-256, deterministic repeat-build result, tamper-detection result, current-authority binding result, admitted action types, and explicit denials for provider API, network, credentials, account, calendar write, invitation, notification, and external-side-effect authority.

A log line by itself is not acceptance evidence.

## 8. Acceptance target

Foundation 1.0 is accepted only when all of the following pass:

1. `python3 -m unittest tests.test_calendar_action_plan`
2. `python3 .github/scripts/calendar-foundation-qualify.py`
3. Independent builds of the representative corpus produce byte-identical plans and the same plan SHA-256.
4. Verification detects plan tampering and rehashed authority escalation.
5. Invalid timestamp/order/schema/identifier cases and symlinked input or output ancestors fail closed.
6. The CLI exposes no live calendar execution, provider-connect, sync, login, create, update, or delete command.
7. The emitted plan denies provider API, network, credential, account, calendar-write, invitation, notification, and external-side-effect authority.
8. `.github/workflows/calendar-foundation-qualification.yml` runs tests and qualification, verifies the committed Foundation census against the generator, and preserves machine-readable evidence.

Passing Foundation 1.0 closes the deterministic local calendar-intent substrate gap for C03. It does not prove or authorize a live Google Calendar, Apple Calendar, Exchange, CalDAV, or other provider integration.

## 9. Authority boundary

C03/CONNECTED_ACTIONS may define and validate local calendar intent/policy semantics inside the admitted owner boundary. The Foundation compiler may create and verify local plan artifacts only.

User action authority, provider/API access, credentials, accounts, external calendar reads/writes, invitations, notifications, synchronization, billing, native-device access, and production promotion remain separately required. C27 PLUGINS owns the absorbed connector action runtime platform responsibility; this C03 contract does not transfer that ownership.

Any future external calendar mutation must pass through an explicitly admitted runtime with separate user and provider authority and its own replay/idempotency evidence.

## 10. Remaining gaps after Foundation 1.0

- Live provider adapters and authenticated provider execution remain unimplemented and ungranted.
- Calendar reads, free/busy, incremental synchronization, conflict resolution, and provider replay/idempotency remain outside this substrate.
- Recurrence rules, all-day semantics, timezone-database semantics, attendees, invitations, reminders, attachments, and conferencing require separately admitted schemas/qualification before use.
- Native iOS calendar/EventKit integration requires native-device and user-permission evidence.
- Production account discovery, credential transport, provider quotas/rate limits, and operational observability remain separate authority-gated work.
