# PLUGINS — Foundation Contract 001

**Capability** `C27` · **Owner** `SYSTEM_MASTER/CONNECTED_ACTIONS` · **Lane** `CONNECTED_ACTIONS`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `discover_connector`, `read_connector`, `invoke_connector`, `authorize_action`, `record_connector_result`. Invocations carry connector/action identity, permission scope, user authority, typed args and `idempotency_key`.

## 2. Ingress routes

Chat/Automation/peer-system request naming connector capability and user authority, or approved connector event. CONNECTED_ACTIONS admits all connector calls that can affect external systems.

## 3. Egress routes

Connector data/result, explicit action receipt, permission/error state, provider refs and immutable evidence reference.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/CONNECTED_ACTIONS`. Plugin service writes connection/permission/action ledger and provider-reference state.
**Physical persistence:** Remote provider is authoritative for provider-side state; CORE stores local evidence/connection metadata according to policy.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- CHAT/CORE.
- AUTOMATION/PROGRAMMING.
- FILE/DOCUMENTS for connector file payloads.

## 6. Failure semantics

Fail closed on missing permission, unsupported action/schema, provider auth failure, dependency failure, rate/availability failure or unknown commit state. Read-only and mutating actions remain distinct. Retries reuse `idempotency_key`; unknown mutation outcomes require provider reconciliation before replay.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/plugins-foundation-001.json`.
Required contents: `C27`, `PLUGINS`, owner `SYSTEM_MASTER/CONNECTED_ACTIONS`, current authority/crosswalk identifiers, exact subject Git blobs, discovery/read/invoke/authorize coverage, permission/provider/writer/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js PLUGINS`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js PLUGINS`.
PASS requires connector discovery/read plus authorized and denied mutation cases, schema errors, provider uncertainty reconciliation, writer isolation and idempotent replay.

## 9. Authority boundary

`SYSTEM_MASTER/CONNECTED_ACTIONS` owns connector invocation and side-effect policy. Other peers request actions through this interface but do not inherit permissions; provider owns remote state; CORE owns shared runtime/evidence.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/provider/user-auth qualification and Foundation evidence remain open until implementation acceptance passes and a current receipt is admitted.
