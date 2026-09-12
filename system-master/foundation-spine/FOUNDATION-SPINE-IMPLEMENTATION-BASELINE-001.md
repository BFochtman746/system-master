# FOUNDATION-SPINE-IMPLEMENTATION-BASELINE-001

Status: INITIAL CURRENT/ARCHIVAL MAPPING — NOT A COMPLETION CLAIM
Baseline branch input: system-master/control-v2 @ 7367ca60f18dba2e28b8096fdb2febbfb30457e8

This document maps the fresh target architecture to observed current and archival implementation. It intentionally avoids inheriting old component names as architecture authority.

## Status classes

CURRENT_PRESENT = direct implementation/evidence exists in current Core lineage.
CURRENT_PARTIAL = some required implementation is current but the full fresh authority is not yet proven.
HISTORICAL_SUBSTRATE = strong implementation existed in archival spine and is a reuse candidate, but must be mapped/rebound to the fresh authority.
TARGET_REQUIRED = architecture requires the authority; no sufficient current implementation has yet been established.
ENVIRONMENT_UNEXECUTED = implementation may exist, but required target qualification has not run because the environment/path was unavailable.

| Authority | Initial standing | Evidence/reuse direction |
|---|---|---|
| FS-01 Root/Authority | CURRENT_PRESENT | F-WP-001..003 traceability, authority/policy/change governance; current governance records |
| FS-02 Identity/Delegation | CURRENT_PARTIAL | F-WP-005 authorization/approval substrate plus historical identity/security layers |
| FS-03 Contracts/Versioning | CURRENT_PRESENT | F-WP-012 ContractRegistry/Migration/Portability plus historical contract registry |
| FS-04 Intent/Keel | HISTORICAL_SUBSTRATE | strong prior Keel goal/constraint/delegation semantics; fresh current binding required |
| FS-05 Work/Project Control | CURRENT_PARTIAL | durable work substrate exists; long-project/project-control semantics need fresh consolidation |
| FS-06 Planning/Orchestration | HISTORICAL_SUBSTRATE | rich prior Orchestrator exists; duplicate work/execution truth and persistence gaps must be repaired during rebind |
| FS-07 Resource Admission | CURRENT_PARTIAL | historical resource governor exists but durable hierarchical budgets/fairness/backpressure require fresh completion |
| FS-08 Capability/Routing | HISTORICAL_SUBSTRATE | prior capability registry/routing and current reconciliation evidence; bind to fresh contract |
| FS-09 Execution Placement | CURRENT_PARTIAL | F-WP-006 ExecutionGrant + F-WP-007 ExecutionLease/coordination are current; full eligibility/filter/score/bind plane not yet proven |
| FS-10 Durable Runtime | HISTORICAL_SUBSTRATE | strong JDBC durable jobs/attempts/leases/fencing/checkpoints/timers/signals/retry/cancel substrate; preserve/rebind |
| FS-11 Transport/Delivery | HISTORICAL_SUBSTRATE | outbox/inbox/dedup/replay substrate; preserve/rebind |
| FS-12 Context/Memory/Retrieval | TARGET_REQUIRED | context/retrieval features exist across product history but one fresh shared authority is not yet proven |
| FS-13 Model Gateway | HISTORICAL_SUBSTRATE | model routing/structured output/provenance substrate; needs fresh safety/resource/provider binding |
| FS-14 Tool/Connector Gateway | HISTORICAL_SUBSTRATE | connector/tool substrate exists; fresh permission/effect boundary must be enforced |
| FS-15 Effect Authority | CURRENT_PARTIAL | current authorization/grant governance plus historical action authority; commit-time effect boundary to rebind |
| FS-16 Artifact Gateway | HISTORICAL_SUBSTRATE | strong artifact custody/transfer/integrity substrate; scale/native hardening remains |
| FS-17 Canonical Data | CURRENT_PARTIAL | historical canonical DB/recovery plus current SMR021 persistence contracts/handoff; final fresh data contract not closed |
| FS-18 Evidence/Assurance | CURRENT_PRESENT | F-WP-008 verifier/evidence/quarantine plus historical causal evidence/qualification substrate |
| FS-19 Observability | CURRENT_PARTIAL | current metrics/correlation adapters plus historical observability; standardized fresh telemetry contract required |
| FS-20 Recovery/Reconciliation | CURRENT_PRESENT_PARTIAL_SCOPE | F-WP-004 recovery plans + F-WP-009 RecoveryCoordinator plus historical runtime/data recovery; full cross-class recovery integration still required |
| FS-21 Security/Privacy/Crypto | HISTORICAL_SUBSTRATE | substantial prior security/privacy/secrets/crypto; map to fresh unified boundary without merging distinct decision types |
| FS-22 Provider/Dependency Governance | HISTORICAL_SUBSTRATE | prior provider registry/health/dependency controls; fresh supply-chain/quota/deprecation governance binding required |
| FS-23 AI Safety/Model Risk | TARGET_REQUIRED | architecture/research exists; sufficient current runtime authority not established |
| FS-24 Rights/Licensing | TARGET_REQUIRED | declared need; current implementation not established |
| FS-25 UX/Chat/Work Control | CURRENT_PARTIAL | Chat/Experience reconciliation and SMR021 UX/admission work exist; full fresh shared projection/control boundary not closed |
| FS-26 Change/Release/Operator | CURRENT_PRESENT_PARTIAL_SCOPE | F-WP-002..012 provide substantial change/approval/verification/recovery/query/migration governance; release/operator endgame still needs full fresh mapping |

## Current 021F implementation fact

The current Core lineage contains F-WP-001 through F-WP-012 implementation/tests. Its integration binding records a qualified F-WP-012 tip and explicitly states production authorization is false. That evidence is valuable implementation truth, not a reason to make the historical 021F document hierarchy the new architecture.

## Required next implementation census

Each FS authority must eventually receive an exact Requirement -> Component -> Data -> Interface -> Test -> Evidence -> Environment mapping. This baseline is intentionally the bridge from fresh architecture to that later implementation census, not a substitute for it.