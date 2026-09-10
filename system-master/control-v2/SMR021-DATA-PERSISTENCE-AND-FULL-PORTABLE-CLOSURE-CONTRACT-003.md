# SMR021 DATA Persistence and Full Portable Closure Contract 003

Standing: READY / ARCHITECTURE-AND-QUALIFICATION CONTRACT / NO PASS TRANSFER

## Exact input boundary

- CORE control head at authoring: `f031bccdc8ad13b7950c2ab50143bdfa087dca98`.
- Dependency-current SMR020 predecessor source/test SHA-256: `e22ecedfd3850be6b744ee82f2c02722cd3d203a5785f6f423ac395011cf821f`.
- Bounded SMR021 admission-binding candidate source/test SHA-256: `fe325804bacfd5c40339a18bc393fb1bdfb2191c8b0f3946219d7d81f1971596`.
- Local bounded evidence: `SMR021-MINIMUM-UX-WORK-DESCRIPTOR-ACTION-BINDING-LOCAL-EVIDENCE-001.md`.

The local bounded PASS is not a release PASS, hosted exact-SHA PASS, A-01 PASS, DATA persistence PASS, native PASS, human PASS, publication PASS, or production PASS.

## Persistence boundary to close

The admission record must preserve, without authority expansion, the immutable identity and authorization bindings already proven by the bounded candidate: exact work identity and work version; capability binding; requirement-evidence digest; selected descriptor identity and digest; route digest; caller binding; effect binding; and authority/admission binding. DATA remains the owner of durable persistence semantics. CORE may specify and qualify the cross-boundary contract but must not mint DATA authority.

Any implementation that changes source or tests receives a new exact source/test SHA and fresh qualification. No PASS from `e22...`, `fe325...`, or another SHA transfers.

## Required portable closure matrix

1. Round-trip: every immutable admission field survives persistence and reconstruction exactly.
2. Missing-field rejection: omission of any required immutable binding fails closed before an effect can execute.
3. Tamper rejection: a changed work id/version, descriptor/digest, route digest, caller, effect, capability, requirement-evidence digest, or authority binding is rejected.
4. Version migration: legacy or incomplete records cannot be silently promoted into the new admission contract; migration must be explicit, deterministic, and evidence-bearing.
5. Replay/idempotency: replay of the same accepted operation is deterministic; replay with a different work/descriptor/action identity cannot inherit prior admission.
6. Concurrency: competing writes cannot produce two authoritative current admissions for one governed identity or erase the evidence needed to adjudicate ordering.
7. Authorization-failure side effects: failed authorization produces zero durable mutation and zero effect execution.
8. Reconstruction: a fresh checkout/extraction can rebuild and run the portable suite without hidden machine state.
9. Static/release coherence: source, tests, manifests, descriptors, digests, and qualification metadata identify one exact candidate.
10. Negative authority proof: neither UX nor the persistence adapter can create authorization, execute the governed effect, or claim A-01/native/production authority.

## Evidence target

A closure candidate is eligible for hosted qualification only when it has: a newly computed exact source/test SHA if bytes changed; deterministic fresh reconstruction; the full current portable regression suite; focused persistence/admission tests covering all matrix items above; zero unauthorized persistence/effect side effects; a GitHub-native source-custody manifest; and an explicit separation between hosted evidence and any later A-01 receipt.

## Current executable successor

`SMR021-FULL-PORTABLE-CLOSURE-QUALIFICATION-PACKET-004`

Build the exact runnable-source/manifest/test packet for the bounded candidate and the DATA persistence boundary, enumerate any DATA-owned implementation dependency instead of crossing it, and execute every portable/static check that does not require A-01, Apple-native, human/private, or production authority. If DATA implementation is required and not CORE-owned, fail that mutation rung closed while continuing qualification-packet, migration-test, failure-injection, and exact-SHA custody work.

Completion is not shift termination. Re-read live CORE authority and the active A-01 repair after this packet, preserve the missing authoritative repair receipt as a separate blocker, and immediately select the next dependency-valid CORE rung.