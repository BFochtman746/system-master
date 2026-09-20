# Capability Foundation Contract Base 001

Applies to every capability marked owned by the capability crosswalk selected through `governance/CURRENT-AUTHORITY.json`.

## Common request envelope

Every ingress request carries: `request_id`, `capability_id`, `operation`, `actor_authority`, `idempotency_key`, input/artifact references, options/constraints, and cancellation/deadline state. Owner-specific interfaces may add fields but may not remove authority or idempotency identity.

## Common response envelope

Every egress response carries: `request_id`, `capability_id`, typed `status`, result/artifact references, evidence reference, warnings, and a typed failure object when unsuccessful. Side effects must identify whether they were proposed, authorized, committed, or not attempted.

## Admission and routing

- Current authority, topology, crosswalk, and owner allocation are resolved through `governance/CURRENT-AUTHORITY.json`.
- The capability owner admits domain work. CORE retains shared runtime/A-01/durability controls.
- CONNECTED_ACTIONS alone owns user-authorized external side-effect policy.
- Cross-owner work crosses typed interfaces; no capability acquires another owner's write authority by dependency.

## Persistence rule

Each durable semantic record has one canonical owner/writer. CORE may provide physical storage, content-addressed artifact/evidence storage, transactions, leases, fencing, scheduling and recovery primitives without becoming semantic owner. Non-owner direct writes fail closed.

## Platform baseline

All programmed capabilities depend on applicable Foundation platform requirements P00-P12 and P15: authority, topology/ownership, obligations, evidence retention, content-addressed writes, schema validation, dispatch/admission, A-01 barrier, qualification semantics, repair lineage, Second Shift fencing, scheduler/claim authority, GitHub/A-01 ingress, and observability/morning receipt/rollback. A capability contract may add dependencies but may not silently remove this baseline.

## Failure and idempotency baseline

Authority/schema/dependency/persistence ambiguity fails closed. Retries reuse `idempotency_key`. Duplicate work must recover/return the prior committed result or a typed conflict, never duplicate durable state or external side effects. Partial results remain explicitly partial. Cancellation preserves committed evidence and reports irreversible effects.

## Evidence baseline

Each capability future evidence target (currently absent until that capability is qualified) is `qualification/foundation/<module>-foundation-001.json` and must include capability/module/owner identity, current authority/crosswalk, exact subject Git blobs, route coverage, canonical-writer assertion, dependency/failure/idempotency/owner-boundary test results, acceptance command, final `PASS|FAIL`, and immutable evidence references.

## Acceptance baseline

- Pre-code gate: `node .github/scripts/foundation-capability-contract-spec-check.js <MODULE>`.
- Implementation gate: `node .github/scripts/foundation-capability-acceptance.js <MODULE>`.

A populated contract is specification-ready only. It is not implementation-complete and does not create or transfer PASS evidence.
