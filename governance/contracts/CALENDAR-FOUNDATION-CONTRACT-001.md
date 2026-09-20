# CALENDAR — Foundation Contract 001

**Capability** `C03` · **Owner** `SYSTEM_MASTER/CONNECTED_ACTIONS` · **Lane** `CONNECTED_ACTIONS`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `list_events`, `check_availability`, `create_event`, `update_event`, `delete_event`, `respond_invitation`. Mutations require explicit user authority and stable provider/event identity.

## 2. Ingress routes

User-authorized Chat/Automation request or provider event. CONNECTED_ACTIONS admits every calendar mutation.

## 3. Egress routes

Event/availability data, normalized provider refs, mutation receipts, invitation state and typed failures.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/CONNECTED_ACTIONS`. Calendar service writes local consent/action ledger and provider-reference state.
**Physical persistence:** Provider calendar is canonical writer for remote calendar state; CORE persists local evidence only. Provider state must be reconciled after mutation.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- PLUGINS/CONNECTED_ACTIONS.
- CHAT/CORE.
- AUTOMATION/PROGRAMMING.

## 6. Failure semantics

Fail closed on missing user authority, provider identity ambiguity, permission/auth failure, stale event version, dependency failure or unknown commit state. Retries reuse `idempotency_key`; provider mutations are not duplicated and unknown outcomes require read-back reconciliation.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/calendar-foundation-001.json`.
Required contents: `C03`, `CALENDAR`, owner `SYSTEM_MASTER/CONNECTED_ACTIONS`, current authority/crosswalk identifiers, exact subject Git blobs, read/mutation route coverage, consent/provider reconciliation/writer/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js CALENDAR`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js CALENDAR`.
PASS requires list/availability/create/update/delete/respond cases, permission denial, stale-write rejection, read-back reconciliation and idempotent mutation proof.

## 9. Authority boundary

`SYSTEM_MASTER/CONNECTED_ACTIONS` owns calendar action policy and user authorization. Provider owns remote calendar state; CORE owns local runtime/evidence. Other peers may request actions but cannot write provider state directly.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/provider/user-auth qualification and Foundation evidence remain open until implementation acceptance passes and a current receipt is admitted.
