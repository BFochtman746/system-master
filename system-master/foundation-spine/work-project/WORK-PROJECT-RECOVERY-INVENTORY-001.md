# WORK-PROJECT-RECOVERY-INVENTORY-001

Date: 2026-09-12
Owner: `SYSTEM_MASTER/FOUNDATION_SPINE`
Parent frozen Keel commit: `40cf431fd2ad4857e126a95715a449b7325515de`
Branch: `foundation/work-chain-recovery-001-20260912`
Status: **RECOVERY INVENTORY CLOSED / DONOR OWNERSHIP CHALLENGED / NO WORK-PROJECT BUILD OR FREEZE CLAIM / DESIGN LOCK NEXT**

## Purpose

Recover the exact predecessor material that can safely inform the new canonical **Work & Project Control** boundary immediately downstream of the frozen Intent / Keel authority.

This is an inventory and ownership-adjudication packet. Historical implementation is donor evidence only. Nothing in this packet transfers a historical PASS, revives the old F-WP series as current architecture, or authorizes a Work/Project runtime build without a fresh design lock and qualification subject.

## Controlling authority

The current Foundation & Spine system specification owns the architecture. Its canonical question for Work & Project Control is:

> What durable work/project are we managing over time?

The current specification gives this boundary ownership of:

- long-lived Work / Project identity;
- hierarchy;
- milestones;
- progress rollup;
- risks, issues and changes;
- project-memory references;
- the relationship between a governed goal and its ongoing work.

It explicitly does **not** make Work & Project Control a second workflow engine and does not give it ownership of low-level attempts, leases or worker execution state.

The current canonical chain is:

`User Intent -> Governed Goal Revision -> Work / Project -> Plan Revision -> Plan Step -> Policy/Privacy/Rights/Safety -> Resource Admission -> Route -> Resource Grant -> Executor Assignment -> Durable Job -> Attempt/Fence -> Invocation -> Effects -> State/Artifact -> Evidence -> Completion -> Terminal State/Recovery`

## Exact upstream handoff from Keel

The frozen Keel exposes `GovernedGoalRefV1` as the downstream reference contract. Its fields are:

- `goalId`
- `goalRevision`
- `goalRevisionId`
- `goalContentDigest`
- `keelValidationReceiptDigest`
- `contractSubjectId`
- `contractSubjectVersion`
- `contractSubjectDigest`
- `parentGoalRevisionRef`
- `observedKeelRegistryRevision`

Work & Project Control must consume and durably bind the **exact governed goal reference**. It must not copy the goal into a second mutable intent store, reinterpret the goal, or permit a Work revision to masquerade as a material goal revision.

## Recovery finding: the old F-WP family is fragmented donor material

The repository contains predecessor packets `F-WP-001` through `F-WP-012`. They do not form one clean current Work/Project authority. They span multiple concepts that the rebuilt Foundation & Spine now assigns to distinct truth owners.

Therefore the old F-WP family is classified as **donor material only**.

| Legacy packet | Recovered concern | Adjudication for rebuilt Work/Project |
|---|---|---|
| `F-WP-001` | requirement traceability / rebuild governance | **KEEP AS DONOR PATTERN ONLY** for bidirectional trace metadata; trace projections are not Work truth |
| `F-WP-002` | durable change registry, revisioning, append/replay, corruption checks | **KEEP CORE DURABILITY PATTERNS**; do not equate legacy `ChangeRecord` semantics with canonical Work |
| `F-WP-003` | authority resolution, change policy, impact assessment | **MOVE OUT** to policy/governance owners; Work may reference their decisions |
| `F-WP-004` | maintenance windows, recovery plans, verification plans | **MOVE OUT** to recovery / verification owners; Work may carry references and rollups |
| `F-WP-005` | approvals, authorization adapters, emergency authority, secret-reference checks | **MOVE OUT** to identity/delegation, policy/effect and security owners |
| `F-WP-006` | execution grants | **MOVE OUT** to resource/effect/runtime grant authorities; Work cannot mint execution authority |
| `F-WP-007` | coordination, conflict detection, execution leases | **MOVE OUT** to orchestration / placement / durable runtime as appropriate |
| `F-WP-008` | verification, evidence publication, integrity quarantine | **MOVE OUT** to evidence / assurance owners; Work consumes standings without certifying them |
| `F-WP-009` | rollback/restore/roll-forward eligibility and coordination | **MOVE OUT** to recovery coordination and current specialist owners; historical Work state cannot self-authorize recovery |
| `F-WP-010` | incident correlation, metrics, cross-domain adapters | **MOVE OUT** to observability / incident / integration boundaries |
| `F-WP-011` | read-only change projection, freshness, timeline pagination | **KEEP AS DONOR PATTERN ONLY** for Work/Project queries and freshness; projection never becomes authority |
| `F-WP-012` | contract registry, migration, portability, legacy crosswalk | **MOVE OUT** to Contracts & Versioning / migration authority; use only as migration donor evidence |

## Donor behavior worth preserving

### From F-WP-002

Useful implementation properties include:

- durable transaction frames;
- append/commit before authoritative acknowledgement;
- monotonic expected-revision checks;
- digest-bound records/revisions/events;
- replay that rejects malformed, truncated, mismatched or non-monotonic history;
- rebuildable in-memory indexes rather than indexes becoming truth;
- atomic replacement / crash-safety discipline.

These are implementation patterns, not permission to reuse the old change schema as the new Work schema.

### From F-WP-001

Useful traceability patterns include:

- exact requirement identity;
- canonical-owner link;
- implementing-component link;
- data-state and API link;
- invariant-validator link;
- failure/recovery rule link;
- test-family and implementation-package link;
- bidirectional backlink validation.

This belongs in trace/provenance support around Work; it does not replace Work identity or lifecycle.

### From F-WP-011

Useful projection patterns include:

- explicit `CURRENT`, `STALE`, `UNKNOWN` and `DEGRADED` freshness semantics;
- projection timestamps;
- authoritative revision binding;
- stale-cursor rejection;
- integrity-bound pagination;
- `UNKNOWN` rather than fabricated progress/completion when authoritative evidence is unavailable.

### From F-WP-009

The important recovery rule is negative ownership: historical state may identify a recovery candidate, but consequential recovery eligibility must be re-evaluated against current specialist-owned authority. Work/Project must not self-authorize rollback, restore or roll-forward.

## Cross-chain work identity evidence

Current CORE donor research around action admission independently confirms that `workId` must be an exact cross-chain binding, not a UI-local or route-local hint. The recovered defect allowed an admission associated with one work item to become structurally separated from a later command's Work identity.

For the rebuilt chain, `workId` must therefore be durable and exact across downstream plan, route, admission, action/effect and evidence records that claim to belong to that work. Downstream systems may reference Work identity; they do not mint competing Work identities.

## Ownership challenge: what Work/Project must not absorb

The rebuilt boundary must fail the architecture review if it attempts to own any of the following:

- governed goal meaning or goal revision authority — Keel owns it;
- executable plan revisions, step DAGs, joins or replanning — Planning & Orchestration owns them;
- resource budgets, reservations or grants — Resource Admission & Budgeting owns them;
- capability descriptors or route decisions — Capability Registry & Routing owns them;
- executor assignment, leases or placement fencing — Execution Placement owns them;
- durable job/attempt retry state — Durable Execution Runtime owns it;
- effect authorization or commit receipts — Effect / Action Authority owns them;
- artifact byte identity — Artifact Gateway owns it;
- evidence qualification or specialist correctness — Evidence/Assurance and the specialist owner own them;
- recovery authority — Recovery coordinates current truth owners;
- UI/chat state — UI is a projection.

## Candidate canonical responsibilities for the fresh design lock

The next design packet should resolve the smallest sufficient authoritative Work/Project model around these responsibilities:

1. **Work identity** — one durable `workId` minted by exactly one Work authority.
2. **Project identity** — durable project grouping/hierarchy without turning Project into an executor.
3. **Exact goal binding** — every Work binds an exact frozen `GovernedGoalRefV1` or an explicitly governed successor revision.
4. **Hierarchy** — explicit parent/child Work and Project relationships with cycle/identity protection.
5. **High-level lifecycle** — Work/Project state needed for durable management, distinct from job/attempt execution state.
6. **Milestones and progress rollup** — derived from authoritative child/milestone facts, with `UNKNOWN` when evidence is insufficient.
7. **Risks, issues and changes** — durable project-management records/references without stealing specialist authority.
8. **Project-memory references** — references to canonical memory/context sources, never shadow copies of source truth.
9. **Cross-chain references** — ability to associate plan revisions, jobs, artifacts, evidence and recovery episodes by reference while leaving those facts with their own owners.
10. **Concurrency and idempotency** — stale revisions and duplicate commands fail closed or replay the exact committed result.
11. **Crash/replay behavior** — accepted Work identity and authoritative state survive interruption and replay deterministically.
12. **Read models** — queries/progress/timelines are projections with explicit freshness, not a second truth store.

## Design questions that must be closed before implementation

The recovery inventory intentionally does not guess these details. `WORK-PROJECT-DESIGN-LOCK-001` must freeze them before code mutation:

- exact Work and Project record schemas;
- Work-to-Project and Goal-to-Work cardinality;
- whether a material goal revision supersedes, rebinds or creates Work under explicit rules;
- exact lifecycle enum and legal transition table;
- exact hierarchy and cycle limits;
- milestone ownership versus milestone references;
- progress derivation and `UNKNOWN` semantics;
- risk/issue/change record minimums and owner references;
- completion-receipt binding versus high-level Work terminalization;
- cancellation/supersession handoff from Keel;
- command idempotency keys and optimistic-concurrency rules;
- persistence journal/checkpoint format;
- query/projection freshness semantics;
- exact downstream handoff contract to Planning & Orchestration;
- adversarial qualification matrix and cumulative regression gate.

## Rejected reconstruction shortcuts

The following shortcuts are explicitly rejected:

1. Rename `ChangeRegistry` to `WorkRegistry` and declare the boundary rebuilt.
2. Restore all F-WP-001..012 behavior inside one Work service.
3. Copy Keel goal fields into mutable Work state and let Work edit them.
4. Let Work lifecycle state stand in for plan/job/attempt state.
5. Infer completion from UI progress, logs, or a last successful attempt.
6. Let recovery or external-effect authority flow from historical Work state.
7. Transfer historical portable/A-01 standings to a newly designed Work/Project subject.

## Recovery inventory disposition

**CLOSED.**

Recovered donor material is sufficient to begin a fresh Work/Project design lock. No current repository artifact has been found that should be promoted wholesale as the rebuilt canonical Work/Project authority.

The architecture direction is therefore:

**recover patterns -> freeze minimal Work/Project ownership -> build fresh exact subject -> adversarial qualification -> cumulative Foundation regression -> freeze -> continue to Planning & Orchestration.**

## Exact next operation

`WORK-PROJECT-DESIGN-LOCK-001`

The next packet must freeze the authoritative Work/Project schema, lifecycle, invariants, command/query boundary, persistence/replay rules, exact Keel input binding, exact Planning output handoff, failure behavior and qualification matrix **before implementation begins**.
