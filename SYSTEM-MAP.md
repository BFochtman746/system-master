# System Master — Authority-Derived System Map

Generated from `CURRENT-AUTHORITY-005` + `SYSTEM-TOPOLOGY-007`. This is the human-readable ownership map; machine truth lives in the selected authority, topology, completion, obligation and capability records named below.

## Topology

```text
SYSTEM_MASTER  (product root; INCOMPLETE)
├── CORE                (INCOMPLETE)
├── LEARNING            (INCOMPLETE)
├── BOOK                (INCOMPLETE)
├── DOCUMENTS           (INCOMPLETE)
├── SPREADSHEET_DATA    (INCOMPLETE)
├── MEDIA               (INCOMPLETE)
├── CONNECTED_ACTIONS   (INCOMPLETE)
├── RESEARCH_KNOWLEDGE  (INCOMPLETE)
└── PROGRAMMING         (INCOMPLETE)
    ├── C01 AUTOMATION
    ├── C05 CODE
    └── C40 WEBSITE_BUILDING

PROSE  (historically COMPLETE; RETIRED_TERMINAL; no current lane)
```

Exactly nine active peers exist. `WEBSITE_BUILDING` is C40 under Programming and is not a tenth peer.

## Canonical ownership map

| Peer | Capability ownership / semantic boundary |
|---|---|
| CORE | Shared Foundation & Spine; CHAT, EXPECTATION, EXPERIENCE, LOCALAI, PROJECTS; common platform/runtime/control infrastructure |
| LEARNING | CURRICULUM, LEARNING |
| BOOK | MANUSCRIPT, STORYBIBLE, WRITING; canonical Book/manuscript/lifecycle/author/publication state; any genuinely open integration of preserved completed Prose capability |
| DOCUMENTS | DOCX, FILE, IMG-INGEST, OCR, PDF, PPTX; generic document/artifact mechanics; no Prose work |
| SPREADSHEET_DATA | DATA, EXCEL, LEDGER, MATH |
| MEDIA | AUDIOBOOK, IMAGE, MEDIA, PHOTO, VIDEO, VOICE |
| CONNECTED_ACTIONS | BROWSER, CALENDAR, COMMS, PLUGINS; user/external side-effect policy remains here |
| RESEARCH_KNOWLEDGE | GEO, KNOWLEDGE, RESEARCH |
| PROGRAMMING | AUTOMATION, CODE, WEBSITE_BUILDING C40; software-engineering semantics and preserved Programming continuity |

Capabilities C35 AIINCOME, C36 CAD, C37 PHONEOPS, C38 PHYSICALAI and C39 PORTFOLIO retain the explicit non-owned/deferred dispositions in the canonical crosswalk. C41-C49 remain reserved/unallocated. Reserved IDs are not renumbered.

## Registered implementation subsystems

Implementation-subsystem registration satisfies `STANDARDS.md` S-05 and does **not** add a peer, move semantic ownership, or create a new authority domain.

| Subsystem | What it is | Repository path | Tests | Owner | Logs / evidence |
|---|---|---|---:|---|---|
| `learning-handler-binding-001` | Thin, transport-neutral inbound registration/adaptation seam for the frozen Learning/Curriculum command/query contracts. Master Core remains the router/dispatcher owner and DATA remains physical-persistence owner. | `system-master/learning-handler-binding-001/` | 1 runnable qualification entry point for the I001–I004 tranche | `LEARNING` (`CURRICULUM` + `LEARNING` semantics) | `Required Verification / required-verification`; Maven `target/surefire-reports/`; Learning handler-binding governance receipts |

## Platform requirements P00-P15

Platform requirements are dependencies, not peer systems. They remain CORE-owned shared infrastructure unless the canonical crosswalk marks an absorbed dependency. P00 is the authority pointer, P01 topology/ownership, P02 obligation registry, P03 evidence retention, P04 content-addressed authority writes, P05 governance validation, P06 control-gateway admission, P07 A-01 barrier, P08 qualification semantics, P09 repair lineage, P10 Second Shift supervisor, P11 night scheduler, P12 GitHub ingress, P13 model routing/local inference (absorbed into C20), P14 connector action runtime (absorbed into C27), and P15 observability/morning receipt/rollback.

## Completion and execution truth

`SYSTEM_MASTER` and all nine active peers are product-level incomplete. PROSE is historically complete and terminally retired. Repository execution readiness does not grant human, private-data, native-device, credential, production, publication, external-provider, or user-action authority.

Programming admission preserves earlier work-program evidence. Exact-SHA qualification and receipts remain bound to their original subjects; the authority transition does not relabel or broaden them.

## Current objective map

- Central objective: `FOUNDATION-1-0-CLOSURE-001` (CORE-administered; closes C00-C49 / P00-P15 dispositions without taking peer semantics).
- Highest discretionary objective: `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` (CORE-administered custody/provenance support for Programming; not Programming product ownership).
- Current Programming continuation: `PROGRAMMING-WORK-PROGRAM-CONTINUATION-001` under `SYSTEM_MASTER/PROGRAMMING`.

## Selected records — one coherent authority set

| Role | Selected record |
|---|---|
| Authority | `governance/CURRENT-AUTHORITY.json` → `CURRENT-AUTHORITY-005` |
| Topology | `governance/SYSTEM-TOPOLOGY-007.json` |
| Ratification | `governance/ADR-0006-PROGRAMMING-PEER-ADMISSION-WEBSITE-BUILDING.md` |
| Completion status | `governance/SYSTEM-COMPLETION-STATUS-002.json` |
| Obligation registry | `governance/WORK-OBLIGATION-REGISTRY-013.json` |
| Capability crosswalk | `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json` |

Any derived document that reports a different peer count, treats Programming as non-peer, promotes Website Building to a peer, assigns Prose work to Documents, or reopens PROSE is stale architecture and must not dispatch work.
