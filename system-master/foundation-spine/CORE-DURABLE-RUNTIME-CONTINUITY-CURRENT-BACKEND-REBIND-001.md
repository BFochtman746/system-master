# CORE-DURABLE-RUNTIME-CONTINUITY-CURRENT-BACKEND-REBIND-001

**Date:** 2026-09-12  
**Lane:** Foundation / Spine — Durable Runtime / Continuity  
**Parent subject:** `second-shift/core-durable-runtime-continuity-recovery-001-20260912@15b5ffd71ebbb7ab6f8d6d848fe9f5b7f75670d6`  
**Live owner/control reread before this unit:** `system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`  
**Status:** `CURRENT_BACKEND_REBOUND_TO_42_ROW_CENSUS__FOREIGN_CONTRACTS_AND_CONTINUITY_ADAPTERS_STILL_BLOCK_BUILD`

## 1. Purpose

Rebind the exact, byte-verified, freshly portable-qualified FOUNDATION-003 Durable Runtime substrate recovered by `CORE-DURABLE-RUNTIME-PLATFORM002-CUSTODY-RECOVERY-001` into the frozen 42-row G-WP-008..015 continuity census without inventing a second runtime, shadow Work/Project truth, shadow Resource Admission, shadow Routing/Placement, shadow Effect authority, or specialist semantics.

The controlling 42-row recovery inventory remains lossless at `42/42` with `unaccounted_requirements = 0`. This unit changes implementation standing only where current FOUNDATION-003 bytes now prove a reusable current substrate.

## 2. Exact current backend admitted to this rebind

Current reusable backend surface, all byte-verified against the bounded BUILD-FREEZE candidate and freshly portable-qualified:

- `DurableRuntime.java`
- `JdbcDurableRuntime.java`
- `JobStateMachine.java`
- `DurableExecutionContract.java`
- `JdbcConcurrencyLeaseStore.java`
- `JdbcResourceLedger.java`
- FOUNDATION-003 schemas and `035_foundation_003_durable_semantics` migration
- `Foundation003AuthorityTests` — fresh **24,253 assertions PASS**
- `Foundation003JdbcContractPortableTests` — fresh **95 assertions PASS**
- FOUNDATION-003 contract-parity verifier — fresh PASS
- strict Java 21 `-Xlint:all -Werror` compilation of declared FOUNDATION-003 Java implementation refs — PASS.

These are portable/current-bounded results only. Live PostgreSQL, target/native, A-01, production and external-provider evidence remain unexecuted.

## 3. Rebind status vocabulary

- **DIRECT-RUNTIME-SUBSTRATE** — current F003 has a concrete owner-local primitive for the Durable Runtime half; continuity-specific adapter/foreign-owner proof may still be required.
- **PARTIAL-RUNTIME-SUBSTRATE** — current F003 has supporting persistence or mechanics but not the complete continuity behavior named by the row.
- **FOREIGN-OWNER-ONLY** — the missing behavior belongs outside Durable Runtime; do not implement it here.
- **CURRENT-GAP-IN-CONTINUITY-ADAPTER** — no current owner-local continuity adapter is installed even though historical G-WP substrate exists.
- **ASSURANCE-SUBSTRATE** — current test/registry/evidence-class mechanics exist but do not qualify the full 42-row continuity subject.

Blocker refinement:

- prior **B5** (`BLOCKED_CURRENT_PERSISTENCE_INTERFACE_NOT_BOUND`) is narrowed for rows using current F003 runtime persistence to **B5R** = `CURRENT_F003_PERSISTENCE_PRESENT__CONTINUITY_ADAPTER_NOT_BOUND`.
- prior **B6** (`BLOCKED_FRESH_QUALIFICATION_NOT_RUN`) is narrowed for current F003 base mechanics to **B6R** = `F003_BASE_FRESH_PORTABLE_PASS__42_ROW_CONTINUITY_DENOMINATOR_NOT_EXECUTED`.
- B2/B3/B4/B7/B8/B9/B10/B11/B12/B13 remain owner-valid where listed in the frozen census.

## 4. Lossless 42-row current-backend rebind

| Requirement | current F003 binding | current rebind standing | remaining owner-valid work |
|---|---|---|---|
| G-RQ-045 | job/attempt state, fence, recovery rows | PARTIAL-RUNTIME-SUBSTRATE; B5→B5R, B6→B6R | Work/Orchestrator handoff contract B7; continuity handoff adapter |
| G-RQ-046 | job/attempt state, monotonic claim fence, recovery | PARTIAL-RUNTIME-SUBSTRATE; B5R/B6R | replacement/handoff owner contract B7 |
| G-RQ-047 | recovery rows + durable event/outbox | PARTIAL-RUNTIME-SUBSTRATE; B5R/B6R | Work handoff B7 + shared Evidence B11 |
| G-RQ-048 | durable job identity + recovery/idempotency | PARTIAL-RUNTIME-SUBSTRATE; B5R/B6R | Work/Orchestrator rediscovery binding B7 |
| G-RQ-043 | `requestCancellation`, durable timers/signals, lease recovery | DIRECT-RUNTIME-SUBSTRATE; B5R/B6R | Transport delivery/replay adapter B8 |
| G-RQ-021 | fenced sequential checkpoint with runtime-contract digest | PARTIAL-RUNTIME-SUBSTRATE; B5R/B6R | exact Contracts compatibility decision B9 |
| G-RQ-035 | checkpoint digest/schema guards; fail-closed runtime validation | PARTIAL-RUNTIME-SUBSTRATE; B6R | external dependency/compatibility decision B9 |
| G-RQ-051 | checkpoint sequence + runtime-contract digest | PARTIAL-RUNTIME-SUBSTRATE; B5R/B6R | compatibility-decision adapter B9 |
| G-RQ-052 | checkpoint persistence exists; no current migration coordinator | CURRENT-GAP-IN-CONTINUITY-ADAPTER; B5R/B6R | Contracts-owned migration compatibility B9; adapt historical G-WP-010 |
| G-RQ-053 | checkpoint history exists; no current history compactor/rollover owner | CURRENT-GAP-IN-CONTINUITY-ADAPTER; B5R/B6R | bounded history/retention design under Contracts B9 |
| G-RQ-054 | checkpoint state + event/outbox primitives | PARTIAL-RUNTIME-SUBSTRATE; B5R/B6R | evidence-preserving compaction B9+B11 |
| G-RQ-055 | runtime-contract digest can bind compatibility subject | PARTIAL-RUNTIME-SUBSTRATE; B6R | fail-closed current Contracts decision B9 |
| G-RQ-056 | checkpoint persistence/contract digest | PARTIAL-RUNTIME-SUBSTRATE; B5R/B6R | history/migration adapter B9 |
| G-RQ-023 | no current F003 authority to decide secret classification/delegation | FOREIGN-OWNER-ONLY | Identity/Security/Privacy binding B2+B12; Runtime stores refs only |
| G-RQ-024 | SHA-256/digest/schema/SQL integrity constraints + recovery rows | PARTIAL-RUNTIME-SUBSTRATE; B5R/B6R | shared Evidence/Recovery quarantine decision B11 |
| G-RQ-044 | cancellation intent and recovery-origin preservation are durable | PARTIAL-RUNTIME-SUBSTRATE; B6R | current revoke/delegation + Work plan authority B2+B7+B8 |
| G-RQ-057 | runtime can fail closed on state/fence but cannot authorize actor | FOREIGN-OWNER-ONLY with runtime guard substrate | current Identity/Delegation decision B2+B12 |
| G-RQ-058 | runtime has no eligibility/policy authority | FOREIGN-OWNER-ONLY | Identity/Policy/Keel decision B2+B12 |
| G-RQ-059 | runtime has no secret resolver authority | FOREIGN-OWNER-ONLY | Security/secret authority B2+B12 |
| G-RQ-060 | DB/schema/digest/runtime state checks exist | PARTIAL-RUNTIME-SUBSTRATE; B5R/B6R | full recovery-integrity gate + Evidence B11 |
| G-RQ-061 | RECONCILING/terminal states and evidence digest exist | PARTIAL-RUNTIME-SUBSTRATE; B6R | authorization/quarantine/evidence owners B2+B11+B12 |
| G-RQ-014 | `resolveRecovery` requires evidence digest; active recovery row is durable | DIRECT-RUNTIME-SUBSTRATE; B5R/B6R | shared Evidence acceptance/closure B11 |
| G-RQ-015 | recovery status/resolution/evidence digest and terminal state persist | DIRECT-RUNTIME-SUBSTRATE; B5R/B6R | residual-ref/evidence closure contract B11 |
| G-RQ-049 | no current recovery query projection or Work-client reconnect service | CURRENT-GAP-IN-CONTINUITY-ADAPTER | Work/Orchestrator + Transport B7+B8; native remains B13 |
| G-RQ-050 | UNKNOWN/RECONCILING + scoped idempotency mechanics exist | PARTIAL-RUNTIME-SUBSTRATE; B6R | query-before-recommand Transport/Effect binding B8+B10 |
| G-RQ-062 | atomic event/outbox, reclaim, retry and quarantine primitives exist | DIRECT-RUNTIME-SUBSTRATE; B5R/B6R | shared Evidence publisher/ingestion contract B11+B8 |
| G-RQ-063 | no current continuity query projection; authoritative job/recovery state exists | CURRENT-GAP-IN-CONTINUITY-ADAPTER | projection owned from durable truth + Evidence gap semantics B11 |
| G-RQ-064 | no progress-percent semantics in F003, correctly avoiding invented progress | FOREIGN-OWNER-ONLY / CURRENT-GAP-IN-CONTINUITY-ADAPTER | Work/Project basis + Evidence/UX projection B7+B11 |
| G-RQ-016 | `DurableExecutionContract` has explicit checkpoint policy and bounded retry; no hidden universal interval introduced | PARTIAL-RUNTIME-SUBSTRATE; B6R | current Keel/policy ceiling binding B12 |
| G-RQ-041 | max attempts, retry class, bounded full-jitter backoff and terminal/dead-letter mechanics | DIRECT-RUNTIME-SUBSTRATE; B6R | current Work/Keel retry-budget decision B7+B12 |
| G-RQ-042 | durable priority/availability/backoff queue exists | PARTIAL-RUNTIME-SUBSTRATE; B5R/B6R | Resource Admission pacing/backpressure B3 |
| G-RQ-065 | `JdbcResourceLedger` provides durable accounting/envelope binding only | PARTIAL-RUNTIME-SUBSTRATE; B6R | Resource Admission remains sole allocation/grant owner B3 |
| G-RQ-066 | resource ledger + event/outbox primitives exist; metric definition authority absent | PARTIAL-RUNTIME-SUBSTRATE; B6R | Resource + Contracts metric schema + Evidence B3+B9+B11 |
| G-RQ-067 | `ResourceEnvelope` + `JdbcResourceLedger` durable bounds/accounting substrate | PARTIAL-RUNTIME-SUBSTRATE; B6R | Resource Admission policy/limit decision B3+B12 |
| G-RQ-068 | priority queue + retry pacing mechanics exist | PARTIAL-RUNTIME-SUBSTRATE; B5R/B6R | dependency admission/backpressure B3 |
| G-RQ-006 | no current F003 legacy recovery import/crosswalk | CURRENT-GAP-IN-CONTINUITY-ADAPTER | adapt historical G-WP-014 behind current truth owners B7+B9 |
| G-RQ-069 | digest primitives/evidence rows exist; no legacy migration service | CURRENT-GAP-IN-CONTINUITY-ADAPTER | digest-bound import/quarantine + Evidence B11 |
| G-RQ-070 | outbox/evidence primitives exist; no recovery export service | CURRENT-GAP-IN-CONTINUITY-ADAPTER | Evidence/Security-authorized minimized export B2+B11+B12 |
| G-RQ-071 | F003 spec implementation refs, qualification registry and recurrence ledger are present and freshly exercised for the F003 base | ASSURANCE-SUBSTRATE; B6→B6R | continuity-specific 42-row tests still required; B13 remains |
| G-RQ-072 | qualification registry explicitly separates portable from live DB; live F003 suite not executed | ASSURANCE-SUBSTRATE; B6R | target/native/A-01 remain B13 |
| G-RQ-073 | no human evidence executed or implied | ASSURANCE-SUBSTRATE correctly leaves human NOT_STARTED | Work handoff human evidence remains B7+B13 |
| G-RQ-074 | qualification/recurrence evidence is explicit for F003 base | ASSURANCE-SUBSTRATE; B6R | shared Evidence classification + full continuity qualification B11+B13 |

**Census preservation:** 42/42 recovered rows remain accounted. `unaccounted_requirements = 0` remains true for the bounded historical-to-current mapping. No row is silently marked complete merely because a lower-level primitive exists.

## 5. Current implementation census conclusion

The recovered current FOUNDATION-003 backend is substantially stronger than the earlier `HISTORICAL SUBSTRATE — REBIND` label implied:

- durable Job/Attempt state, database-clock lease/fencing, checkpoint persistence, recovery state, cancellation preservation, bounded retry, UNKNOWN/RECONCILING, idempotency, durable event/outbox/inbox, timers/signals, concurrency fencing, resource-envelope/accounting and SQL constraints are **real current bounded implementation substrate** with fresh portable qualification;
- the historical PLATFORM-002 `RECONCILING` ordinary-claim defect is already absent in these current bounded bytes;
- therefore rewriting those mechanics would violate the reuse-first rule without cause.

The remaining continuity work is primarily **adapter/interface consolidation and current foreign-authority binding**, not a greenfield Durable Runtime rewrite.

## 6. Build gate

Runtime mutation remains **NOT AUTHORIZED** by this unit because the current foreign authority surfaces are not all concrete at the implementation boundary.

Before build, the branch must bind exact current contracts for at least:

1. Identity/Principal/Delegation resume/effect decisions;
2. Contracts/Versioning checkpoint compatibility/migration decisions;
3. current Keel/shared-policy ceilings;
4. Work/Project + Orchestrator handoff/reconnect truth;
5. Resource Admission grant/reacquisition authority;
6. Routing/Placement assignment and staleness authority;
7. Transport rediscovery/delivery contract;
8. Effect Authority unknown-outcome status/receipt contract;
9. Evidence/Provenance/Assurance ingestion/classification contract;
10. Security/privacy/secret-reference policy.

Any absent contract remains an explicit blocker and cannot be replaced by a Durable Runtime-owned substitute.

## 7. Qualification denominator preservation

Fresh current F003 base evidence now exists, but it is **not** the full continuity denominator. Future changed-subject qualification must preserve all previously frozen additive obligations, including:

- 42 recovered continuity requirements;
- persistence normalization/recovery denominator;
- effect seam denominator;
- evidence seam denominator;
- transport seam denominator;
- security seam denominator;
- resource/placement/fence denominator;
- Root / Identity / Contracts / Keel cumulative regressions;
- any new foreign-contract adapter tests introduced by the next design lock.

No denominator may shrink because the base F003 suite passed.

## 8. One dependency-valid successor

**`CORE-DURABLE-RUNTIME-CONTINUITY-FOREIGN-CONTRACT-BIND-001`**

Re-read the live owner, then recover and bind the **exact current concrete interfaces** needed by the ten foreign-owner boundaries above, reusing the already hosted-qualified Identity/Delegation and Contracts/Versioning authority and the frozen Keel design before reaching lower-confidence Work/Orchestration, Resource/Placement, Transport, Effect, Evidence and Security seams. For each interface, record provider owner, exact version/digest, authoritative state, request/decision/receipt shape, freshness/revocation semantics, failure/UNKNOWN behavior, tests/evidence/environment and blocker. Do not implement adapters until collisions are zero and the affected cumulative denominator is frozen. If an interface is absent, fail closed and continue the remaining independent bindings.

**No A-01, native/device, production, external-provider or specialist-system evidence is claimed.**
