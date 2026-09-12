# CORE Durable Runtime Continuity Foreign Seam Census 001

Status: RECOVERY / INVENTORY / ANALYSIS / ADJUDICATION COMPLETE FOR AVAILABLE EVIDENCE  
Cross-owner design lock: PARTIAL / FAIL-CLOSED  
Build: NOT AUTHORIZED

Exact live owner reread immediately before mutation: `system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`.  
Isolated predecessor: `second-shift/core-durable-runtime-continuity-recovery-001-20260912@31f66ebe82cdded252182196b5dc2d335d8eff0a`.

## 1. Purpose

The frozen continuity persistence design requires exact foreign seams without turning Durable Runtime / Recovery into a shadow owner. This unit therefore asks, for each required foreign semantic boundary:

**current owner -> durable truth -> exact consumed receipt/ref -> freshness/revalidation rule -> runtime test obligation -> evidence/environment -> blocker.**

Historical F-WP substrate is recovered and rebound where it gives useful Effect/Change-governance mechanics. It is not promoted wholesale and its historical qualification standing does not transfer.

## 2. Historical F-WP authority and provenance

Recovered aggregate donor:

- `system-master/f-wp-012-a01@18409bb44e355bc18febe5706ccf6b2ddcd63268`
- F-WP-001 manifest identifies historical authority `021F`, source standing `BOUNDED_RECOVERY_REBASE_ENGINEERING_BASELINE__NOT_LATEST_ORIGINAL_SOURCE`, and `production_authorized = false`.

The branch name and workflow names include `a01`; that is provenance only here. No A-01 execution/result is claimed by this recovery unit.

Recovered requirement slices relevant to continuity:

- F-WP-002 — Change identity/revision/OCC/atomic ChangeRecord+ChangeEvent.
- F-WP-003 — exact semantic owner + complete impact assessment + fail-closed unknown security/privacy.
- F-WP-004 — recovery strategy, immutable rollback target, point-of-no-return, maintenance window, predeclared verification criteria.
- F-WP-005 — bounded emergency authority, separation of duties, exact approval binding, separate action authorities, secret references, break-glass attribution.
- F-WP-006 — exact execution eligibility/grant, expiring non-transferable authority, current-principal revalidation, critical-unknown fail closed.
- F-WP-007 — idempotency, execution epoch/fence, target conflict, trusted time, crash-reconstructable progress, UNKNOWN external effects, halt/cancel semantics, cross-system intent/observation/reconciliation.
- F-WP-008 — verifier cannot equate executor exit with success; content-bound evidence receipts; sensitive evidence minimization; integrity quarantine.
- F-WP-009 — recovery rechecks current security/compatibility/provider/release standing; current prohibition dominates historical standing.
- F-WP-010 — deployment ownership separation, incident/containment separation, provider standing, resource admission dependency, metrics distinction and post-change review linkage.
- F-WP-011 — query/progress surfaces are projections only and preserve unknown/stale standing.
- F-WP-012 — versioned contracts, explicit legacy crosswalk/migration, content-digest verification and ordered provenance export.

## 3. Seam census

| Seam | Current constitutional owner / current evidence | Durable truth continuity may consume | Freshness / revalidation rule | Runtime obligation | Historical reusable substrate | Current result / blocker |
|---|---|---|---|---|---|---|
| Work & Project Control | Work/Project owner defined by `SYSTEM-SPECIFICATION`; live `WORK-PROJECT-RECOVERY-INVENTORY-001` remains recovery-source blocked | exact Work/Project id, Goal->Work binding, current lifecycle/progress semantics only when owner-issued | re-read when lifecycle/supersession/cancel standing matters; recovery never infers from runtime activity | every RecoveryEpisode/Job/Attempt preserves opaque exact Work lineage; runtime completion cannot close Work | F-WP ChangeId is a change/effect identity, **not** a replacement WorkId | **UNBOUND** — `BLOCKED_RECOVERY_SOURCE_AUTHORITY` |
| Planning & Orchestration | current owner defined constitutionally; current exact Plan/Step contract not frozen | exact PlanRevision/Step refs, current readiness/cancel/replan/completion predicate | re-read before resume when plan revision/cancel/supersession may have changed | runtime attempt binds exact plan/step ref; no `RecoveryPlan` promoted to general orchestration truth | F-WP-004 recovery strategy and G-WP `RecoveryPlan` are bounded recovery/change mechanics only | **UNBOUND** — `BLOCKED_RECOVERY_SOURCE_AUTHORITY` |
| Resource Admission & Budgeting | current owner defined constitutionally; no exact current resource-grant contract frozen in live Foundation files | provisional/final admission, exact grant/reservation, quantity, expiry, work/route/assignment binding | grant must be current/unexpired at consequential start/restart; stale/unknown/deferred/rejected does not authorize | runtime stores opaque grant ref, reacquires/revalidates after restart as required, never mints budget/capacity | F-WP-010 `F-RQ-044` explicitly requires a current unexpired admission/capacity decision and blocks stale/unknown; G-WP resource adapter is requester only | **UNBOUND BUT OWNER COLLISION RESOLVED** — `BLOCKED_RESOURCE_ADMISSION_INTERFACE_NOT_BOUND` |
| Capability Routing | constitutionally separate from Placement/Resource | exact route decision/snapshot, selected capability/provider path, qualification/health inputs as owner receipts | route changes/requalification invalidate route-bound resource assumptions | runtime consumes route ref; recovery can detect stale/missing route but cannot choose a replacement | F-WP-010 provider-standing input is useful eligibility evidence but not a route engine | **UNBOUND** — `BLOCKED_ROUTING_PLACEMENT_INTERFACE_NOT_BOUND` |
| Execution Placement | constitutionally owns executor eligibility/assignment/placement lease; current exact assignment contract not frozen | exact assignment/executor ref and authoritative placement fence/lease if Placement owns it | re-read on restart/reassignment/drain/fence change; stale executor may not mutate | attempt start requires exact current assignment/fence contract; persisted local claim must not supersede Placement authority | G-WP RecoveryClaim fence + F-WP-007 `ExecutionLeaseManager` provide reusable fencing/idempotency mechanics only | **UNBOUND / FENCE OWNER MUST BE ADJUDICATED** — `BLOCKED_ROUTING_PLACEMENT_INTERFACE_NOT_BOUND` |
| Transport & Delivery | constitutionally owns outbox/inbox/delivery attempts/dedupe/order/replay/ack/dead-letter; current exact contract not frozen | durable command/event delivery ref, dedupe identity, declared ordering scope, acknowledgement/quarantine standing | every wakeup/reconnect treats delivery as hint; durable runtime state re-read before action | lost/duplicate/reordered delivery cannot lose or duplicate semantic work | F-WP-007 `F-RQ-053` requires durable intent/observation/reconciliation and rejects distributed ACID; useful principle, not Transport API | **UNBOUND** — `BLOCKED_TRANSPORT_REDISCOVERY_CONTRACT_NOT_BOUND` |
| Effect / Action Authority | constitutional owner is Effect / Action Authority; current implementation standing remains current/historical partial | exact effect identity/intent, commit-time authorization, idempotency/conflict identity, immutable commit/unknown receipt, compensation/reconciliation metadata | authority must be current at commit/reconcile boundary; old plan/change approval never self-authorizes a changed effect | Durable Runtime persists UNKNOWN/RECONCILING and effect refs; never blindly retries; does not interpret tool exit as commit | **Strong F-WP donor**: F-RQ-013..017,022,026,028..030,053 plus F-WP-008/009 evidence/recovery guards; `ChangeCoordinator`, `ExecutionLeaseManager`, conflict/effect recovery mechanics | **SEMANTIC DENOMINATOR RECOVERED; CURRENT SERVICE CONTRACT UNBOUND** — `BLOCKED_EFFECT_AUTHORITY_RECONCILIATION_CONTRACT_NOT_BOUND` |
| Evidence, Provenance & Assurance | constitutional evidence owner; current standing substantial but exact continuity ingestion/outbox seam not frozen here | immutable evidence object/receipt ref, evidence class, subject/digest, freshness/invalidation, claim-support linkage | runtime may emit evidence intent, but standing is re-derived by Evidence/Assurance and invalidated on material subject change | semantic state and durable evidence-outbox intent commit together when required; delivery is replayable; runtime cannot mark PASS | F-WP-008 F-RQ-027/040/058 + F-WP-011 projections; G-WP continuity publisher | **PARTIAL** — `BLOCKED_EVIDENCE_ASSURANCE_INTERFACE_NOT_BOUND` |
| Security / Privacy / Secrets / Crypto | constitutional owner; exact current shared security/secret service seam not frozen in current Foundation subtree | current authorization/purpose/data/security decision refs, secret capability refs, cryptographic verification requirements | re-read at consequential boundaries and after revocation/policy/key/provider changes; unknown material security standing fails closed | secrets never persisted in ordinary continuity state/evidence; runtime stores refs only | F-WP-003 F-RQ-007, F-WP-005 F-RQ-041/049, F-WP-006 F-RQ-014/050, F-WP-009 F-RQ-031/048 | **SEMANTIC GUARDS RECOVERED; SERVICE CONTRACT UNBOUND** — `BLOCKED_SECURITY_POLICY_BINDING_NOT_BOUND` |
| Contracts & Versioning | current frozen Contracts/Versioning owner already bound by predecessor | exact contract subject/version/digest, compatibility receipt, migration edge/checkpoint, lifecycle standing | structural/version compatibility must be current at replay/migration; version arithmetic never substitutes | checkpoint/journal migration/replay blocks on unknown/incompatible | F-WP-012 F-RQ-054..057 is reusable migration/crosswalk/export substrate but current Contracts freeze outranks it | **BOUND TO CURRENT CONTRACTS; F-WP = ADAPT/PROVENANCE** |
| Identity / Principal / Delegation | current frozen Identity/Delegation owner already bound by predecessor | current principal/grant/standing/generation receipt | re-read current grant/standing/generation at authority-sensitive restart/effect boundaries | stale/revoked/generation-advanced authority cannot resume effectful mutation | F-WP-005/006/009 approval/grant/break-glass rules remain useful cross-checks, but current Identity is authoritative | **BOUND TO CURRENT IDENTITY; F-WP = ADAPT/PROVENANCE** |
| Keel | current frozen Keel owner already bound | exact governed goal revision + ceilings | recovery may not broaden or substitute a newer/different goal; material goal change invalidates old evidence/plan assumptions | every recovery episode preserves exact goal/work lineage once Work binding exists | F-WP scope/risk/change constraints can constrain effects but cannot replace Goal authority | **BOUND CONTRACT; GOAL->WORK LINK STILL BLOCKED BY WORK OWNER** |

## 4. F-WP Effect/Change donor adjudication

F-WP is valuable, but its reusable runtime must be split by current authority instead of restored as one monolith.

### Reuse / adapt under Effect / Action Authority

The following historical behaviors should be recovered into the eventual current Effect Authority contract/runtime unless newer evidence supersedes them:

- exact effect/change identity and revision binding;
- commit eligibility only from an exact qualified snapshot;
- explicit expiring/non-transferable execution grant semantics;
- semantic idempotency key + conflicting-reuse rejection;
- monotonic execution epoch/fence for the authority actually owning the effect execution boundary;
- explicit target conflict detection;
- UNKNOWN external effect distinct from NOT_APPLIED;
- pause/halt stops new consequential boundaries without rewriting history;
- cancellation stops future work but does not imply reversal;
- cross-system actions use durable intent/observation/reconciliation rather than distributed-ACID claims;
- success requires authoritative changed-domain verification evidence, not process exit status;
- content-bound evidence receipt for consequential steps;
- current security/provider/compatibility/release standing dominates historical standing;
- current resource admission is consumed, not self-issued.

### Rebind away from historical 021F

These facts belong to current owners and must not remain embedded as F-WP-private authority:

- principal/delegation standing -> Identity / Principal / Delegation;
- structural/version compatibility -> Contracts & Versioning;
- resource admission/capacity -> Resource Admission & Budgeting;
- provider/capability route -> Capability Registry & Routing;
- executor assignment/placement fence if owned there -> Execution Placement;
- transport delivery -> Transport & Delivery;
- evidence standing -> Evidence, Provenance & Assurance;
- deployment desired/observed convergence -> its current deployment/operations owner, not continuity;
- incident declaration/containment -> incident/operations authority, not continuity;
- secret values/key custody -> Security/Secrets authority.

## 5. Continuity-specific Effect seam — recovered minimum requirements

A future exact Effect Authority service contract consumed by Durable Runtime must satisfy at least these recovered semantic obligations before continuity can build its P6 Effect Reconciliation record family:

1. immutable effect identity bound to exact current subject/revision/target/operation intent;
2. explicit commit-time authorization result with expiry/current-standing semantics;
3. idempotency/conflict identity separate from transport delivery identity;
4. immutable effect observation/commit receipt identity and digest;
5. explicit `UNKNOWN/RECONCILING` outcome for ambiguous commit;
6. query/reconciliation operation that is safe after lost acknowledgement;
7. no automatic reissue while outcome is UNKNOWN/PENDING/DIVERGED;
8. explicit confirmed-not-applied disposition before a *new* effect may be considered;
9. compensation/recovery metadata that does not pretend rollback is always possible;
10. exact evidence refs and evidence class without raw secret/private payload dumping;
11. current Identity, policy/security, Contracts, Resource and route/placement prerequisites consumed as owner receipts rather than private F-WP truth;
12. verification standing separate from process/tool exit status.

These are recovered semantic requirements, not invented wire type names.

## 6. Cross-owner test additions to the 80-case persistence floor

The 80-case owner-local persistence denominator remains non-shrinkable. Available evidence now requires the following **minimum additive seam categories** once exact service contracts exist:

- Effect authority current-vs-stale/expired/revoked grant and exact subject binding;
- UNKNOWN effect lost-ack reconciliation without duplicate mutation;
- idempotency-key same-semantics replay vs conflicting-semantics rejection;
- current resource grant stale/expired/deferred/unknown rejection;
- stale placement fence / reassigned executor rejection;
- duplicate/lost/reordered Transport wakeup with durable-state rediscovery;
- Evidence outbox replay without duplicate standing;
- security/secret-ref revocation and no-secret-persistence assertions;
- Contracts migration incompatible/unknown fail-closed;
- current Identity generation/revocation revalidation;
- Work/Plan supersession/cancellation revalidation after those owners are recovered.

No final numeric cross-owner denominator is frozen until exact current contracts are available; doing so now would invent interfaces.

## 7. Materially blocked seams and independent progress

The lane is **not** fully blocked. Work/Project and Orchestration remain source-authority blocked, but independent owner-valid work can continue on Effect/Action archaeology because F-WP contains a strong recovered semantic/runtime substrate and the current architecture explicitly names Effect Authority as a separate owner.

No historical F-WP PASS or A-01 result is transferred. No F-WP class is current merely because it exists in a donor branch.

## 8. One dependency-valid successor

**`CORE-DURABLE-RUNTIME-CONTINUITY-EFFECT-SEAM-REBIND-001`**

Recover the exact F-WP Effect/Change runtime paths needed by the 12-point continuity Effect seam above, including `ChangeCoordinator`, `ExecutionLeaseManager`, execution-grant/authority contracts, verification/evidence publisher, recovery coordinator, integrity quarantine, contract/migration substrate and their tests. Classify each implementation path `REUSE / ADAPT / CONSOLIDATE / QUALIFIER_ONLY / PROVENANCE_ONLY / GAP`. Rebind Identity/Contracts/Resource/Route/Placement/Evidence/Security dependencies to current owners; do not promote private historical wrappers. Freeze a consumed Effect Authority semantic contract only if owner collision = 0 and current commit-time authority remains explicit. Build nothing until that contract and its test denominator are frozen.

If a newer live owner head appears, reread and reconcile before mutation.

## 9. Evidence fence

This unit claims repository recovery, ownership adjudication and bounded semantic requirements only. It claims no current Effect Authority implementation, no current runtime PASS, no historical PASS transfer, no A-01/native/production result, no real provider/credential standing, no human evidence, and no specialist-system correctness.