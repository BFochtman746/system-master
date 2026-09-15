# CHAT — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Lane** CORE · **Effective** candidate under `CURRENT-AUTHORITY-005`
**Capability** `C04` / `CHAT`
**Runtime contract** `governance/SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001.md`

## Known from the census

- **Module name:** Chat / Conversational Workspace
- **Interaction direction:** PRIMARY_SYSTEM_MASTER_WORKING_SURFACE
- **Foundation standing:** `ACTIVE_GAP` until current-authority exact-subject evidence is registered.

## 1. Contract / interface

CHAT provides a governed development-response interface for System Master work. It accepts substantive development context plus live repository authority and returns either a FULL or CONTINUATION response conforming to `SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001`.

For ChatGPT-originated mutation work, CHAT additionally provides a controller-created response-compliance receipt bound to the exact response digest, contract digest, live authority ID, owner lane, objective and readiness.

CHAT does not grant product completion, cross-lane semantic authority, A-01 PASS, external/user side-effect authority, or the ability for repository code to intercept arbitrary native ChatGPT UI output.

## 2. Ingress routes

1. **Native ChatGPT development turn** — admitted by the System Master Project instruction and Build Governor Skill; live authority is recovered from GitHub before substantive state/execution claims.
2. **Chat-governed mutation request** — admitted by `control-gateway/src/chat-governed-mutation-admission.js`, which validates the response before delegating to existing GitHub mutation admission.
3. **Automation-only controller work** — remains outside ChatGPT-response admission and must carry its own existing automation authority; it may not be relabeled as ChatGPT to bypass this contract.

## 3. Egress routes

1. User-visible FULL or CONTINUATION development response.
2. Content-addressed response-compliance receipt for a ChatGPT-originated mutation.
3. Delegated existing GitHub mutation-admission receipt only after response compliance passes.
4. Qualification evidence from local/hosted/A-01 execution as separately earned.

## 4. Persistence and canonical writer

Repository authority remains canonical under `governance/CURRENT-AUTHORITY.json`; chat history is not canonical project state.

The controller is the only writer of response-compliance receipts. Receipts are immutable evidence bound to exact response bytes/digest and must travel with the mutation-admission evidence when preserved. A client-supplied `PASS` string or self-authored receipt is not authoritative.

Project instruction and Skill bytes are versioned artifacts. Installing them into ChatGPT requires explicit user action and does not mutate repository authority.

## 5. Dependencies

- `P00` current authority pointer and selected live owner state.
- `P02` current obligation/objective selection.
- `P03` evidence retention for durable qualification/admission evidence.
- `P06` control-gateway dispatch/admission.
- `P07` A-01 admission barrier where A-01 is required.
- Existing GitHub mutation-admission gate for repository mutation safety.
- System-file lease/claim controls where governed paths require single-writer fencing.
- System Master Build Governor Skill + Project instruction for ChatGPT-side generation governance.

No dependency transfers semantic ownership from the selected owner lane.

## 6. Failure semantics

ChatGPT-originated mutation admission is fail-closed for missing response text; malformed, missing, extra or reordered sections; invalid response class/readiness; stale/wrong contract; wrong authority, owner lane or objective; tampered response/receipt; or stale receipt.

The response compliance check runs before the base mutation gate. A malformed response therefore produces zero base-gate mutation admission calls.

Idempotency is content-addressed: identical normalized response bytes under identical bound context produce the same response digest; receipts additionally bind issuance time and receipt digest. Retrying a rejected malformed response does not grant authority unless a new compliant response is produced.

## 7. Evidence target

Required evidence bundle:

- exact commit SHA containing this contract, response-governor runtime, chat-governed admission wrapper, schemas and tests;
- test output proving compliant FULL/CONTINUATION acceptance;
- negative test proving an ordinary malformed ChatGPT response cannot reach the base mutation gate;
- tamper/staleness/wrong-authority/wrong-lane negative tests;
- hosted and A-01 exact-subject receipts when required by Foundation closure evidence policy;
- explicit record that Project instruction/Skill binding is user-installed before claiming native ChatGPT governance is active.

## 8. Acceptance target

Local executable qualifier:

`cd control-gateway && node --test test/chat-response-governor.test.js test/chat-governed-mutation-admission.test.js`

PASS requires zero failures and must include the negative case `ordinary malformed response cannot authorize GitHub/A-01 mutation`, with the fake/base mutation gate call count remaining zero.

Foundation `C04` is not COMPLETE_WITH_EVIDENCE from local PASS alone. Current-authority exact-subject evidence must be registered and the Foundation matrix regenerated under the normal qualification path.

## 9. Authority boundary

CORE may define and enforce shared Chat development-response mechanics, receipts, controller admission order and Foundation evidence for C04.

CORE may not take LEARNING, BOOK, DOCUMENTS, SPREADSHEET_DATA, MEDIA, CONNECTED_ACTIONS, RESEARCH_KNOWLEDGE or PROGRAMMING product semantics; may not infer user/external/native/publication/production authority; and may not claim native ChatGPT Project/Skill settings changed until the user performs that explicit product-side action.

## 10. Open gaps

1. Promote `CHAT-LANE-OPERATING-PROMPT-003` through normal current-authority transition after qualification; do not mutate current authority merely because the candidate exists.
2. Install the packaged System Master Build Governor Skill and bind `SYSTEM-MASTER-PROJECT-INSTRUCTION-001` in the ChatGPT System Master development Project.
3. Run repository-hosted qualification and exact-subject A-01 qualification required for C04 evidence.
4. Register the resulting current-authority evidence receipt and regenerate the Foundation matrix. Until then C04 remains `ACTIVE_GAP`.
