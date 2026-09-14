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

## Platform requirements P00-P15

Platform requirements are dependencies, not peer systems. They remain CORE-owned shared infrastructure unless the canonical crosswalk marks an absorbed dependency. P00 is the authority pointer, P01 topology/ownership, P02 obligation registry, P03 evidence retention, P04 content-addressed authority writes, P05 governance validation, P06 control-gateway admission, P07 A-01 barrier, P08 qualification semantics, P09 repair lineage, P10 Second Shift supervisor, P11 night scheduler, P12 GitHub ingress, P13 model routing/local inference (absorbed into C20), P14 connector action runtime (absorbed into C27), and P15 observability/morning receipt/rollback.

## Enforcement subsystem directories

| Directory | Platform requirement | Responsibility |
|---|---|---|
| `system-master/control-gateway-lock` | P06 control-gateway admission | Single-writer admission for governed system files. Provides the mutual exclusion that the pre-existing machinery did not: `ExecutionLeaseManager` (F-WP-007) fences a *stale* writer but `acquire()` unconditionally grants a new epoch, so a *second concurrent* writer was never refused. This subsystem adds per-path exclusion on top of it, an expected-revision precondition reusing `ChangeRegistry` (F-WP-002) optimistic-concurrency semantics, and refusal of any session without an admitted recovery contract. The `*-LOCK-*.json` governance records remain ownership decisions, not mutexes. |
| `system-master/execution-claims` | P10 Second Shift supervisor, P11 night scheduler | Claim lifecycle and consumer: `READY -> CLAIMED -> (DONE \| FAILED)`, with bounded `recover()` readmission to `READY` and terminal `DEAD` on `ATTEMPT_LIMIT_EXHAUSTED`. `ClaimLedger.Consumer.tick()` calls `recover()` first, then executes at most one claim, writes an append-only evidence receipt, and terminalizes. Reuses `ExecutionLeaseManager` for epochs, fence tokens and trusted-time admission; the one-consumer-per-claim decision is made here because `acquire()` deliberately does not refuse a second live holder. Terminalizing without a receipt for the current epoch is refused, so a completed claim always has evidence behind it. |

Enforced on pull requests by `.github/workflows/system-file-lease-enforcement.yml`, which audits `System-File-Lease` commit-trailer receipts so a lease-less mutation to a governed path stays detectable from git history alone.

### Correction: execution runtime status

Before `execution-claims` landed, **no scheduler runtime existed anywhere in this repository.** There was no `recover()`, no `tick()` loop, and no claim, consumer, executor, supervisor or worker class in any of the 80 Java sources on `main`. The execution vocabulary appeared only in governance records and CI scripts — `STALE_DELEGATION` in the repair broker, the second-shift enforcement scripts — describing behaviour that had never been implemented. Nothing ever failed because there was no code to fail.

This is recorded here because the absence was repeatedly mistaken for a wiring gap: earlier reports described `recover()` as "existing in five files but never called outside tests", which was not true of the tree. Treat P10/P11 as **partially implemented**: the claim lifecycle, single-consumer exclusion, bounded readmission and crash-resume barrier are real and tested as of `execution-claims`; the periodic driver that calls `tick()` on a schedule, and the production dispatch that posts work to GitHub Actions, are not yet on `main`. Do not read a governance record describing a scheduler as evidence that one runs.

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
