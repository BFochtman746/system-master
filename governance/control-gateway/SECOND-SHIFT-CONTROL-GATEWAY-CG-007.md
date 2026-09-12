# SECOND-SHIFT-CONTROL-GATEWAY-CG-007 — VALIDATOR CLOSURE / CODE-ROUTING-SCHEMA-CONTRACT-DEPENDENCY GATE + HOST QUALIFICATION

Status: **HOST QUALIFIED / DEVELOPMENT FROZEN / GITHUB ADMISSION CLOSED FOR CG-007 / PRODUCTION NOT ACTIVATED**  
Mission authority: `SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0`  
Exact predecessor governance freeze: `a4b2e078ae2231242978e23b724ee27bf11f1d90`  
Start commit: `ecb7a994de910d311194e120fe69beb35c986de2`  
Code branch: `second-shift-control-gateway/cg-007-validator-closure`  
Exact qualified implementation subject: `51a0976f2f3265702e6005a36d70f9e9f240ad63`  
Host qualification run: `34669882162`  
Development state revision: `6`  
Development state head: `a1893b5b4df5394fe34abba0e39c8cb921e948cf`

## 1. Closure statement

CG-007 closes the host-qualified validator boundary for ChatGPT-originated work before GitHub/A-01 progression. Changed artifacts must carry deterministic evidence for every required validation family: CODE, ROUTING, SCHEMA, CONTRACT, and DEPENDENCY. Validation is bound to the recovered durable workstream, operation, predecessor receipt, authority epoch, publication commit, packet digest, repository, allowed path scope, and recovery digest. Authority movement during validation fails closed.

CG-007 also closes `CG006-B001` by adding a dedicated create-only successor-ref admission/execution contract. A successor ref may be created only for the exact recovered `START_SUCCESSOR`, only at an operation-derived branch name, only while the target ref is absent, and only at the exact recovered governance freeze SHA. A stale grant or changed target fails closed. An ambiguous create is accepted only after reread proves the exact admitted ref exists at the exact admitted base SHA.

This is a development/host qualification closure. It does not activate production A-01 execution or waive mandatory actual A-01 Windows qualification.

## 2. Implemented surface

CG-007 adds:

- `control-gateway/src/validator-closure.js`
- `control-gateway/src/successor-ref-admission.js`
- `control-gateway/test/validator-closure.test.js`
- `control-gateway/test/successor-ref-admission.test.js`
- `control-gateway/contracts/cg007-validation-contracts.json`
- `.github/workflows/second-shift-control-gateway-cg-007.yml`

Protocols:

- `control-gateway.validator-request.v1`
- `control-gateway.validator-receipt.v1`
- `control-gateway.successor-ref-request.v1`
- `control-gateway.successor-ref-admission.v1`
- `control-gateway.successor-ref-execution.v1`

## 3. Validator closure

### CODE

Code evidence must bind the exact artifact digest and prove syntax, static analysis, and tests all PASS.

### ROUTING

Routes must be gateway-enforced and may not declare a direct bypass. Ownership is explicit:

- `GITHUB_MUTATION`: Control Gateway authority, GitHub executor, no scheduler.
- `A01_EXECUTION`: Control Gateway authority, A-01 Supervisor executor and scheduler.
- `HOST_QUALIFICATION`: Control Gateway authority, GitHub Actions executor and scheduler.

### SCHEMA

Schema evidence must be strict, reject unknown fields, and pass validation.

### CONTRACT

Contract compatibility must pass. Referenced schema IDs and route IDs must exist in the same validated evidence set.

### DEPENDENCY

Dependencies must resolve to durable receipts whose operation identity matches, whose outcome is `SUCCEEDED`, and whose `satisfies_dependency` value is true. The current predecessor receipt is independently verified the same way.

## 4. Successor-ref admission closure

`CG006-B001 — SUCCESSOR_BRANCH_CREATION_ADMISSION` is CLOSED at the host-qualified control-contract level.

The successor-ref gate requires:

1. exact mission/workstream/epoch/recovery/publication binding;
2. exact recovered `START_SUCCESSOR` operation and predecessor receipt;
3. qualified predecessor authority and non-denied/non-stale GitHub standing;
4. deterministic branch prefix derived from the successor operation ID;
5. exact recovered governance freeze head as the base SHA;
6. target ref absent before and after authority recheck;
7. fresh recovery contract immediately before execution;
8. create-only semantics;
9. post-create reread proving exact target SHA;
10. ambiguous network-create recovery only when the exact admitted ref/base is observed.

No force update or existing-ref mutation is authorized by this contract.

## 5. Host qualification

Run `34669882162` checked exact subject `51a0976f2f3265702e6005a36d70f9e9f240ad63` on Node 22 and Node 24.

Both runtimes passed:

- JavaScript syntax check: PASS
- machine contract registry parse: PASS
- test suite: 131 total / 128 pass / 0 fail / 3 environment-dependent skips

The three skips are inherited live-environment tests whose external qualification environment is not configured in this host workflow. They are not converted into passes and do not constitute A-01 qualification.

## 6. A-01 enforcement cross-check

Existing `A-01 Control Plane Enforcement` run `34669882127` failed for the already-known direct-route blocker:

`.github/workflows/second-shift-supervisor-v2-a01-windows-stress.yml` is a direct self-hosted workflow that is not registered through `.github/workflows/a01-control-plane-gateway.yml`.

The topology validation and enforcement self-test passed before that scan rejection. Therefore this is classified as an A-01 supervisor/routing integration blocker, not a failure of the CG-007 host validator implementation.

## 7. Durable terminal state

Revision 6 records:

- authority epoch `7`
- authoritative subject `51a0976f2f3265702e6005a36d70f9e9f240ad63`
- authority rebind receipt `SECOND-SHIFT-CONTROL-GATEWAY-CG-007-HOST-QUALIFICATION-34669882162`
- CG-007 state `TERMINAL`
- qualification state `PASSED`
- GitHub admission state `ADMITTED`
- A-01 state `NOT_REQUIRED`
- packet digest `29b09bc68c50ea5ab8b9d35bb47e0122f8824c2686a823d3615f7cd3153d0c9e`
- publication digest `636c0f8844991bcb644ff31098d2a61270fd7646f702af09f7ce7581c3f47116`

## 8. Remaining production blockers

1. `A01-LEGACY-DIRECT-STRESS-ROUTE` remains OPEN and is handed to CG-008 Supervisor Integration.
2. Actual A-01 Windows shadow/canary/fault qualification remains mandatory before production activation.
3. Host qualification does not equal `A01-QUALIFIED` or `PRODUCTION-ACTIVATED`.

## 9. Exact successor

`SECOND-SHIFT-CONTROL-GATEWAY-CG-008 — SUPERVISOR INTEGRATION / A-01 ADMISSION + ORDERING HANDOFF + HOST QUALIFICATION`

Exact predecessor receipt:

`SECOND-SHIFT-CONTROL-GATEWAY-CG-007-HOST-QUALIFICATION-34669882162`

CG-008 must integrate the A-01 supervisor behind the Control Gateway admission/order boundary, eliminate the known direct self-hosted route, and preserve the rule that A-01 Supervisor is the single local execution/scheduling authority for admitted A-01 work.
