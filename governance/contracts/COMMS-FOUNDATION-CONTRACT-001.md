# COMMS — Foundation Contract 001

**Capability** `C06` · **Owner** `SYSTEM_MASTER/CONNECTED_ACTIONS` · **Lane** `CONNECTED_ACTIONS`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `draft_message`, `reply`, `send_message`, `fetch_thread`, `classify_message`. Sending requires explicit user authority, recipient/thread identity and stable message idempotency identity.

## 2. Ingress routes

User-authorized Chat/Automation request or provider-delivered message event. CONNECTED_ACTIONS admits provider reads and every external send/reply mutation.

## 3. Egress routes

Draft/message/thread data, classification, attachment refs, send receipts and typed provider failures.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/CONNECTED_ACTIONS`. Comms service writes local consent/action ledger, message/thread refs and delivery state.
**Physical persistence:** External messaging/mail provider is canonical writer for remote mailbox/message state; CORE stores local evidence/artifacts.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- PLUGINS/CONNECTED_ACTIONS.
- CHAT/CORE.
- FILE/DOCUMENTS for attachments.
- AUTOMATION/PROGRAMMING.

## 6. Failure semantics

Fail closed on missing send authority, recipient/thread ambiguity, provider auth/permission failure, attachment failure or unknown delivery state. Drafting may succeed without sending. Retries reuse `idempotency_key`; unknown send outcomes require provider reconciliation before retry.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/comms-foundation-001.json`.
Required contents: `C06`, `COMMS`, owner `SYSTEM_MASTER/CONNECTED_ACTIONS`, current authority/crosswalk identifiers, exact subject Git blobs, draft/read/send/reply route coverage, consent/provider/writer/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js COMMS`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js COMMS`.
PASS requires draft/read/send/reply cases, no-send-without-authority, attachment failure, delivery reconciliation and idempotent retry proof.

## 9. Authority boundary

`SYSTEM_MASTER/CONNECTED_ACTIONS` owns communication action policy and user authorization. Provider owns remote message state; BOOK/CORE/other peers may supply content intent but cannot send directly.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/provider/user-auth qualification and Foundation evidence remain open until implementation acceptance passes and a current receipt is admitted.
