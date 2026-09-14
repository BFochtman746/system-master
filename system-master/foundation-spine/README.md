# System Master Foundation & Spine

This directory is the sole current human-facing design authority for the System Master Foundation & Spine.

The documentation has been rebuilt from first principles. Earlier Foundation/Core/Spine prose is historical source material, not normative architecture merely because it existed first. The current design is based on the best combination of present implementation, archival implementation and failures, recovered architecture, and current engineering/safety research.

This reset changes documentation only. It does not delete or supersede source code, tests, schemas used by implementation, routes, runtime state, logs, workflows, patches, qualification receipts, reconciliation records, manifests/digests, recovery evidence, or historical Git evidence.

## Current documentation

There are only three substantive Foundation & Spine documents:

1. **SYSTEM-SPECIFICATION.md** — what the Foundation & Spine must do, which logical systems must exist, what each owns, how one piece of work flows end to end, and which architectural laws may not be violated.
2. **COMPLETION-AND-QUALIFICATION.md** — what designed, implemented, qualified, production-admitted and complete mean, including failure, endurance and A-01 semantics.
3. **IMPLEMENTATION-STATUS.md** — the changing map from the stable target architecture to what currently exists in code/evidence and what still must be built or rebound.

If another prose file conflicts with these documents, these documents define the intended Foundation & Spine design. Historical evidence can prove that something exists or passed a test; it cannot silently change architecture or ownership.

## Operational build blueprint

Foundation & Spine development proceeds one logical system at a time in dependency order.

For each logical system:

1. **Forensic census** — inspect current code, historical/recovered substrate, schemas, tests, qualification evidence and known failures. Classify each relevant piece as keep, modify, consolidate, replace or missing.
2. **Design closure** — lock canonical ownership, negative ownership, state, persistence, contracts, dependencies, invariants, concurrency/idempotency behavior, security/resource/evidence boundaries, failure behavior and recovery behavior before expanding implementation.
3. **Complete implementation** — build every mandatory success and failure behavior required by the current specification; do not stop at a skeleton, stub or happy path.
4. **Isolated qualification** — test the component by itself with all applicable contract, state, persistence, concurrency, security, failure, recovery and adversarial cases.
5. **Performance evaluation** — measure the component under representative and pressure conditions, including latency, throughput, memory, CPU, storage/database growth, contention and recovery cost where applicable. Tune or redesign when the measured result is inadequate.
6. **Boundary qualification** — test the component with each completed direct dependency and consumer across real contracts, including negative and failure behavior.
7. **Accumulated-spine qualification** — rerun the integrated Foundation & Spine containing every completed component so far. A new component may invalidate prior standing when it changes contracts, load, ownership, authority, state or environment assumptions.
8. **Representative implementation campaigns** — run realistic System Master work through the growing spine, not only synthetic component tests, to expose coupling, bottlenecks, hidden shared state, duplicate authority, recovery weakness and incorrect ownership.
9. **Repair before advancing** — if isolated, boundary, performance or accumulated testing exposes a defect or wrong architectural assumption, repair/redesign the affected component(s) and rerun impacted qualification before moving to the next logical system.
10. **Conditional freeze** — a component is frozen only against the exact current architecture, implementation and evidence subject. Later material changes require requalification; earlier evidence is reused only where its claim remains valid.

The four standing levels are therefore cumulative but distinct: **component qualification**, **pair/boundary qualification**, **accumulated-spine qualification**, and **representative implementation qualification**. No component is considered permanently complete merely because it once passed an isolated test.

## A-01

A-01 is a qualification environment, not an architectural authority. If A-01 was disconnected or unavailable, the correct result is **NOT EXECUTED — ENVIRONMENT UNAVAILABLE**. That is an evidence gap, not an implementation failure and not an architecture failure. A-01 PASS may be claimed only after the exact subject actually executes there and passes.

## Documentation discipline

Do not create a new architecture document for every repair, conversation or qualification run. Change these canonical documents directly and let Git preserve prior versions. Operational evidence may accumulate elsewhere without becoming design authority.

A new logical Foundation & Spine system may be introduced only when it answers a genuinely new canonical question that cannot safely belong to an existing owner. Contradictions are resolved by choosing and revising the architecture, not by adding another side document that says both things.
