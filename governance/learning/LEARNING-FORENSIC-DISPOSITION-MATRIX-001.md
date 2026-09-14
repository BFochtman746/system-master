# Learning Forensic Disposition Matrix 001

**Status:** ACTIVE — current-authority anchors adjudicated; exact frozen source identities pending  
**Effective:** 2026-09-14  
**Owner:** `SYSTEM_MASTER/LEARNING`  
**Governing obligation:** `LEARNING-FORENSIC-BASELINE-CURRENT-AUTHORITY-ADJUDICATION-001`

## Authority frame

This matrix implements the September 11 Learning forensic-baseline freeze under the current System Master architecture:

- `CURRENT-AUTHORITY-005`
- `SYSTEM-TOPOLOGY-007`
- `SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006`
- `SYSTEM-MASTER-CAPABILITY-CROSSWALK-003`
- `LEARNING-CONTROL-RECORD-v5.md`
- `docs/governance/LEARNING_FORENSIC_BASELINE_FREEZE_2026-09-11.md`

It does **not** promote historical Learning branches to current truth. It does **not** infer missing forensic rows. It does **not** transfer PASS across changed subjects.

## 1. Frozen source-identity gate

The five evidence classes are frozen authority inputs, but their exact artifact filenames/SHAs/IDs are not independently established in the live Learning tree. That absence remains visible rather than being repaired by guesswork.

| ID | Frozen evidence class | Exact identity | Disposition | Required next action |
|---|---|---|---|---|
| LFS-01 | Learning forensic audit | Not yet verified | `GAP_SOURCE_IDENTITY_UNRESOLVED` | Bind exact artifact provenance |
| LFS-02 | Learning requirement ledger | Not yet verified | `GAP_SOURCE_IDENTITY_UNRESOLVED` | Bind exact ledger, then append original requirement rows |
| LFS-03 | Learning interface ledger | Not yet verified | `GAP_SOURCE_IDENTITY_UNRESOLVED` | Bind exact ledger, then map every recovered interface to its current peer owner |
| LFS-04 | Learning archive inventory | Not yet verified | `GAP_SOURCE_IDENTITY_UNRESOLVED` | Bind exact inventory and exact provenance where verifiable |
| LFS-05 | Learning gap register | Not yet verified | `GAP_SOURCE_IDENTITY_UNRESOLVED` | Bind exact register and retain every unresolved gap until evidence closes it |

**Rule:** the matrix may grow when these sources are found, but their original identities and row IDs must not be rewritten or silently renumbered.

## 2. Learning-owned semantic anchors

These rows are current-authority ownership anchors. They are **not substitutes for missing forensic ledger rows**.

| Row | Subject | Capability | Owner | Current disposition | Evidence boundary |
|---|---|---|---|---|---|
| LA-001 | Learner/mastery state | C18 LEARNING | LEARNING | `CARRY_FORWARD` | Authority anchor only until matched to frozen evidence |
| LA-002 | Curriculum and curriculum/compiler behavior | C07 CURRICULUM | LEARNING | `CARRY_FORWARD` | Semantic ownership survives; old implementation program remains HOLD |
| LA-003 | Assessment and adaptive sequencing | C18 LEARNING | LEARNING | `CARRY_FORWARD` | No historical PASS transfers to a changed subject |
| LA-004 | Misconception handling | C18 LEARNING | LEARNING | `CARRY_FORWARD` | Authority anchor only until matched to frozen evidence |
| LA-005 | Retention and transfer design | C18 LEARNING | LEARNING | `CARRY_FORWARD` | Real learner outcomes require real evidence |
| LA-006 | Learning-specific product qualification semantics | C18 LEARNING | LEARNING + CORE P08 interface | `CARRY_FORWARD_WITH_INTERFACE_ADAPTATION` | Learning owns domain meaning; CORE owns shared PASS execution semantics |

## 3. P00–P15 platform disposition

Learning consumes the shared platform; it does not absorb it.

| Platform | Shared requirement | Current owner | Learning disposition |
|---|---|---|---|
| P00 | Authority pointer of record | CORE | `INTERFACE_REQUIRED` |
| P01 | System topology and ownership allocation | CORE | `INTERFACE_REQUIRED` |
| P02 | Work obligation registry | CORE | `INTERFACE_REQUIRED` |
| P03 | Evidence store and retention | CORE | `INTERFACE_REQUIRED` |
| P04 | Content-addressed authority writes | CORE | `INTERFACE_REQUIRED` |
| P05 | Governance schema validation | CORE | `INTERFACE_REQUIRED` |
| P06 | Control gateway dispatch and admission | CORE | `INTERFACE_REQUIRED` |
| P07 | A-01 admission barrier | CORE | `INTERFACE_REQUIRED` |
| P08 | Qualification execution and PASS semantics | CORE | `INTERFACE_REQUIRED` |
| P09 | Repair broker and durable repair lineage | CORE | `INTERFACE_REQUIRED` |
| P10 | Second-shift lanes, leases and fencing | CORE | `INTERFACE_REQUIRED` |
| P11 | Night scheduler and claim authority | CORE | `INTERFACE_REQUIRED` |
| P12 | GitHub → A-01 ingress transport | CORE | `INTERFACE_REQUIRED` |
| P13 | Model routing and local inference, absorbed into C20 | CORE | `INTERFACE_REQUIRED` |
| P14 | Connector action runtime, absorbed into C27 | CORE | `INTERFACE_REQUIRED` |
| P15 | Observability, morning receipt and rollback | CORE | `INTERFACE_REQUIRED` |

No P requirement becomes Learning-owned merely because Learning depends on it.

## 4. Lateral peer boundaries

| Peer | Peer-owned subject | Learning disposition | Boundary rule |
|---|---|---|---|
| BOOK | Canonical Book/manuscript/Story-Bible state | `INTERFACE_REQUIRED_IF_NEEDED` | Learning does not own authoring/canon state |
| DOCUMENTS | Generic document/artifact mechanics | `INTERFACE_REQUIRED` | Learning content may use outputs; mechanics remain DOCUMENTS-owned |
| SPREADSHEET_DATA | Spreadsheet/math/data/ledger mechanics | `INTERFACE_REQUIRED_IF_NEEDED` | Consumption does not transfer ownership |
| MEDIA | Image/audio/video/voice/audiobook/media mechanics | `INTERFACE_REQUIRED` | Learning owns instructional intent; MEDIA owns generic mechanics |
| CONNECTED_ACTIONS | Browser/calendar/comms/plugins and side-effect policy | `INTERFACE_REQUIRED_IF_NEEDED` | Learning does not inherit external side-effect authority |
| RESEARCH_KNOWLEDGE | Research, knowledge and provenance semantics | `INTERFACE_REQUIRED` | Learning consumes research/provenance through an admitted interface |
| PROGRAMMING | Software-engineering semantics and Website Building C40 | `INTERFACE_REQUIRED` | Learning owns product semantics; PROGRAMMING owns generic engineering semantics |

## 5. Special dispositions

| Row | Subject | Disposition | Current rule |
|---|---|---|---|
| LS-001 | Historical PROSE assumptions / Learning→Prose routes | `HISTORICAL_ONLY` | PROSE is terminally retired; no Learning item may resurrect it |
| LS-002 | `LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001` | `HOLD_PENDING_FORENSIC_ROW_ADJUDICATION` | Do not replay; resume/adapt/split/supersede only from exact frozen evidence |
| LS-003 | `LEARNING-REAL-PARTICIPANT-PILOT-001` | `BLOCKED_HUMAN` | Genuine consent and real learner evidence are required |

## 6. What this matrix proves now

The current architecture is no longer ambiguous for Learning. Learning owns **C07 and C18**. P00–P15 remain shared CORE platform requirements. Dependencies on Book, Documents, Spreadsheet/Data, Media, Connected Actions, Research/Knowledge and Programming are explicit peer interfaces rather than ownership transfers. Prose cannot re-enter the lane. The old curriculum/compiler obligation cannot automatically restart.

What this matrix **does not** prove is the row-level disposition of the missing September 11 forensic ledgers. There are currently five explicit source-identity gaps, and row-level forensic adjudication remains open.

## 7. Exact successor

Recover and bind the exact frozen source identities, beginning with the **requirement ledger** and **gap register**. Once located:

1. Preserve every original row ID and provenance.
2. Append each row to the machine-readable matrix.
3. Classify it as `CARRY_FORWARD`, `CARRY_FORWARD_WITH_INTERFACE_ADAPTATION`, `INTERFACE_REQUIRED`, `HISTORICAL_ONLY`, `BLOCKED_*`, or an explicit unresolved gap.
4. Bind any current evidence without transferring historical PASS across changed SHA/interface/ownership boundaries.
5. Only after every recovered requirement/interface/archive/gap row is dispositioned may this matrix be marked `FORENSIC_ROW_LEVEL_ADJUDICATION_COMPLETE`.

Until that closure gate is met, `LEARNING-FORENSIC-BASELINE-CURRENT-AUTHORITY-ADJUDICATION-001` remains the active Learning objective and the prior curriculum/compiler implementation program remains on HOLD.
