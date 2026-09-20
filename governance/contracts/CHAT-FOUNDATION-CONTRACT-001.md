# CHAT — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Lane** CORE · **Effective** 2026-09-15  
**Authority** `governance/CURRENT-AUTHORITY.json` → `CURRENT-AUTHORITY-005` / Topology 007  
**Response governor** `SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001`  
**Standing** IMPLEMENTED_ON_C04_BRANCH / LOCAL_NEGATIVE_QUALIFICATION_PASS / REPOSITORY_AND_A01_EVIDENCE_PENDING

## Known from the census

- **Module name:** Chat / Conversational Workspace
- **Interaction direction:** `PRIMARY_SYSTEM_MASTER_WORKING_SURFACE`
- **Owner:** `SYSTEM_MASTER/CORE`
- **Foundation objective:** `FOUNDATION-1-0-CLOSURE-001`
- Prior CHAT-001A/SMR019 evidence remains exact-subject historical/current evidence for its own boundary. This contract does not transfer that PASS to changed response-governor bytes.

## 1. Contract / interface

C04 exposes the shared development-chat control surface used while System Master is being built.

Named operations:

1. `validateDevelopmentResponse(responseText, responseClass)` — validates a substantive build response against the versioned `FULL` or `CONTINUATION` schema.
2. `issueDevelopmentResponseReceipt(responseText, responseClass, authorityContext)` — issues a deterministic PASS receipt only after exact response validation.
3. `verifyDevelopmentResponseReceipt(responseText, receipt, authorityContext)` — revalidates the exact response bytes, contract digest, receipt digest, and current authority context.
4. `GovernedGitHubMutationAdmissionGate.admit(...)` — refuses GitHub mutation admission without a current valid response receipt, then delegates to the existing raw GitHub admission gate.
5. `admitGovernedA01Execution(...)` — refuses A-01 execution admission without a current valid response receipt, then delegates to the existing A-01 admission logic.
6. `buildGovernedA01SupervisorHandoff(...)` — preserves the response-receipt chain through A-01 supervisor handoff.

The machine-readable response schemas are in `governance/contracts/SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001.json`.

C04 does **not** provide authority to intercept an already-rendered native ChatGPT UI message, create architecture, cross peer-owner lanes, synthesize human/private/native/external authority, or transfer qualification across changed subjects.

## 2. Ingress routes

1. **Native ChatGPT development ingress** — the System Master ChatGPT Project instruction loads the `system-master-build-governor` Skill and requires every substantive build response to be `FULL` or `CONTINUATION`.
2. **Controller response ingress** — exact UTF-8 response text, response class, and controller-derived current authority context enter `development-response-governor.js`.
3. **GitHub mutation ingress** — a normal `github-mutation-admission` request may proceed only through `GovernedGitHubMutationAdmissionGate` with the exact response text and PASS receipt.
4. **A-01 execution ingress** — a normal A-01 admission request may proceed only through `admitGovernedA01Execution` with the exact response text and PASS receipt.

Admission authority remains the existing repository/current-authority, GitHub mutation, A-01, owner-lane, human/private/native/external, and production authority chain. C04 adds response compliance; it does not replace those authorities.

## 3. Egress routes

1. A native ChatGPT substantive development response rendered as either `FULL` or `CONTINUATION`.
2. `control-gateway.development-response-receipt.v1`, binding the contract digest, response class, exact response digest, current authority-context digest, PASS decision, and receipt digest.
3. `control-gateway.governed-github-admission.v1`, carrying the response receipt and the existing raw GitHub admission receipt.
4. `control-gateway.governed-a01-admission.v1`, carrying the response receipt and the existing raw A-01 admission receipt.
5. `control-gateway.governed-a01-supervisor-handoff.v1`, carrying the response-receipt digest through the A-01 supervisor handoff boundary.

No GitHub/A-01 side effect is authorized merely because a response was rendered.

## 4. Persistence and canonical writer

The canonical durable definition of the development-response contract is the versioned Git repository object `governance/contracts/SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001.json`, changed only through the repository's admitted Git/PR path.

The ChatGPT Project instruction is canonically represented by `governance/chat/SYSTEM-MASTER-PROJECT-INSTRUCTION-001.md`; repository presence is not proof that it has been installed in the ChatGPT Project.

Development response receipts are immutable evidence objects carried in governed admission envelopes. They do not create a second canonical project-state writer. Any durable publication of those receipts must use the existing controller evidence/active-work publication path; C04 does not introduce an independent state store.

A write arriving outside the admitted repository/controller writer path is rejected or treated as non-authoritative evidence.

## 5. Dependencies

- `governance/CURRENT-AUTHORITY.json` and its selected owner/topology/job/completion records — current execution truth.
- `governance/CHATGPT-OPERATING-CONTRACT-002.md` and owner-chat startup contracts — repository-grounded chat operating rules.
- `governance/chat/SYSTEM-MASTER-PROJECT-INSTRUCTION-001.md` — native ChatGPT Project binding text.
- `system-master-build-governor` Skill — reusable ChatGPT response-generation workflow.
- `control-gateway/src/github-mutation-admission.js` — existing raw GitHub admission authority.
- `control-gateway/src/a01-supervisor-handoff.js` — existing raw A-01 admission/handoff authority.
- `control-gateway/src/active-work-state.js` — canonical hashing/current durable authority primitives used by the control gateway.

These dependencies remain semantically owned by their current owners. C04 consumes them without ownership transfer.

## 6. Failure semantics

C04 is fail-closed for governed build execution.

- Missing receipt → `RESPONSE_RECEIPT_REQUIRED`; no raw GitHub/A-01 authorization call.
- Missing/duplicate/out-of-order required heading → response invalid; no PASS receipt.
- Empty required section or incomplete exact-next-step boundary → response invalid; no PASS receipt.
- Unknown/stale contract or contract digest → receipt invalid.
- Exact response bytes changed after receipt issue → `RESPONSE_RECEIPT_RESPONSE_MISMATCH`.
- Current authority context changed → `RESPONSE_RECEIPT_AUTHORITY_MISMATCH`.
- Receipt payload changed → receipt digest mismatch.
- Raw GitHub/A-01 authority later refuses execution → C04 does not override it.

Validation is deterministic and idempotent for the same exact response, contract version, and authority context. Reissuing against changed response or authority produces a different digest and requires fresh validation.

## 7. Evidence target

Required repository evidence:

- `control-gateway/src/development-response-governor.js`
- `control-gateway/src/governed-execution-admission.js`
- `control-gateway/src/development-response-production-enforcement.js`
- `control-gateway/test/development-response-governor.test.js`
- `control-gateway/test/governed-execution-admission.test.js`
- `control-gateway/test/development-response-production-enforcement.test.js`
- `.github/scripts/development-response-governor-qualify.js`
- `governance/contracts/SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001.json`
- `governance/chat/SYSTEM-MASTER-PROJECT-INSTRUCTION-001.md`

Required external/runtime evidence before final C04 closure:

1. repository CI PASS on the exact C04 branch/head, including `development-response-governor-qualify.js` under canonical `verify.sh`;
2. exact-subject A-01 qualification when required by current Foundation evidence policy;
3. installation/activation evidence for the System Master ChatGPT Project instruction and Build Governor Skill if claiming native ChatGPT response governance is active.

## 8. Acceptance target

From repository root:

```bash
node --test \
  control-gateway/test/development-response-governor.test.js \
  control-gateway/test/governed-execution-admission.test.js \
  control-gateway/test/development-response-production-enforcement.test.js
```

Repository Required Verification must also execute:

```bash
node .github/scripts/development-response-governor-qualify.js
```

PASS requires zero failed tests, a non-vacuous positive test count, and explicit negative coverage proving:

- ordinary unstructured chat prose cannot issue a PASS response receipt;
- missing required sections cannot issue a PASS response receipt;
- tampered response bytes, stale authority context, and tampered receipts fail closed;
- missing/malformed response evidence is rejected before raw GitHub mutation admission;
- missing/malformed response evidence is rejected before raw A-01 admission/handoff;
- production control-gateway source has no unapproved raw-admission bypass detected by the enforcement audit.

Foundation/C04 completion still requires the current repository evidence policy and matrix generator; local PASS alone is not product/Foundation completion.

## 9. Authority boundary

C04/CORE may decide and implement shared ChatGPT development-response formatting, response compliance validation, response receipts, shared controller admission wrapping, and shared chat/controller evidence interfaces.

Owner/human authority is required for:

- changing peer semantic ownership or topology;
- treating a peer/product as complete;
- installing/changing ChatGPT Project instructions or Skills in the user's ChatGPT account when no connected product-control tool exists;
- credentials, private data, native-device evidence, publication/production release, external-provider side effects, or other human/external authority;
- weakening existing GitHub/A-01 admission, lease, branch, qualification, evidence, or exact-subject requirements.

The development-response receipt is tamper evidence inside the trusted controller boundary. It is not an identity signature and does not itself grant GitHub, A-01, production, or human authority.

## 10. Open gaps

- The Build Governor Skill package is locally created and validated but must be installed in the System Master ChatGPT Project before native ChatGPT Project governance can be claimed active.
- `SYSTEM-MASTER-PROJECT-INSTRUCTION-001.md` must be copied/bound into the actual ChatGPT Project instructions; repository presence alone is insufficient.
- Exact branch/repository CI and any current-authority-required A-01 evidence must pass before C04 is promoted from `ACTIVE_GAP` to evidence-backed closure.
- If the production bypass audit identifies an existing raw controller call site, that call site must be migrated to the governed entry point before C04 closure.
