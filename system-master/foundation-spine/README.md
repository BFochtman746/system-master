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

## A-01

A-01 is a qualification environment, not an architectural authority. If A-01 was disconnected or unavailable, the correct result is **NOT EXECUTED — ENVIRONMENT UNAVAILABLE**. That is an evidence gap, not an implementation failure and not an architecture failure. A-01 PASS may be claimed only after the exact subject actually executes there and passes.

## Documentation discipline

Do not create a new architecture document for every repair, conversation or qualification run. Change these canonical documents directly and let Git preserve prior versions. Operational evidence may accumulate elsewhere without becoming design authority.

A new logical Foundation & Spine system may be introduced only when it answers a genuinely new canonical question that cannot safely belong to an existing owner. Contradictions are resolved by choosing and revising the architecture, not by adding another side document that says both things.
