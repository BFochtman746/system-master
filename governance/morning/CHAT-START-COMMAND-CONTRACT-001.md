# CHAT-START-COMMAND-CONTRACT-001

Status: CANONICAL_CURRENT / TOPOLOGY-004 / PROGRAM-JOB-LOCKED
Repository: BFochtman746/system-master

## Purpose

Define short user commands that deterministically enter current System Master work without project restatement, archive rediscovery, or chat-by-chat reconstruction.

## Canonical commands

- `Start today's System Master chat.` -> `MASTER_ROOT`
- `Let's start our new Master chat today.` -> `MASTER_ROOT`
- `Start today's Learning chat.` -> `LEARNING`
- `Let's start our Learning chat.` -> `LEARNING`
- `Start today's Book chat.` -> `BOOK`
- `Let's start our Book Writing chat.` -> `BOOK`
- `Start today's Prose chat.` -> `BOOK` focused at `SYSTEM_MASTER/BOOK/PROSE`
- `Let's start our Prose chat.` -> `BOOK` focused at `SYSTEM_MASTER/BOOK/PROSE`
- `Start today's Documents chat.` -> `DOCUMENTS`
- `Let's start our Documents chat.` -> `DOCUMENTS`
- `Start today's Programming chat.` -> `PROGRAMMING_WORK_PROGRAM`
- `Let's start our Programming chat.` -> `PROGRAMMING_WORK_PROGRAM`

A Prose command never creates a separate Prose peer/owner lane. It opens the Book owner role at the completed Prose specialist-child boundary.

A Programming command opens the named Programming work program defined by `governance/programs/PROGRAMMING-WORK-PROGRAM-LOCK-001.json`. It does not silently promote Programming into Topology 004 or create a peer Second Shift/repair lane.

## Mandatory startup action

Upon a start command or a request to build/resume a known system/work program/candidate:

1. fetch current `main` and read `governance/CURRENT-AUTHORITY.json`;
2. read the current morning pointer/manifest when available;
3. read the topology, `program_job_lock`, and `system_completion_status` selected by CURRENT-AUTHORITY before making completion or job claims;
4. read the `system_catalog` selected by CURRENT-AUTHORITY before broad project/system rediscovery; never hard-code a superseded catalog version;
5. if Programming is requested, read `programming_work_program_lock` and `programming_system_packet` from CURRENT-AUTHORITY before any broad rediscovery, architecture restart or implementation selection;
6. if another cataloged future system/candidate or historical family is requested, load its reusable system packet and archive source registry before generic research;
7. load the requested active owner-role or work-program packet when applicable;
8. fetch the active owner's live canonical control ref/head; for Prose focus fetch BOOK and `literary-prose-engine-001` while keeping BOOK as the execution owner lane; Programming work does not invent an owner control branch before admission;
9. reconcile any `AUTHORITY_DELTA` from durable evidence;
10. read current completion, obligation, expectation, repair and Second Shift state and reject any selector that violates the current program-job lock;
11. recover exact referenced historical research/spec/code/test/qualification evidence before proposing replacement work;
12. apply only a material/current delta review to historically closed research unless a real reopen trigger is evidenced;
13. identify one current objective and executable next-step contract inside the requested system or work program's locked job;
14. only then respond.

Current system owner roles are MASTER_ROOT, LEARNING, BOOK and DOCUMENTS. CORE remains an active system/Second Shift owner. PROSE is the only complete system and remains the Book child specialist; it is not another peer mutation lane. PROGRAMMING_WORK_PROGRAM is a named work-program role with no peer topology authority until explicit admission.

## Required first response

Return `CHAT READY`, `CHAT READY WITH DECISION`, or `NOT READY`, plus where the system/work program is, material delta, where it is going and one exact next step. Do not dump full history unless requested.

For Programming, report `ACTIVE_WORK_PROGRAM__NOT_YET_PEER_TOPOLOGY`, preserve prior Programming foundation/evidence continuity, and continue the first genuinely unclosed Programming work package. Do not reduce Programming to Knowledge Recovery and do not pretend it already has peer-system authority.

For any other non-active future-system candidate, return `CATALOG_CANDIDATE_ONLY` plus reusable evidence, exact missing admission/delta gates, and the first non-duplicative next step.

## Zero-rediscovery rule

Do not ask the user to restate System Master, repository identity, active topology, prior work, archived research, Second Shift history, system job assignments, completion truth, whether Documents is a peer, whether Prose is the completed active Book child, or the existence of the Programming foundation program when current authority/catalog/source evidence can resolve those facts.

Do not restart generic research for a cataloged future system or named work program merely because the chat is new. Load the packet, work-program lock and exact sources first. Previously closed research is revisited only through its material current-delta/reopen rule.

If live state differs from a morning packet or generated system packet, use:

`EXPECTED -> LIVE LOOKUP -> AUTHORITY/JOB/COMPLETION RESOLUTION -> DELTA CLASSIFICATION -> RECONCILE -> CURRENT OBJECTIVE -> EXECUTE/NEXT STEP`

The current live owner/topology/job lock always outranks a generated packet.

## MASTER_ROOT role

MASTER_ROOT is the SYSTEM_MASTER product-root controller, not another peer system. Its locked job is to integrate CORE, LEARNING, BOOK and DOCUMENTS into the System Master product without taking their product semantics. It reads those active peer systems, the Book child PROSE where relevant, named work-program boundaries such as Programming, and shared infrastructure.

## BOOK / PROSE role

BOOK means `SYSTEM_MASTER/BOOK`, control ref `book-system/control-v1`. BOOK is incomplete and owns canonical Book/manuscript/Story-Bible/lifecycle/admission/author/publication state. Its locked current job includes finishing integration of the completed PROSE child through adapters and the Book Workflow Orchestrator, then integrating Book upward into System Master.

PROSE means `SYSTEM_MASTER/BOOK/PROSE`, specialist control ref `literary-prose-engine-001`, operating beneath BOOK. PROSE is the only system currently complete. It supplies literary diagnosis, controlled revision candidates, evaluation support, voice/protected-language preservation, homogenization defense and Book-scoped preference learning. It has zero direct canonical manuscript-write authority and no separate owner/Second-Shift lane. Integration adapters/orchestration around completed Prose are BOOK work and do not reopen Prose feature scope absent a demonstrated defect or explicit user direction.

## LEARNING role

LEARNING means `SYSTEM_MASTER/LEARNING`, control ref `learning/control-v1`. Learning is incomplete. Its locked job is to finish Learning product/runtime/curriculum/mastery/assessment/adaptation/evidence and integrate Learning upward into System Master. It does not cross into Book, Prose, Documents or Programming product work.

## DOCUMENTS role

DOCUMENTS means `SYSTEM_MASTER/DOCUMENTS`, control ref `documents/control-v1`. Documents is an incomplete first-class peer tool system. Its locked job is to finish DOCX/PDF/PPTX/general document artifact mechanics, conversion, preservation, rendering/export and generic document services, then integrate upward into System Master. Documents must not absorb or own Book-specific Prose literary intelligence, canonical Book state, Learning semantics or Programming engineering semantics.

## PROGRAMMING work-program role

PROGRAMMING_WORK_PROGRAM loads `governance/programs/PROGRAMMING-WORK-PROGRAM-LOCK-001.json` and `governance/catalog/system-packets/PROGRAMMING.json`.

Its job is to continue the existing Programming software-engineering program from the preserved capability ledgers, Programming Foundation 002A-002X family, crosscut/closure-repair work, build/test/assurance evidence, programming-core/source-code evidence and Genesis-related evidence. It recovers only missing exact source/custody information, performs only warranted current material deltas, and continues from the first genuinely unclosed work package.

Programming-specific engineering semantics must not be absorbed into CORE merely because Core supplies shared execution/model/storage/A-01 infrastructure. Programming also must not cross into Learning, Book, Prose or Documents product work.

Programming is not yet a peer system under Topology 004. Work may prepare its explicit System Master admission/integration boundary, but it may not create a peer owner lane, repair inbox or Second Shift lane until an explicit topology admission transaction authorizes that change.

Knowledge Recovery is a supporting Core-administered source/custody/provenance subprogram. It is not the Programming product definition and must not replace the Programming engineering continuation path.

## Historical Prose retirement rule

The historical standalone Prose retirement record remains readable provenance. ADR-0004 supersedes its current effect: it must not be used to redirect active `SYSTEM_MASTER/BOOK/PROSE` work to Documents or to transfer historical PASS. Attempts to recreate a separate Prose peer lane remain stale topology.

## Other future-system candidates

A catalog entry or reusable packet never creates a system. For a candidate other than the explicitly named Programming work program:

1. load its packet and source registry;
2. reconcile existing work and exact evidence;
3. complete missing source ingest and current material-delta research;
4. present or execute the explicit topology admission transaction when the user's intent is to make it first-class;
5. only after admission create control/obligation/repair/Second Shift/chat-start authority;
6. implement from the first genuinely unclosed evidence-backed work package.

A-01 may deterministically inventory, hash, validate, extract, classify machine-verifiable evidence and execute registered qualification, but it may not create topology or assign semantic ownership.

## Continuation rule

A new chat is only a new working surface. Durable repository state, catalog/source indexes, work-program locks and completed evidence survive chat turnover. Completed work is never reopened merely because a conversation is fresh. Packet/phase/test completion must never be promoted to whole-system completion unless the authority-selected system completion record explicitly says so.
