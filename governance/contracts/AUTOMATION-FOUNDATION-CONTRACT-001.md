# AUTOMATION — Foundation Contract 001

**Capability** `C01` · **Owner** `SYSTEM_MASTER/PROGRAMMING` · **Lane** `PROGRAMMING`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `define_workflow`, `validate_workflow`, `execute_workflow`, `resume_workflow`, `cancel_workflow`. Inputs include workflow definition/ref, trigger context, authority scope and idempotency identity; outputs are execution state/results, artifacts/events, action requests, evidence or typed failure.

## 2. Ingress routes

Chat request, scheduled trigger, approved internal event or owner-authorized control request. PROGRAMMING admits workflow semantics; external actions require CONNECTED_ACTIONS authorization.

## 3. Egress routes

Workflow result, durable execution state, internal event, artifact refs and CONNECTED_ACTIONS action requests. Cross-owner work is emitted as typed requests rather than direct writes.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/PROGRAMMING`. Automation service writes workflow definitions, execution graph/state, retry/cancellation state and workflow-version metadata.
**Physical persistence:** CORE supplies durable execution/evidence primitives, leases/fencing and artifacts without becoming workflow semantic owner.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- PROJECTS/CORE for project/workspace context.
- PLUGINS/CONNECTED_ACTIONS for authorized external actions.
- CODE/PROGRAMMING for code-bearing steps.

## 6. Failure semantics

Fail closed on invalid workflow graph, missing authority, dependency failure, lease/fencing conflict, rejected canonical write or unknown external-action outcome. Resume only from committed checkpoints. Retries reuse `idempotency_key`; duplicate triggers must recover the same execution or return a typed conflict without duplicating side effects.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/automation-foundation-001.json`.
Required contents: `C01`, `AUTOMATION`, owner `SYSTEM_MASTER/PROGRAMMING`, current authority/crosswalk identifiers, exact subject Git blobs, trigger/execute/resume/cancel coverage, writer/fencing/dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js AUTOMATION`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js AUTOMATION`.
PASS requires workflow validation, trigger dedupe, checkpoint resume, cancellation, dependency failure, external-action boundary, writer isolation and idempotent replay proof.

## 9. Authority boundary

`SYSTEM_MASTER/PROGRAMMING` owns automation/workflow semantics. CORE owns shared runtime/A-01/leases/durability; CONNECTED_ACTIONS owns external side-effect authorization; peer systems own their domain mutations.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/external qualification and Foundation evidence remain open until implementation acceptance passes and a current receipt is admitted.
