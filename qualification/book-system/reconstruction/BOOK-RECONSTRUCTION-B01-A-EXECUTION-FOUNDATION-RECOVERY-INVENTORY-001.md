# BOOK-RECONSTRUCTION-B01-A — EXECUTION FOUNDATION RECOVERY / INVENTORY CHECKPOINT 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Control ref: `book-system/control-v1`
Recovered-from live owner head before mutation: `aac6c1023423697bbabcdf4359f864e072fbb636`
Controlling predecessor: `BOOK-RECONSTRUCTION-B00-G1-CONTROL-FREEZE-001`
Standing: `B01-A_ACTIVE__CURRENT_PATH_CENSUS_COMPLETE__LOSSLESS_HISTORICAL_REBIND_NOT_YET_COMPLETE__NO_B01-B_ADMISSION`
Canonical effect: NONE

## Authority reconciliation

B00 is not reopened. The live owner already froze B00 with bounded archaeology 30/30, unaccounted requirements=0, Q001-Q096 = 96/96 and cumulative PRE01-PRE21 = 21/21 on the exact qualified executable tree. The older scheduler/open-seam delegation is stale relative to the live reconstruction head and is not execution authority.

Current authority keeps PROSE complete and terminally retired. Any genuinely unfinished integration of preserved completed Prose capability is BOOK-owned adapter/context/compiler/router/orchestrator work. No Prose lane, claim, repair route, qualification lane or successor is recreated here. Historical PASS does not transfer to changed Book bytes.

## B01-A bounded census

The B01-A execution-foundation scope from the B00 freeze is fully enumerated below. `CURRENT_RUNTIME` means reusable code is reachable on the live owner tree. `RECOVERED_NOT_REBOUND` means implementation/evidence exists in history but is not reachable on the current reconstructed owner tree. `STALE_ARCHITECTURE` means code exists but still binds retired Prose identity or pre-retirement contracts and therefore cannot be treated as current execution authority without Book-owned rebinding. `EVIDENCE_ONLY` never grants current PASS.

| # | Required execution-foundation area | Current component / durable state | Current contract/interface | Current tests/evidence | Classification | Exact finding / blocker |
|---|---|---|---|---|---|---|
| B01-01 | Capability contracts / service interface | `qualification/book-system/service-interface-002/BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002.json` | Registry v2 envelopes, provider-operation identities, parent/effect fences | Historical qualification references are exact-subject only | `STALE_ARCHITECTURE + REUSABLE_CONTRACT_SHAPE` | Registry is Book-owned at top level but still declares `PROSE_ANALYSIS_AND_REVISION`, provider class `PROSE_SYSTEM`, canonical owner `SYSTEM_MASTER/BOOK/PROSE`, and `BOOK_EVALUATION` under the retired Prose owner. Must be rebound as Book-owned integration capability without changing preserved provider evidence semantics. |
| B01-02 | Context compilation / minimum bounded projections | No reachable `system-master/book-system/context-compiler/` implementation on live owner tree | Historical compiler bound source identity, Book state, Story Bible, author authority, constraints, capability request, privacy and evidence refs; canonical effect false | Historical implementation commit `969d290f0b94fadaf58e77c44afab259c10042af`; prior context-compiler qualification remains provenance only | `RECOVERED_NOT_REBOUND` | This is the clearest current `QUALIFIER-ONLY / HISTORICAL-RUNTIME-NOT-REACHABLE` gap. Exact historical source and qualification lineage must be recovered and rebound before implementation claims. |
| B01-03 | Book capability routing | `system-master/book-system/book-capability-routing-interface.js` | `BOOK-WORKFLOW-ORCHESTRATOR-CAPABILITY-ROUTING-INTERFACE-001.json` | Current closure artifacts remain under `qualification/book-system/book-prose-integration/orchestrator/` | `CURRENT_RUNTIME + STALE_ARCHITECTURE` | Resolver is deterministic/fail-closed, but required capabilities and owner paths still use `PROSE.*` / `SYSTEM_MASTER/BOOK/PROSE`. Current authority forbids those labels from dispatching as an active Prose domain. |
| B01-04 | Workflow state / orchestration state machine | `system-master/book-system/book-workflow-state-model.js`; versioned/digested workflow state | explicit status transition table; immutable source/objective identity; exact current-source guard | Current source reachable; historical closure evidence does not transfer | `CURRENT_RUNTIME__REUSABLE` | Strong reusable substrate: raw content and direct canonical mutation fields are forbidden; terminal states immutable; source identity exact. Requires current B01 qualification after dependency rebinding. |
| B01-05 | Dependency / execution planning | `system-master/book-system/book-workflow-execution-plan.js`; deterministic plan digest/topological layers | task classes `SPECIALIST_SERVICE_TASK`, `DECLARED_BLOCKED_CAPABILITY`, `AUTHORITY_WAIT`, `BOOK_ADMISSION_HANDOFF` | Current source reachable; orchestrator contract/closure artifacts present | `CURRENT_RUNTIME + DEPENDS_ON_STALE_ROUTING` | DAG, terminal admission sink, source/workflow binding and no-canonical-write rules are reusable. Specialist task validity currently depends on stale Prose-labelled routing entries. |
| B01-06 | Scheduling / execution coordination | `system-master/book-system/book-workflow-scheduler-runtime.js`; durable scheduler run records with version/digest fencing | scheduler consumes plan, routing, concurrency, retry and durable adapters | Historical scheduler branch `book/workflow-scheduler-runtime-001@27fe9a3621c92e414874ce229341e58e71b76375` and old 39-case evidence are provenance only | `CURRENT_RUNTIME__FAIL_CLOSED_ON_RETIRED_PROSE` | Scheduler explicitly withholds `/PROSE`, `PROSE.*`, `PROSE_ANALYSIS_AND_REVISION` and `BOOK_EVALUATION`. This correctly prevents retirement violation but also proves routing must be rebound before useful Book-owned specialist execution can occur. |
| B01-07 | Persistence / restart recovery | `system-master/book-system/book-workflow-durable-store.js`; atomic file replacement, fsync, CAS-style expected-current fencing, checkpoint and receipt-chain persistence | coordination-only store; `canonical_effect_allowed=false` | `book-workflow-durable-store.test.js` reachable; old hosted evidence provenance only | `CURRENT_RUNTIME__REUSABLE` | Durable workflow/checkpoint/evidence persistence exists and is Book coordination only. Needs fresh B01 exact-subject qualification after rebinding; no native/production durability claim. |
| B01-08 | Concurrency / serialization | `system-master/book-system/book-workflow-concurrency-rules.js`; deterministic decision digest and topological grouping | old `BOOK-WORKFLOW-ORCHESTRATOR-CONCURRENCY-RULES-001` | historical closure evidence only | `CURRENT_RUNTIME + STALE_ARCHITECTURE` | Policy hard-codes `PROSE.GENERATE_REVISION_CANDIDATE` and an old phase isolation gate. Reuse policy classes/derivation, but rebind capability identity under current Book authority before execution. |
| B01-09 | Retry / idempotency / lost-response reconciliation | `system-master/book-system/book-workflow-retry-idempotency-rules.js`; operation identity digest + deterministic idempotency key | pins Registry v2 exact content and old retry contract; non-idempotent unknown outcome requires reconciliation | historical registry/contract qualification only | `CURRENT_RUNTIME + STALE_ARCHITECTURE` | Core replay rules are reusable and correctly separate idempotent replay from non-idempotent reconciliation, but special-case identity is still `PROSE.GENERATE_REVISION_CANDIDATE`; current PASS cannot be inferred from historic pins. |
| B01-10 | Failure classification / terminal semantics | `system-master/book-system/book-workflow-failure-semantics.js`; evidence-bound failure records | provider, stale source/context, authority, interface, gate and admission failure classes | current source reachable; historical closure evidence only | `CURRENT_RUNTIME__REUSABLE_WITH_DEPENDENCY_REBIND` | Failure records preserve original manuscript and forbid canonical effect. Provider classification inherits routing/retry dependencies and must be requalified after rebind. |
| B01-11 | Cancellation / pause / resume | `system-master/book-system/book-workflow-cancellation-resume.js`; digest-bound checkpoints and interrupted-operation records | exact plan/workflow/source binding; non-idempotent interrupted work waits for reconciliation | current cancellation/resume closure artifacts exist under orchestrator qualification directory | `CURRENT_RUNTIME__REUSABLE_WITH_DEPENDENCY_REBIND` | Good restart semantics: completed work requires verified receipts; interrupted provider ops preserve operation identity; admission in-flight control is fenced. Depends on stale routing/retry identities. |
| B01-12 | Execution evidence / provenance | `system-master/book-system/book-workflow-evidence-provenance.js`; receipt chains persisted by durable store | receipt classes bind workflow/plan/source/task/provider/operation identities; canonical/publication effect forbidden | current source reachable; historical closure evidence only | `CURRENT_RUNTIME__REUSABLE_WITH_DEPENDENCY_REBIND` | Strong evidence substrate, but provider identity resolution comes through the stale routing/service registry and must be rebound/requalified. |
| B01-13 | Admission handoff boundary | `system-master/book-system/book-workflow-book-admission-handoff.js`; immutable handoff digest to `content-object-admission.js` | terminal Book admission task; exact predecessor receipts + parent version/digest | current admission-handoff closure artifacts exist | `CURRENT_RUNTIME + STALE_ARCHITECTURE` | Canonical admission remains Book-owned and no effect is performed by the handoff. Candidate provenance is hard-coded to `PROSE.GENERATE_REVISION_CANDIDATE`, which is invalid as a current active owner identity and must be replaced by a Book-owned integration capability binding without broadening canonical authority. |

## Cross-cutting invariant map

1. **Canonical authority:** scheduler/providers/evidence/persistence/planning remain non-canonical. Only Book admission may reach canonical Book state.
2. **Source identity:** workflow, plan, checkpoints, retries, receipts and admission handoff all preserve exact source/parent identity and fail closed on stale bindings.
3. **Lost response / replay:** idempotent operations may replay only under same logical operation identity; non-idempotent unknown outcomes require evidence-backed reconciliation before another attempt.
4. **Restart/offline recovery:** durable workflow state, scheduler runs, checkpoints and receipt chains are persisted with version/digest identity. Native sudden-power-loss and production storage behavior are not proved here.
5. **Human/author authority:** `AUTHORITY_WAIT` and author-decision receipt references preserve the boundary; no decision is synthesized.
6. **Publication/export:** execution-foundation modules do not authorize publication/export freeze.
7. **Retired Prose:** preserved historical capability evidence may be consumed only through Book-owned integration. Any path that still names an active Prose owner/capability is architecture debt to rebind, not dispatch authority.
8. **Documents boundary:** document/artifact mechanics remain external peer services; no Book execution component may convert Documents technical success into Book canonical or publication authority.

## QUALIFIER-ONLY / reachability findings

The primary confirmed gap is the **Context Compiler**: historical reusable implementation exists (including deterministic minimum-projection and authority-fence behavior) but the current reconstructed owner tree has no reachable context-compiler runtime path and the historical qualification record is not present as current executable qualification. This is not permission to rewrite it. It is a recovery/rebind requirement.

A second class of qualifier/reuse gap exists across routing/concurrency/retry/admission: current runtime files are reachable, but their exact declared capability identities still encode the retired Prose execution domain. Their algorithms are reusable substrate; their owner/capability bindings are not current authority.

## Why B01-A is not frozen yet

The current path census is complete for all 13 B01 execution-foundation categories, but B01-A is not yet lossless because exact historical-to-current lineage must still be closed for:

- Context Compiler source + test + hosted qualification identity and its intended current Book-owned interface;
- Registry v2 / routing capability rebinding from retired `SYSTEM_MASTER/BOOK/PROSE` identities to Book-owned integration interfaces without inventing provider authority;
- Concurrency/retry/admission hard-coded retired capability identifiers and the exact tests that protect their semantics;
- cumulative qualification composition after the above rebind, including proof that B00 Q001-Q096/PRE01-PRE21 still pass unchanged.

Therefore `unaccounted_requirements=0` is **NOT claimed** for B01-A and B01-B analysis is **NOT admitted** by this checkpoint.

## Bound exact successor

Exactly one dependency-valid successor is bound:

`BOOK-RECONSTRUCTION-B01-A2 — CONTEXT COMPILER + SERVICE/CAPABILITY OWNERSHIP REBIND ARCHAEOLOGY`

Required result before any B01-B design analysis:

1. recover exact historical Context Compiler source/test/workflow/qualification identities;
2. map every Registry v2 and routing capability still carrying retired Prose owner identity;
3. classify each as preserved provider capability evidence vs current Book-owned integration capability vs invalid active-owner residue;
4. map all concurrency/retry/admission references to those identities;
5. produce a lossless old-identity -> current owner/interface rebinding ledger with zero implicit Prose dispatch and zero canonical-authority widening;
6. preserve all unresolved external/private/author/native/publication/A-01 boundaries; and
7. re-read live owner head before any follow-on mutation.

No implementation is authorized merely by this inventory. No historical hosted/A-01 PASS transfers to the reconstructed B01 subject.
