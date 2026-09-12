# CORE Intent / Keel Recovery Inventory 001

## Standing and method

This record executes **RECOVER -> INVENTORY -> ANALYZE -> TARGETED RESEARCH TRIAGE -> ADJUDICATE** for the Foundation/Spine Intent / Keel boundary. `SYSTEM-SPECIFICATION.md` remains architecture authority. This record does not create a second architecture hierarchy.

Exact live owner baseline re-read before mutation: `system-master/control-v2@3beae860af0ab9e9cafa9c7915d6cab1f62b3f4d` (tree `9cd7365116b65922a217d3ff582f93ef88a9d0e8`).

## 1. Canonical target recovered from SYSTEM-SPECIFICATION

Intent / Keel is the shared authority for the governed **intent envelope** that precedes work planning and execution. Its authoritative subject is a stable goal identity plus immutable goal revisions containing:

- problem / goal statement and desired outcomes;
- requirements and hard/soft constraints;
- explicit success criteria;
- delegation ceiling;
- resource ceiling;
- human-in-the-loop conditions;
- allowed and forbidden action envelope;
- references and lineage/evidence links;
- creator / approver principal references;
- version / supersession standing.

A descendant may refine a parent intent envelope but may never widen authority beyond the parent. Keel may emit a governed goal revision reference and a validation receipt for downstream consumers. It does not make plans, reserve resources, mint concrete capabilities, select routes/placements, own jobs/attempts, or execute effects.

## 2. Recovered donor substrate and exact allocation

### SYSTEM-SPECIFICATION — semantic authority

The current System Specification provides the actual Keel owner boundary and the constitutional laws that matter here: one owner, no descendant authority expansion, planning is not permission, unknown critical state fails closed, significant subject changes invalidate inherited evidence, recovery coordinates owners rather than absorbing them, and shared infrastructure may not absorb specialist semantics.

### F-WP-002 — revision / durable-change mechanics donor

Reusable mechanics:

- immutable authority identity;
- exact snapshot/digest binding;
- monotonic revisions and content-digest binding;
- append-only material-event timeline;
- expected-revision optimistic concurrency control;
- atomic state + event commit.

Allocation: these are useful durable-governance mechanics for goal revision publication. F-WP-002 change-management semantics are not Keel goal semantics and its historical PASS does not transfer.

### F-WP-005 — approval / bounded-envelope donor

Reusable concepts:

- bounded authority by scope/time/target;
- separation of duties where required;
- exact approval binding to an immutable revision/digest;
- reference-only secret handling;
- preserved real principal/scope/reason/time/review evidence for exceptional paths.

Allocation: Keel may bind an approval **receipt reference** and approval requirement but cannot validate or mint concrete approval/capability/effect authority.

### F-WP-006 — concrete grant authority fence

Recovered F-WP-006 requires execution grants to be scoped, expiring, non-transferable and revocation-sensitive, with unknown prerequisites failing closed.

Allocation: this is strong evidence that a Keel delegation ceiling is an **upper bound**, not a concrete execution grant. Identity/Effect/Admission authorities remain responsible for actual current grants and consequential permission.

### F-WP-007 — runtime / concurrency fence

Recovered F-WP-007 owns command idempotency, execution epochs/fence tokens, overlapping-target execution compatibility, trusted-time lease decisions, durable execution progress, unknown-effect reconciliation, pause/halt/cancel runtime behavior and cross-system reconciliation.

Allocation: Keel must not copy any of this into its canonical state. It may express a constraint that downstream execution must satisfy; runtime truth remains with the corresponding Foundation owners.

### SMR021 Work/Descriptor/Action binding donor — Work and route fence

Current reconstructed evidence proves that work identity, work version, descriptor identity/digest, route requirement digest and descriptor-owned action projections must stay exactly bound and that route/admission evidence cannot be reused across work items.

Allocation: Keel may be the ancestor `goalRevisionRef` in the canonical Work Chain, but it does not own `workId`, work version, capability descriptor, route decision or admitted action grant. An allowed-action expression in Keel is only an upper-bound intent constraint and never a route/effect grant.

## 3. Analysis — material defects/gaps in current fresh spine

1. No fresh canonical Keel runtime currently exists in `foundation-spine`; the system has only architecture plus dispersed historical donor semantics.
2. No single immutable `GoalRevision` currently binds goal text, outcomes, requirements, constraints, success criteria, delegation/resource ceilings, HITL rules and action envelope into one content-addressed authority subject.
3. Parent -> child refinement rules are not yet executable; a descendant could be represented without proof that it does not relax a parent hard constraint or widen ceilings.
4. Delegation ceiling is not yet separated by type from concrete Identity `CapabilityGrantV1`, creating collision risk if reused naively.
5. Resource ceiling is not yet separated by type from Resource Admission reservation/grant/accounting truth.
6. Allowed actions are not yet typed as **maximum permitted intent surface** distinct from route admission and Effect Authority.
7. Forbidden action precedence is not yet executable; forbidden must dominate allowed in all descendants.
8. Human-in-the-loop conditions are not yet typed separately from human approval evidence. A requirement for human review cannot become evidence that a human approved.
9. Creator/approver references are not yet bound to exact Principal/Identity references without importing identity semantics.
10. Goal revisions have no fresh append-durable authoritative journal, revision conflict handling or replay/corruption contract.
11. No semantic command idempotency is defined for goal creation/revision/supersession.
12. No deterministic `KeelValidationReceipt` exists for Work/Planning/Resource/Identity consumers.
13. No exact Contracts & Versioning gate is yet required for Goal/Receipt schema versions.
14. No explicit `DRAFT -> GOVERNED -> SUPERSEDED/RETIRED` lifecycle is frozen; draft intent must never be executable authority.
15. No explicit rule prevents a later revision from silently changing parent lineage.
16. No explicit rule prevents removal/relaxation of inherited hard constraints without a new independently authorized ancestor decision.
17. No durable reasoned rejection taxonomy exists for invalid refinement.
18. No bounded size/complexity rules exist for constraints/references/action entries; unbounded envelopes would create denial-of-service and review hazards.
19. Secret-bearing values could be embedded in free-form references unless canonical fields are reference-only and bounded.
20. Success criteria are not yet represented as testable declarations with evidence requirements; free text alone is insufficient for downstream completion evidence.
21. Keel has no authority to claim that success criteria were actually met; Evidence/Assurance + Work/Project completion own observed completion evidence.
22. Time bounds in intent are not runtime leases. Keel needs exact time-policy references rather than locally deciding trusted time.
23. No explicit domain-specialist fence prevents Book/Learning/Documents/Programming semantics from being embedded as shared Keel authority rather than opaque specialist references/requirements.
24. No exact Work Chain field currently binds `goalId + goalRevision + goalDigest` into downstream work without duplicating work truth.

## 4. Targeted research triage

No new external research is opened for this unit. The material design questions are owner-boundary and exact-state questions already answered more strongly by the current System Specification, the freshly frozen Identity/Contracts boundaries, and recovered repository evidence. External goal-management or policy-framework patterns would not be allowed to override those constitutional owner boundaries and are not expected to change the design-lock decisions below. This satisfies the targeted-research stage by explicitly declining non-material research rather than researching for ceremony.

## 5. Atomic ownership adjudication

### Keel owns

- stable `goalId` and immutable `goalRevision` authority;
- problem/goal statement and desired-outcome declarations;
- requirement declarations and hard/soft constraint envelope;
- declared success criteria and required evidence classes/references;
- delegation **ceiling** only;
- resource **ceiling** only;
- HITL **conditions/requirements** only;
- allowed/forbidden action **ceiling** only;
- parent/child intent lineage and non-expansion validation;
- lifecycle/supersession of governed intent;
- deterministic Keel validation/refinement receipts.

### Other Foundation systems own

- **Identity/Principal/Delegation:** concrete principals, capability grants, standing/revocation and delegated actor chains.
- **Contracts & Versioning:** schema/protocol identity, compatibility and structural admission.
- **Work & Project Control:** `workId`, project/work lifecycle, progress and long-lived work truth.
- **Planning & Orchestration:** plans, DAGs, scheduling/orchestration state and execution planning.
- **Resource Admission & Budgeting:** reservations, actual grants, accounting, fairness, backpressure and reclaim.
- **Routing / Placement:** capability route decisions, implementation selection, assignment and placement evidence.
- **Durable Runtime:** jobs, attempts, leases, fence epochs, checkpoints, timers and execution progress.
- **Effect Authority:** consequential commit permission and unknown-effect reconciliation.
- **Evidence / Assurance:** whether required success/approval/evidence actually exists and is current/trusted.
- **Security/Privacy:** secret classification, cryptographic/key authority and privacy enforcement.

### Peer/specialist systems own

Book, Learning, Documents and Programming retain their specialist semantics. Keel may reference a specialist requirement or desired outcome opaquely; it must not define the specialist's internal semantic truth.

## 6. Lossless bounded Keel invariant census

| ID | Requirement / invariant | Current component / donor | Durable state now | Interface / contract now | Tests / evidence now | Environment | Remaining blocker |
|---|---|---|---|---|---|---|---|
| K-01 | stable globally unique goal identity | target spec only | none fresh | target Goal identity | architecture evidence | none | build |
| K-02 | immutable goal revision identity | F-WP-002 revision donor | no fresh Keel store | target GoalRevision | donor provenance | historical/current design | build |
| K-03 | exact content digest binds full intent envelope | F-WP-002 digest donor | none fresh | target revision digest | donor provenance | historical/current design | build canonicalizer |
| K-04 | goal statement + desired outcomes are Keel truth | target spec | none fresh | target GoalRevision | architecture evidence | none | build |
| K-05 | requirements are explicit immutable revision content | target spec | none fresh | target RequirementDecl | architecture evidence | none | design/build |
| K-06 | hard vs soft constraints are explicit | target spec | none fresh | target ConstraintDecl | architecture evidence | none | design/build |
| K-07 | descendant cannot relax inherited hard constraint | constitutional law | none fresh | refinement validator | no executable current test | none | design/build/test |
| K-08 | delegation ceiling cannot widen in descendant | spec + F-WP-006 fence | none fresh | target DelegationCeiling | no fresh executable test | none | design/build/test |
| K-09 | delegation ceiling is not concrete capability grant | Identity fresh boundary + F-WP-006 | Identity grant state external | opaque Identity refs only | Identity qualification proves its owner | hosted portable | enforce boundary tests |
| K-10 | resource ceiling cannot widen in descendant | target spec | none fresh | target ResourceCeiling | absent | none | design/build/test |
| K-11 | resource ceiling is not reservation/grant/accounting | owner adjudication | Resource state external | opaque resource policy refs | architecture/status evidence | none | enforce boundary tests |
| K-12 | allowed-action set is ceiling not permission | spec + SMR021 donor | none fresh | ActionEnvelope | admission/effect evidence external | current donor | design/build/test |
| K-13 | forbidden actions dominate allowed actions | constitutional safety rule derived from no expansion | none fresh | ActionEnvelope | absent | none | design/build/test |
| K-14 | descendant cannot remove inherited forbidden action | no-expansion law | none fresh | refinement validator | absent | none | build/test |
| K-15 | HITL condition is requirement, not human approval evidence | evidence-class law + F-WP-005 donor | none fresh | HumanControlRequirement | no fresh test | none | design/build/test |
| K-16 | creator/approver bind exact principal refs without owning identity | Identity owner boundary | principal state external | opaque principal/evidence refs | Identity hosted qualification | hosted portable | adapter integration |
| K-17 | approval requirement cannot fabricate approval | evidence law + F-WP-005 | approval evidence external | receipt ref only | donor provenance | historical/current | boundary tests |
| K-18 | success criteria explicit and evidence-class aware | target spec | none fresh | SuccessCriterionDecl | absent | none | design/build/test |
| K-19 | Keel cannot claim criterion satisfied | Evidence/Work owner fence | external evidence only | references only | architecture evidence | none | boundary tests |
| K-20 | references are bounded opaque refs, not secret bytes | F-WP-005 secret-ref donor | none fresh | ReferenceV1 | donor provenance | historical | build validator |
| K-21 | all governed revisions use current Contracts gate | Contracts fresh boundary | Contracts registry external | GateReceipt ref | Contracts 48-case qualification | hosted portable | integrate |
| K-22 | draft cannot become executable authority | target lifecycle gap | none fresh | GoalStanding | absent | none | design/build/test |
| K-23 | supersession is explicit; history never rewritten | append-only law/F-WP-002 | none fresh | Supersession record | donor provenance | historical/current | build/test |
| K-24 | expected-revision conflict prevents lost update | F-WP-002 donor | none fresh | publish revision command | donor qualification provenance | historical | build/test |
| K-25 | state+event commit is atomic in reference adapter | F-WP-002 donor | none fresh | publish command receipt | donor provenance | historical | build/test |
| K-26 | semantic command replay is idempotent/conflict detecting | Contracts/Identity fresh pattern | none fresh | commandId+requestHash | fresh neighboring evidence only | hosted portable | Keel implementation/test |
| K-27 | replay reconstructs identical goal state; corruption fails closed | Root/Contracts fresh pattern | none fresh | Keel journal contract | neighboring evidence only | hosted portable | Keel implementation/test |
| K-28 | lineage parent ref cannot change after publication | target spec/no rewrite law | none fresh | GoalRevision parent ref | absent | none | build/test |
| K-29 | child binds exact parent revision+digest, not moving latest pointer | no stale/implicit authority law | none fresh | refinement input | absent | none | build/test |
| K-30 | time-bound constraints use trusted-time evidence refs, not local lease authority | F-WP-007 fence | time/runtime state external | TimePolicyRef | donor provenance | historical | design/build/test |
| K-31 | Work Chain downstream identity binds exact goal revision without importing Work truth | canonical Work Chain | work state external | GovernedGoalRef | SMR021 donor proves exact work-bound evidence need | current | integration successor |
| K-32 | no specialist semantics absorbed | constitutional owner law | peer state external | opaque specialist requirement refs | topology/authority evidence | governance | boundary tests |

**Census result: 32/32 bounded Keel invariants accounted; 0 unaccounted.** `Accounted` does not mean implemented. The blocker column is authoritative for unfinished rows.

## 7. Reuse / repair / reject decisions

### Reuse

- F-WP-002 immutable revision, digest, OCC, append-event and atomic-record/event patterns.
- F-WP-005 exact approval-reference and bounded-scope concepts.
- Fresh Identity principal/capability references; do not duplicate them.
- Fresh Contracts structural/version gate; do not reimplement compatibility inside Keel.
- Existing Work/Route/Effect exact-binding lessons from SMR021.

### Repair / fresh binding required

- one canonical `GoalRevisionV1` that binds the entire intent envelope;
- executable parent->child non-expansion validator;
- explicit ceiling types that cannot be mistaken for grants;
- durable revision publication/replay/corruption/idempotency authority;
- bounded HITL/success/action/constraint declarations;
- downstream validation receipt with exact subject/digest/revision binding.

### Reject as Keel authority

- concrete capability/execution grants;
- resource reservations/grants/accounting;
- work/project state;
- plan/orchestrator state;
- route/placement decisions;
- runtime leases/fences/jobs/attempts;
- effect permission/execution;
- claims that human approval or success evidence exists;
- Book/Learning/Documents/Programming semantic state.

## 8. Dependency-valid successor

`CORE-KEEL-DESIGN-LOCK-001` — freeze immutable goal/revision/constraint/success/ceiling/HITL/action/lineage contracts, refinement/non-expansion rules, durable publication semantics, validation receipt, error taxonomy and isolated qualification denominator before runtime build.
