# RECON-001A — Evidence Source Map

Status: ACTIVE / INITIAL CENSUS MATERIALIZED

## Evidence precedence

1. Exact-current executable evidence for the exact current subject.
2. Exact-current static/source/contract evidence.
3. Current target/native/provider/human evidence where the claim depends on that environment.
4. Historical exact-subject evidence used only as lineage unless dependency equivalence is proven.
5. Research/build-spec evidence used only for architecture/buildability claims.

No stronger standing may be inferred from a weaker evidence class.

## Canonical source families

| Family | Primary locations | What it may prove | What it may not prove |
|---|---|---|---|
| Assurance control plane | `src/main/java/org/systemmaster/assurance`, `01_ASSURANCE`, `09_QUALIFICATION`, CQ-001/002/003 branches | qualification policy, standing, invalidation, requalification, evidence binding | target/native behavior not actually executed |
| Foundation | Foundation source/control paths, UAF-001 lineage, `system-master/f-wp-*` where consumed | identity, contracts, durable work semantics, evidence/audit, provenance | successor-specialist semantics that moved to 021 authorities |
| Data | `07_DATABASE`, JDBC adapters, migration manifest | durable physical persistence mechanics, schema/migration bindings | domain semantic truth |
| Platform | platform source paths and qualification artifacts | runtime, routing, artifacts, inference/effects, transport/observability substrates | domain truth or Assurance promotion authority |
| System Model / Governance | `00_PROGRAM_CONTROL`, global coverage/build-order artifacts | authority identity, dependency/order, supersession, program-control state | executable capability unless separately evidenced |
| KEEL | KEEL source/control artifacts | goals, requirements, constraints, delegation context | scheduling/execution truth |
| Orchestrator | `src/main/java/org/systemmaster/orchestrator`, vertical-slice integration | work coordination, verification-bound success, retry/recovery composition | goal/domain/effect/qualification authority |
| Continuity / 021G | Continuity branches, G-WP evidence, A-01 receipts | portable recovery, ordinary A-01 integration, Windows reboot target behavior | iOS target behavior until real client executes |
| 021F–021AC | architecture/build-spec repair artifacts plus any later implementation branches | architecture/buildability; implementation only where exact source/evidence exists | production or target standing by architecture closure alone |
| Creative/SDS | Creative Fabric / SDS branches and receipts | bounded creative planning/design composition and portable adapter behavior | universal orchestration or production cutover unless proven |
| Domain modules | module source/recovery branches and module qualification receipts | module semantics and implemented slices | production durability when only recovered/in-memory/portable code exists |
| A-01 control plane | `qualification/a01/*`, registered gateway receipts/artifacts | exact registered Windows/A-01 machine evidence | iOS/Apple/provider/human evidence |

## Required per-system evidence binding

Every active row in `RECON-001A-CURRENT-AUTHORITY-SYSTEM-CENSUS.csv` must eventually bind:

- exact canonical authority ID;
- exact current source ref/SHA or an explicit `NOT_IMPLEMENTED` declaration;
- current requirement/capability contract;
- exact build-spec lineage;
- exact implementation locations;
- exact portable qualification receipts;
- exact live/target/native receipts where applicable;
- dependency closure used by the qualification;
- migration/store/route bindings where applicable;
- supersession aliases and negative authority boundaries;
- evidence freshness and invalidation conditions;
- unresolved residuals and successor-blocking classification.

## Immediate evidence challenges

### P0 — master control correctness
1. `ASSURANCE-001`: prove the current Assurance implementation is complete enough to adjudicate the rest of the system without self-promotion or missing-evidence false PASS.
2. `SYSTEM-MODEL-001`: regenerate the current authority/system registry and dependency DAG from reconciled generations.
3. `SYSTEM-MASTER-BUILD-GOVERNANCE`: prove one current program-control truth and eliminate stale competing next-step ledgers.

### P1 — existing substrate truth
4. FOUNDATION-001..008, DATA-001, PLATFORM-001/002/003/006/008/009/010/011/012: distinguish reusable current implementation from historical-only or specialist-superseded semantics.
5. KEEL-001 and SYSTEM-ORCHESTRATOR: prove the current goal-to-work path and verification-bound success path end to end.
6. MOD-PROJECTS-001: prove or disprove durable Project repository and long-term Project Memory completeness.

### P2 — operating-spine successor decision
7. 021F: normalize current standing.
8. 021G: adjudicate COMPLETE_FOR_BUILD_SUCCESSOR with Windows evidence and explicit iOS deferral until the real client exists.
9. 021H onward: do not assume NOT_STARTED where later source may exist; search exact source/history before finalizing implementation gaps.

## False-completeness traps prohibited

- `RESEARCH_CLOSED` != implemented.
- `BUILD_SPEC_CLOSED` != implemented.
- compile PASS != capability PASS.
- portable PASS != live database PASS.
- A-01 Windows PASS != iOS PASS.
- simulator PASS != physical-device PASS.
- provider acknowledgement != durable semantic completion.
- telemetry presence != evidence standing.
- recovered source != production integration.
- historical exact-subject PASS != current-subject PASS unless equivalence is proven.
- absence of a known failure != proof of completeness.
