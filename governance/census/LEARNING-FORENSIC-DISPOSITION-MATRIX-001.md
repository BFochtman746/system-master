# Learning Forensic Disposition Matrix 001

Status: **ACTIVE ADJUDICATION OUTPUT / CURRENT-AUTHORITY-BOUND / NO PASS TRANSFER**  
Effective date: 2026-09-14  
Owner: `SYSTEM_MASTER/LEARNING`  
Parent objective: `LEARNING-FORENSIC-BASELINE-CURRENT-AUTHORITY-ADJUDICATION-001`

## Governing authority

This matrix adjudicates the frozen September 11, 2026 Learning forensic recovery against the current System Master authority without rewriting historical evidence.

Current authority set:

- `governance/CURRENT-AUTHORITY.json` — `CURRENT-AUTHORITY-005`
- `governance/SYSTEM-TOPOLOGY-007.json`
- `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
- `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
- `learning/control-v1/LEARNING-CONTROL-RECORD-v5.md`
- `docs/governance/LEARNING_FORENSIC_BASELINE_FREEZE_2026-09-11.md`

The frozen evidence classes remain:

1. Learning forensic audit
2. Learning requirement ledger
3. Learning interface ledger
4. Learning archive inventory
5. Learning gap register

Exact filenames/IDs for those five recovered artifacts have not been independently re-established from the connected repository evidence. This matrix therefore does not invent them. Verified historical repository artifacts may support individual rows, but older branches/artifacts do not become current truth merely because they are available.

## Disposition vocabulary

- `CARRY_FORWARD_CURRENT_OWNER` — semantic requirement remains valid under current ownership.
- `CARRY_FORWARD_WITH_PLATFORM_DEPENDENCY` — Learning semantic requirement remains valid but depends on a current shared platform contract.
- `ADAPT_TO_CURRENT_AUTHORITY` — recovered intent remains useful, but topology/owner/interface binding must be rewritten for current authority.
- `PEER_INTERFACE_REQUIRED` — capability belongs to another current peer; Learning may consume it only through an explicit interface.
- `HISTORICAL_EVIDENCE_ONLY` — evidence remains valid only for its original subject/provenance and does not define current work by itself.
- `HUMAN_OR_EXTERNAL_BLOCKED` — cannot be completed by repository work alone.
- `UNRESOLVED_EVIDENCE_IDENTITY` — the governing recovered class is known, but exact item identity/content has not been independently re-established.
- `RETIRED_ARCHITECTURE_NO_RESTORE` — old architecture assumption is preserved only as history and must not be revived.

## A. Frozen forensic evidence classes

| ID | Frozen evidence class | Current disposition | Result |
|---|---|---|---|
| F01 | Learning forensic audit | `CARRY_FORWARD_CURRENT_OWNER` | Governing recovery frame. Use it to interpret recovered Learning intent, not to restore superseded topology. |
| F02 | Learning requirement ledger | `UNRESOLVED_EVIDENCE_IDENTITY` + semantic adjudication below | Exact recovered ledger artifact identity is not independently verified. Verified requirement groups are dispositioned in section B. Unknown item-level entries remain unresolved rather than inferred. |
| F03 | Learning interface ledger | `ADAPT_TO_CURRENT_AUTHORITY` | Verified historical Learning→System Master interface evidence exists, but it binds Topology 005 and must be replaced/rebound to current nine-peer authority. |
| F04 | Learning archive inventory | `HISTORICAL_EVIDENCE_ONLY` + identity evidence below | Archive/import hashes and historical artifacts remain provenance. They do not become current implementation authority. |
| F05 | Learning gap register | `CARRY_FORWARD_CURRENT_OWNER` | Every unresolved September 11 gap remains open until explicitly resolved. Current gaps are enumerated in section F without shrinking the original register by inference. |

## B. Learning requirement dispositions

| ID | Recovered/verified Learning requirement | Current owner | Capability | Disposition | Current-authority result |
|---|---|---|---|---|---|
| R01 | Course and curriculum identity | `SYSTEM_MASTER/LEARNING` | C07 CURRICULUM | `CARRY_FORWARD_CURRENT_OWNER` | Remains Learning-owned. |
| R02 | Prerequisite/subskill curriculum graph, including the recovered 66-source-node structure | `SYSTEM_MASTER/LEARNING` | C07 CURRICULUM | `CARRY_FORWARD_CURRENT_OWNER` | Graph semantics survive. Historical graph/index artifacts remain exact-subject evidence only. |
| R03 | Curriculum/compiler selection of valid next instructional node | `SYSTEM_MASTER/LEARNING` | C07 + C18 | `CARRY_FORWARD_CURRENT_OWNER` | Learning retains prerequisite and sequencing authority. Shared routing cannot override Learning gates. |
| R04 | Assessment-target definitions and binding to curriculum nodes | `SYSTEM_MASTER/LEARNING` | C07 + C18 | `CARRY_FORWARD_CURRENT_OWNER` | Assessment targets remain Learning semantics. |
| R05 | Independent scoring/correctness oracle | `SYSTEM_MASTER/LEARNING` | C18 LEARNING | `CARRY_FORWARD_CURRENT_OWNER` | Correctness cannot be self-authorized by Chat text or generic artifact success. |
| R06 | Learner-state semantics | `SYSTEM_MASTER/LEARNING` | C18 LEARNING | `CARRY_FORWARD_CURRENT_OWNER` | Canonical learner state remains Learning-owned. |
| R07 | Mastery-state transitions and practice-not-mastery separation | `SYSTEM_MASTER/LEARNING` | C18 LEARNING | `CARRY_FORWARD_CURRENT_OWNER` | Practice evidence cannot silently become mastery evidence. |
| R08 | Adaptive sequencing and prerequisite enforcement | `SYSTEM_MASTER/LEARNING` | C07 + C18 | `CARRY_FORWARD_CURRENT_OWNER` | Learning selects dependency-valid progression. |
| R09 | Misconception handling and remediation behavior | `SYSTEM_MASTER/LEARNING` | C18 LEARNING | `CARRY_FORWARD_CURRENT_OWNER` | Remains Learning semantic state/behavior. |
| R10 | Retention scheduling, due-state, and delayed-check semantics | `SYSTEM_MASTER/LEARNING` | C18 LEARNING | `CARRY_FORWARD_CURRENT_OWNER` | Delayed evidence gates remain Learning-owned. |
| R11 | Transfer-state and novel-transfer evidence semantics | `SYSTEM_MASTER/LEARNING` | C18 LEARNING | `CARRY_FORWARD_CURRENT_OWNER` | Real transfer outcomes still require real evidence. |
| R12 | Learning-specific evidence classification and qualification semantics | `SYSTEM_MASTER/LEARNING` | C18 LEARNING | `CARRY_FORWARD_WITH_PLATFORM_DEPENDENCY` | Learning defines semantic evidence meaning; CORE-owned P03/P08 provide shared retention/qualification infrastructure. |
| R13 | Progress/status/blocked-boundary/next-action representation | `SYSTEM_MASTER/LEARNING` | C18 LEARNING | `CARRY_FORWARD_CURRENT_OWNER` | Progress may be displayed externally but its meaning comes from durable Learning state. |
| R14 | Privacy-preserving learner evidence and data minimization | `SYSTEM_MASTER/LEARNING` semantic policy + CORE shared infrastructure | C18 + P03 | `CARRY_FORWARD_WITH_PLATFORM_DEPENDENCY` | Raw learner responses must not be promoted into generic telemetry merely for integration convenience. |
| R15 | Learning-specific accessibility of instructional/assessment behavior | `SYSTEM_MASTER/LEARNING`; generic product experience remains CORE | C07/C18 + C12 interface | `ADAPT_TO_CURRENT_AUTHORITY` | Split instructional accessibility from generic product-shell accessibility; do not move all accessibility semantics into either lane. |
| R16 | Real participant consent and real learner evidence | Human authority | — | `HUMAN_OR_EXTERNAL_BLOCKED` | Repository work may prepare the boundary but cannot fabricate consent, responses, mastery, retention, or transfer. |
| R17 | Psychometric validity, SME approval, certification equivalence | Human/external authority | — | `HUMAN_OR_EXTERNAL_BLOCKED` | Remains explicitly unproven until genuine authority/evidence exists. |

## C. P00–P15 platform disposition for Learning

Crosswalk 003 states that every capability depends on P00–P15. These requirements remain CORE-owned platform requirements; Learning consumes them without ownership transfer.

| Platform | Requirement | Crosswalk 003 standing | Learning disposition | Current note |
|---|---|---|---|---|
| P00 | Authority pointer of record | OWED | `PEER_INTERFACE_REQUIRED` | Consume `CURRENT-AUTHORITY-005`; Learning must not create a parallel selector. |
| P01 | System topology and ownership allocation | OWED | `PEER_INTERFACE_REQUIRED` | Consume Topology 007 / Allocation 006. |
| P02 | Work obligation registry | OWED | `ADAPT_TO_CURRENT_AUTHORITY` | Crosswalk 003 still names Registry 013, while current authority selects Registry 014. Treat 014 as live authority and record the stale crosswalk implementation pointer as a CORE metadata delta, not a Learning owner change. |
| P03 | Evidence store and retention | BUILT | `PEER_INTERFACE_REQUIRED` | Learning evidence semantics remain C18; shared durable evidence storage/retention is CORE-owned. |
| P04 | Content-addressed authority writes | OWED | `PEER_INTERFACE_REQUIRED` | Learning requires the shared authority-write contract where current control/evidence writes use it. |
| P05 | Governance schema validation | OWED | `PEER_INTERFACE_REQUIRED` | Learning control artifacts consume shared validation rather than defining a private validator authority. |
| P06 | Control gateway dispatch and admission | OWED | `PEER_INTERFACE_REQUIRED` | Learning commands/admission must integrate through the shared control gateway. |
| P07 | A-01 admission barrier | OWED | `PEER_INTERFACE_REQUIRED` | A-01 remains shared infrastructure; it is not a separate Learning system. |
| P08 | Qualification execution and PASS semantics | OWED | `PEER_INTERFACE_REQUIRED` | Learning owns semantic oracles; platform owns shared qualification execution/PASS infrastructure. No PASS transfers to changed subjects. |
| P09 | Repair broker and durable repair lineage | OWED | `PEER_INTERFACE_REQUIRED` | Learning defects may use shared repair infrastructure without moving Learning semantics to CORE. |
| P10 | Second-shift supervisor: lanes, leases, fencing | OWED | `PEER_INTERFACE_REQUIRED` | Learning remains its own lane under shared supervision. |
| P11 | Night scheduler and claim authority | OWED | `PEER_INTERFACE_REQUIRED` | Shared scheduling cannot create new Learning semantic authority. |
| P12 | GitHub→A-01 ingress transport | OWED | `PEER_INTERFACE_REQUIRED` | Transport only; no semantic ownership transfer. |
| P13 | Model routing and local inference | ABSORBED into C20 LOCALAI | `PEER_INTERFACE_REQUIRED` | Learning may consume inference through CORE/C20; model execution does not own Learning correctness/mastery semantics. |
| P14 | Connector action runtime | ABSORBED into C27 PLUGINS | `PEER_INTERFACE_REQUIRED` | External actions route through CONNECTED_ACTIONS/C27 and retain explicit user-action authority requirements. |
| P15 | Observability, morning receipt and rollback | OWED | `PEER_INTERFACE_REQUIRED` | Shared observability may report Learning state but cannot infer Learning effectiveness or rewrite Learning evidence. |

## D. Required peer-interface dispositions

| ID | Peer boundary | Disposition | Required current contract behavior |
|---|---|---|---|
| I01 | SYSTEM_MASTER / CORE / CHAT ↔ LEARNING | `ADAPT_TO_CURRENT_AUTHORITY` | Replace the Topology-005 Learning→System Master contract with a Topology-007/current-authority contract. Product orchestration and presentation may invoke Learning; Learning retains learner/curriculum/assessment/mastery authority. |
| I02 | CORE shared transport/auth/idempotency/trace ↔ LEARNING | `PEER_INTERFACE_REQUIRED` | Shared request envelope, authorization plumbing, idempotency and trace transport; Learning owns state-transition meaning. |
| I03 | DOCUMENTS ↔ LEARNING | `PEER_INTERFACE_REQUIRED` | Generic document/file/PDF/PPTX/DOCX artifact mechanics remain Documents-owned. Artifact success is not Learning completion/mastery. |
| I04 | RESEARCH_KNOWLEDGE ↔ LEARNING | `PEER_INTERFACE_REQUIRED` | Research, provenance and knowledge retrieval remain Research/Knowledge-owned; Learning consumes verified source/provenance inputs and decides instructional use. |
| I05 | MEDIA ↔ LEARNING | `PEER_INTERFACE_REQUIRED` | Image/audio/video/voice/audiobook mechanics remain Media-owned; Learning owns pedagogical sequencing/evidence semantics. |
| I06 | CONNECTED_ACTIONS ↔ LEARNING | `PEER_INTERFACE_REQUIRED` | Browser/calendar/comms/plugin actions remain Connected Actions-owned and require explicit user authority for side effects. |
| I07 | SPREADSHEET_DATA ↔ LEARNING | `PEER_INTERFACE_REQUIRED` | Spreadsheet/math/data/ledger mechanics remain Spreadsheet/Data-owned; Learning owns instructional interpretation/mastery semantics. |
| I08 | BOOK ↔ LEARNING | `PEER_INTERFACE_REQUIRED` | Book/manuscript/Story-Bible canonical state remains Book-owned. Learning may learn from admitted Book content but must not mutate Book canonical state. |
| I09 | PROGRAMMING ↔ LEARNING | `PEER_INTERFACE_REQUIRED` | Software-engineering/Automation/Code/Website Building semantics remain Programming-owned; Learning product semantics remain Learning-owned. |

## E. Verified archive/evidence dispositions

| ID | Verified historical evidence | Exact evidence identity | Disposition | Current use |
|---|---|---|---|---|
| A01 | Original qualified/promoted Learning software boundary | `f49ac9eaf6e0f11894bf47f5d773090b4ef60ebf` | `HISTORICAL_EVIDENCE_ONLY` | Exact-subject PASS remains evidence for that exact subject only; it does not qualify v5/current interfaces. |
| A02 | Baseline import 014 hosted source marker | objective `LEARNING-REPO-BASELINE-IMPORT-014`; transport SHA-256 `704a60f78935270d3d9a79dda97136d308e9fb4584af5521398778176da75387`; source ZIP SHA-256 `8e2e84f093d05c12d1f705f774d4c3964bb76ae395ce5d279d00e8eeb6caa710` | `HISTORICAL_EVIDENCE_ONLY` | Verifies archive/source identity markers. It does not by itself establish the exact contents of the frozen five forensic artifacts. |
| A03 | 66-source-node index / prerequisite-subskill topology evidence | `qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-*` evidence family | `HISTORICAL_EVIDENCE_ONLY` supporting R02/R03 | Semantic design may carry forward through C07; qualification remains exact-subject scoped. |
| A04 | Assessment-target binding/closure evidence | `qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001B-*` evidence family | `HISTORICAL_EVIDENCE_ONLY` supporting R04/R05 | Reuse evidence only where exact unchanged subject/claim permits. |
| A05 | Dependency/evidence adjudication closures | `qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001C-*` evidence family | `HISTORICAL_EVIDENCE_ONLY` | Preserve adjudication provenance; do not treat old dependency ownership as current if it conflicts with Topology 007. |
| A06 | Batch 06 hosted semantic PASS | subject `bd3f7de8490c7cfb6a7dcdd37cc1fa1d4656bced`; hosted run `34545605665`; artifact `10260842444`; digest `sha256:f5460b3273391ee537c1e596e8bbd5088a5e8fc54860c67502a7e4a8167dcf62` | `HISTORICAL_EVIDENCE_ONLY` | Preserves exact Batch 06 PASS and 6/66 realization; does not automatically authorize continuation under changed interface/control subjects. |
| A07 | Ordinal-7 FMEA work packet selected after Batch 06 | requirement `ASQ-CSSGB-2022-I.C.2`, “Basic failure mode and effects analysis (FMEA)” | `HISTORICAL_EVIDENCE_ONLY` | Historical successor intent only. It is not the current successor until the current-authority interface gate below is closed. |
| A08 | Learning→System Master interface contract 001 | `governance/architecture/LEARNING-TO-SYSTEM-MASTER-INTERFACE-CONTRACT-001.json`, binding Learning control head `e3196089f77dde376944a08eac78a697e57d1535`, Topology 005 | `ADAPT_TO_CURRENT_AUTHORITY` | Preserve command/envelope/idempotency/privacy concepts where still valid, but rebind ownership to the nine-peer architecture and fresh exact subject. |
| A09 | Learning Control v4 | `learning/control-v1/LEARNING-CONTROL-RECORD-v4.md` | `RETIRED_ARCHITECTURE_NO_RESTORE` for current startup | Historical control evidence. Topology-005 / old completion bindings are superseded by v5. |
| A10 | Older `learning/impl-*`, `learning/qual-*`, `learning/request-*`, `learning/pilot-*`, `learning/proposed-*`, import/repair branches | Branch families as originally recorded | `HISTORICAL_EVIDENCE_ONLY` | Provenance/recovery sources only unless a current control record explicitly admits an exact subject. |

## F. Current gap register carried forward by this adjudication

| Gap ID | Gap | Class | Blocking effect | Required closure |
|---|---|---|---|---|
| G01 | Exact filenames/IDs and item-level contents of the frozen September 11 audit, requirement ledger, interface ledger, archive inventory and gap register are not independently re-established. | `UNRESOLVED_EVIDENCE_IDENTITY` | Blocks claiming item-for-item forensic closure. Does **not** justify reviving old branches. | Recover exact identities/content with provenance and append them to this matrix without changing already-proven dispositions. |
| G02 | No verified current-authority replacement for Interface Contract 001 is yet admitted. | `CURRENT_INTERFACE_GAP` | Blocks wholesale resume of the old curriculum/compiler successor. | Create `LEARNING-TO-SYSTEM-MASTER-INTERFACE-CONTRACT-002` bound to CURRENT-AUTHORITY-005 / Topology 007 / current peer owners, then qualify changed subject. |
| G03 | Required lateral interfaces to Documents, Research/Knowledge, Media, Connected Actions, Spreadsheet/Data, Book and Programming are not all independently proven as current contracts. | `PEER_INTERFACE_GAP` | Blocks any feature path that requires those peers from silently absorbing their behavior into Learning. | Admit explicit contracts only when the Learning feature path actually needs the peer. Do not create unnecessary coupling. |
| G04 | Crosswalk 003 P02 still names Work Obligation Registry 013 while CURRENT-AUTHORITY-005 now selects Registry 014. | `CORE_METADATA_DELTA` | Does not change Learning ownership; creates stale platform implementation metadata. | CORE reconciliation should update the live crosswalk/derived pointer when next regenerated without rewriting historical Crosswalk 003. |
| G05 | Current v5/current-interface changed subjects do not inherit prior qualification. | `FRESH_EVIDENCE_REQUIRED` | Blocks current PASS claim. | Run fresh qualification for each changed admitted subject. |
| G06 | Genuine participant consent and real learner evidence are absent. | `HUMAN_ONLY` | Blocks real participant pilot/effectiveness claims only. | Obtain genuine explicit consent and real learner evidence. |
| G07 | Psychometric validity / SME approval / certification equivalence are not proven. | `HUMAN_OR_EXTERNAL` | Blocks those claims only. | Obtain appropriate real expert/external evidence. |
| G08 | The baseline source archive has verified hashes, but item-level rehydration of the frozen forensic five is not proven here. | `SOURCE_CUSTODY` | Blocks exact archive-to-ledger one-to-one mapping. | Rehydrate/verify source bytes or recover independently identified artifacts; preserve hashes. |
| G09 | The historical curriculum/compiler obligation contains both current Learning-owned semantics and stale control/interface assumptions. | `WORK_SELECTION` | Prevents replaying the historical successor as one undifferentiated task. | Split continuation: preserve completed exact-subject work, rebind interfaces first, then resume only still-open C07/C18 semantic increments. |

## G. Curriculum/compiler disposition

`LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001` is **not cancelled** and is **not resumed wholesale**.

Current disposition: **`HOLD__SPLIT_AND_RESUME_AFTER_CURRENT_INTERFACE_REBIND`**.

Rules:

1. Completed exact-subject batches remain closed as historical evidence; do not replay them.
2. C07/C18 curriculum, assessment, mastery, adaptation, misconception, retention and transfer semantics remain valid Learning work.
3. Any old assumption that Core/System Master owns Learning semantics is rejected.
4. Any dependency now owned by another peer becomes an explicit interface, not absorbed Learning implementation.
5. Ordinal-7 FMEA is preserved as historical successor evidence but is not the current immediate successor.
6. Fresh qualification is required where current interface/control changes alter the subject or claim.

## H. Exact next executable Learning successor

The smallest dependency-valid successor produced by this matrix is:

**`LEARNING-TO-SYSTEM-MASTER-INTERFACE-CONTRACT-002`**

Job:

- rebind the useful semantic portions of Interface Contract 001 to `CURRENT-AUTHORITY-005` and Topology 007;
- preserve Learning ownership of C07/C18;
- bind System Master/CORE coordination without semantic transfer;
- route generic peer capabilities to their current owners rather than encoding stale four/five-system assumptions;
- retain command/envelope/idempotency/privacy rules only where they remain owner-valid;
- require exact-subject qualification for the changed contract;
- leave optional lateral peer contracts lazy until a concrete Learning path needs them;
- after contract 002 is admitted, re-evaluate `LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001` and resume the first genuinely open C07/C18 increment without replay.

## Closure standing

This matrix completes the **current-authority category-level adjudication** required before feature work can resume. It does **not** claim item-for-item closure of the frozen forensic bundle because G01/G08 remain open evidence-identity/source-custody gaps.

Therefore:

- the frozen September 11 baseline remains governing;
- old branches remain provenance only;
- current Learning semantics are now ownership-dispositioned;
- P00–P15 dependencies are explicitly classified;
- peer boundaries are explicitly classified;
- the old curriculum/compiler successor has an exact current disposition;
- the next executable Learning work is Interface Contract 002, not historical branch replay;
- `LEARNING-FORENSIC-BASELINE-CURRENT-AUTHORITY-ADJUDICATION-001` should remain ACTIVE until G01/G08 item-level evidence identity is either recovered or explicitly adjudicated as unavailable under authority.