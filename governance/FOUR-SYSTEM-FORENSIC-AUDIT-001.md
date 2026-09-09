# FOUR-SYSTEM-FORENSIC-AUDIT-001

Status: **SEALED / CONTROL TOPOLOGY REPAIRED / ANTI-DRIFT CONTROLS ACTIVE**  
Effective date: 2026-09-09  
Repository: `BFochtman746/system-master`

## Executive conclusion

The repository contains exactly **four canonical systems**:

1. **MASTER SYSTEM** — foundation and spine.
2. **LEARNING SYSTEM** — learning-system development and operation.
3. **BOOK SYSTEM** — parent end-to-end book lifecycle/orchestration.
4. **PROSE SYSTEM** — child of BOOK; owns Book Evaluator/evaluation, evaluator training, prose/craft training, diagnostics, revision intelligence and preservation-aware prose optimization.

The recurring disconnect was not evidence of additional intended product systems. It was a control-taxonomy failure: legitimate branches, workstreams, qualification lanes, implementation families, repair lines, chats and infrastructure were repeatedly surfaced at the same semantic level as the four systems.

Repository history had already diagnosed a Book/Prose instance of this failure as `CONTROL_PLANE_SCOPE_CONFLATION`; this audit finds the same class of problem at repository scale.

## Audit scope

The forensic pass inspected:

- canonical `main` and its bootstrap/control-plane files;
- current MASTER, LEARNING, BOOK and PROSE control/authority branches;
- Book/Prose hierarchy and prior hierarchy forensic findings;
- current Learning qualified/pilot lineage and branch family;
- current Prose consolidated state and Book Evaluator relationship;
- A-01 qualification registry/workstream IDs;
- A-01 gateway and enforcement workflows;
- active scheduled second-shift workers;
- branch-name families that visually resemble systems;
- current GitHub branch-protection/ruleset availability;
- current architecture/governance guidance on abstraction vocabulary, ADRs, reusable workflows, rulesets and required status checks.

## Forensic branch census

Observed branch-name families include:

- at least 43 `system-master/*` branches from the current search census;
- at least 89 `learning/*` branches;
- 17 branch names matching `book`;
- 44 branch names matching `a01`;
- 8 branch names matching `continuity`;
- one dedicated `system-master/assurance-reconciliation-001` branch;
- two branch names matching `prose` (`books-literary-prose-001`, `literary-prose-engine-001`).

These branches are legitimate history/execution/candidate objects. They are **not** a system inventory.

The repository must therefore derive identity from the topology registry and canonical controls, never from branch-name enumeration.

## Root causes

### RC-1 — No global cardinality lock

Before this repair there was no repository-level machine authority that said `system_cardinality = 4` and enumerated the four allowed system IDs. Individual workstreams could be internally correct while the portfolio representation drifted.

### RC-2 — Type conflation

The words system, project, engine, branch, workstream, qualification lane, repair line and chat/control surface were used interchangeably in historical work. That made a real execution lane appear to be a new product system.

### RC-3 — Learning lacked a canonical system-control branch

MASTER and BOOK had explicit control branches. Learning had a very large family of `impl`, `qual`, `pilot`, `request`, repair and import branches but no single Learning control record. This allowed the latest/specific branch to be mistaken for current system authority.

### RC-4 — Book/Prose naming drift

Historical labels included `PROSE PROJECT`, `LITERARY PROSE SYSTEM`, `LITERARY PROSE ENGINE`, `BOOK-WRITING-SYSTEM-LITERARY-LANE` and Book Evaluator lanes. The underlying intended relationship was stable—Prose work exists for Book—but labels obscured whether each noun was a peer system, child project, engine or capability.

### RC-5 — MASTER control leaked into portfolio control

The Master control record correctly managed foundation/spine work but also listed Learning, Book Evaluation and Literary Prose specialist boundaries/priorities. This made MASTER look like the project-wide system owner rather than one of the four systems plus shared foundation.

### RC-6 — Active scheduled workers mirrored workstreams rather than the four systems

The active second-shift worker set included standalone Book Evaluation and Assurance identities. Those are meaningful lanes, but they reinforced a false peer-system model.

### RC-7 — A-01 workstream IDs looked like system IDs

The A-01 registry correctly uses execution IDs such as `SYSTEM-MASTER-CONTINUITY`, `SYSTEM-MASTER-ASSURANCE-RECON`, `BOOK-EVAL-LEMONADE-001` and `LITERARY-PROSE`. Without an owner map, those identifiers were easy to interpret as additional systems.

### RC-8 — No native repository write barrier on `main`

At audit time GitHub reported `main` unprotected with no required status checks. A direct repository ruleset request returned HTTP 403 stating that GitHub Pro or a public repository is required for that private-repository feature. Therefore a perfect documentation model alone could still be overwritten by an ungoverned direct push.

## Canonical ownership classification

| Object / label | Classification | Canonical owner |
|---|---|---|
| Foundation, Data, Platform, Operator/Runtime foundation | MASTER scope/subsystems | MASTER |
| Continuity / Recovery | subsystem/workstream | MASTER |
| Assurance / Reconciliation | subsystem/evidence/control function | MASTER |
| A-01 / runner / central scheduler | shared qualification/control infrastructure | MASTER administrative governance; serves all four |
| `learning/*` implementation/pilot/qualification families | system-owned workstreams/history | LEARNING |
| canonical book state / lifecycle / publication / author decision orchestration | parent system scope | BOOK |
| editorial capability crosswalk / parent integration/admission | parent system workstream | BOOK |
| Literary Prose Engine | implementation family | PROSE |
| Book Evaluator / `BOOK-EVAL-LEMONADE-001` | capability + qualification lane | PROSE |
| evaluator/judge training | capability/training lane | PROSE |
| prose/craft training and diagnostic/revision intelligence | system capability scope | PROSE |
| Night Shift / Second Shift | execution worker | infrastructure/control surface |
| qualification IDs / receipts / evidence artifacts | evidence/qualification process | owning system via workstream map |
| chat title / conversation | working control surface | no architecture authority |

## Repairs implemented

### 1. Machine-readable four-system registry

Created `governance/SYSTEM-TOPOLOGY-001.json` with:

- exactly four system IDs: MASTER, LEARNING, BOOK, PROSE;
- `system_cardinality = 4`;
- PROSE parent = BOOK;
- explicit ownership of current A-01 workstream IDs;
- explicit classifications for common non-systems;
- a rule that branch, workstream, chat/task and qualification names cannot implicitly create a system;
- a fifth-system rule requiring explicit user intent plus a superseding topology decision and validator update.

### 2. Immutable architecture decision pattern

Created `governance/ADR-0001-FOUR-SYSTEM-TOPOLOGY.md`. The accepted decision is not silently repurposed. A changed topology requires a superseding ADR.

### 3. Visible repository system map

Created root `SYSTEMS.md` so a human entering the repository sees the four systems before interpreting branch names.

### 4. Cross-chat bootstrap repaired

`SYSTEM-MASTER-WORKSTREAM-BOOTSTRAP.md` now begins with the topology registry and routes every chat to one of four canonical system controls before A-01/workstream interpretation.

### 5. Learning control plane created

Created `learning/control-v1` from exact qualified Learning subject `f49ac9eaf6e0f11894bf47f5d773090b4ef60ebf`, then added `learning/control-v1/LEARNING-CONTROL-RECORD.md` as doc-only control metadata. It explicitly states that historical implementation/pilot/request/qualification branches do not become current Learning authority merely by being newer.

The control commit does not inherit or transfer the exact subject's A-01 qualification.

### 6. Book/Prose hierarchy repaired

Created `BOOK-SYSTEM-PROJECT-HIERARCHY-002.json` on `book-system/control-v1`:

- BOOK is the parent end-to-end system;
- PROSE is the child system;
- Book Evaluator is owned by PROSE as a capability/qualification lane;
- Literary Prose Engine is the PROSE implementation family;
- PROSE cannot self-admit into BOOK canonical state.

### 7. Prose current control naming repaired

Created `PROSE-SYSTEM-PARENT-BINDING-002.json` and `LITERARY-PROSE-CONSOLIDATED-WORKSTREAM-STATE-013.json`. Technical/evidence standing from the prior state is preserved; only control taxonomy changed.

### 8. MASTER scope repaired

Updated `SYSTEM-MASTER-V2-CONTROL-RECORD.md` so its priority queue contains MASTER work only. Learning, Book and Prose appear only as inter-system interface boundaries, not entries in the MASTER work queue.

MASTER's technical next objective remains `SMR020 / OPERATOR-OPS-001`.

### 9. Topology validator

Created `.github/scripts/validate-system-topology.js`. It fails if:

- the system set is not exactly MASTER/LEARNING/BOOK/PROSE;
- cardinality is not four;
- PROSE is not parented to BOOK;
- implicit-system-creation guards are removed;
- an A-01 workstream lacks ownership by one of the four systems;
- required non-system classifications disappear.

The temporary duplicate Python validator was removed so there is one canonical implementation.

### 10. Control-plane enforcement

`A-01 Control Plane Enforcement` now executes the four-system validator before its existing A-01 governance checks. Hosted run `34386305934` passed with the explicit `Enforce canonical four-system topology` step successful.

After the gateway fail-closed binding, run `34386622023` also completed successfully on exact main subject `d0eae0ebdfd2d66c697d7adbccec6394f13772e2`.

### 11. A-01 gateway fail-closed binding

The canonical A-01 gateway now runs the same Node topology validator immediately after canonical control-plane checkout and **before** runner health, subject acquisition or qualification execution. An invalid/unmapped system topology therefore cannot be admitted to A-01 through the canonical gateway.

### 12. Scheduled worker topology repaired

Active recurring second-shift workers now mirror exactly the four systems:

- `Master System Second Shift`
- `Learning System Second Shift`
- `Book System Second Shift`
- `Prose System Second Shift`

The shared `Four-System Portfolio Controller` and `Four-System Morning Handoff` are explicitly infrastructure/control summaries, not systems.

The Book worker is parent-lifecycle focused. The Prose worker owns Book Evaluator/evaluator training/prose training. The Master worker nests Assurance and Continuity. Learning starts from `learning/control-v1`.

## Current technical critical paths preserved by the taxonomy repair

### MASTER

`SMR020 / OPERATOR-OPS-001 — Governed Operations + Readiness + Commissioning + Recovery + Human Control Foundation`.

### LEARNING

Machine-side final-human-execution software qualification is complete on exact tested subject `f49ac9eaf6e0f11894bf47f5d773090b4ef60ebf`; real participant execution remains HUMAN-bound. Dependency-valid non-human Learning development continues under `learning/control-v1` rather than treating the human pilot blocker as the entire system.

### BOOK

`BOOK-SYSTEM-EDITORIAL-CAPABILITY-CROSSWALK-001` remains the current parent critical path: prove reuse/equivalence across Creative Excellence, PROSE and Book Evaluator capabilities before adding a new editorial engine, then amend the parent lifecycle where real gaps remain.

### PROSE

`PROSE-REAL-LIMITATION-GROUND-TRUTH-001` remains the current child-system critical path: acquire independent human/editor or explicit-author ground truth for real passage limitations, then blindly measure the already-qualified semantic/Step-F path without granting revision authority.

## What was not changed

This audit deliberately did **not** rename/rebase/delete historical branches or rewrite historical evidence. Those names are part of durable provenance and may be referenced by exact-SHA receipts, tickets, documents and artifacts.

Topology metadata also does not broaden hosted/A-01 qualification, author authority, human evidence, private-data authority, publication/production standing or native-platform evidence.

## Research-backed governance rationale

The adopted design follows three external governance principles:

1. Use a small, explicit architecture abstraction vocabulary; lower-level components/workstreams do not automatically become software systems.
2. Treat accepted architecture decisions as durable records and supersede them explicitly rather than silently changing their meaning.
3. Centralize deterministic governance in reusable/versioned workflow logic and require status checks/rules where repository plan capabilities permit.

## Residual risk and hard-lock limitation

The current private repository does not presently have GitHub branch protection/rulesets enabled, and the ruleset API reports that the available account/repository configuration must upgrade to GitHub Pro or make the repository public to enable that feature.

Therefore the present no-extra-cost lock is **fail-closed control-plane enforcement**, not an absolute pre-write server-side prohibition. A direct ungoverned push could temporarily land on `main`; however:

- topology-changing/control-plane paths trigger hosted enforcement;
- the canonical A-01 gateway independently validates topology before qualification admission;
- all agents/workers/bootstrap routes now read topology first;
- an unmapped A-01 workstream causes validator failure;
- scheduled portfolio/handoff workers are constrained to four systems.

If private-repository branch protection/rulesets become available later, the recommended final hardening is to make the topology/control-plane status check required for `main` and canonical control branches and restrict bypass/force-push as appropriate.

## Permanent operating invariants

1. Portfolio/system reports contain exactly four system headings: MASTER, LEARNING, BOOK, PROSE.
2. PROSE is a child of BOOK but remains a real system with its own critical path.
3. Book Evaluator is inside PROSE, not a peer/fifth system.
4. Assurance, Reconciliation and Continuity are inside MASTER.
5. A-01, runners, qualification and second-shift workers are infrastructure/evidence, not systems.
6. A branch/workstream/chat cannot create architecture identity.
7. Every new workstream must resolve to one of the four system IDs before execution or qualification admission.
8. `SYSTEM_TOPOLOGY_FAILURE` outranks continuation when ownership is missing or contradictory.
9. Exact-SHA qualification never transfers because topology/control metadata changed.
10. A fifth system requires explicit user intent and a superseding topology ADR + registry/validator change.

## Forensic disposition

**TOPOLOGY: RECONCILED**  
**FOUR-SYSTEM CARDINALITY: LOCKED IN REPOSITORY CONTROL PLANE**  
**LEARNING CONTROL GAP: REPAIRED**  
**BOOK/PROSE/EVALUATOR OWNERSHIP: REPAIRED**  
**MASTER PORTFOLIO-SCOPE LEAK: REPAIRED**  
**SECOND-SHIFT IDENTITY DRIFT: REPAIRED**  
**A-01 UNMAPPED-WORKSTREAM ADMISSION: FAIL-CLOSED**  
**NATIVE GITHUB PRE-WRITE RULESET LOCK: NOT AVAILABLE UNDER CURRENT PRIVATE-REPOSITORY PLAN**

Future reconciliation should start from `SYSTEMS.md` -> `SYSTEM-TOPOLOGY-001.json` -> the four canonical system control records, then reconcile only subordinate workstreams/evidence inside those owners.
