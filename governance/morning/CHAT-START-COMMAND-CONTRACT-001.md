# CHAT-START-COMMAND-CONTRACT-001

Status: CANONICAL_CURRENT
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
- `Start today's Documents chat.` -> `DOCUMENTS`
- `Let's start our Documents chat.` -> `DOCUMENTS`

Historical compatibility:

- `Start today's Prose chat.` -> `DOCUMENTS` with `RETIRED_PROSE_REDIRECT`
- `Let's start our Prose chat.` -> `DOCUMENTS` with `RETIRED_PROSE_REDIRECT`

A Prose command must never recreate a Prose owner lane. It opens Documents at the current prose-capability integration boundary and reports that Prose is completed/retired.

## Mandatory startup action

Upon a start command or a request to build/resume a known system/candidate:

1. fetch current `main` and read `governance/CURRENT-AUTHORITY.json`;
2. read the current morning pointer/manifest when available;
3. read the topology selected by CURRENT-AUTHORITY;
4. read `governance/catalog/SYSTEM-MASTER-SYSTEM-CATALOG-001.json` before broad project/system rediscovery;
5. if the request names a cataloged future system/candidate or historical family, load its reusable system packet and `governance/catalog/SYSTEM-MASTER-ARCHIVE-SOURCE-REGISTRY-001.json` before generic research; for Programming load `governance/catalog/system-packets/PROGRAMMING.json`;
6. load the requested active role packet when applicable;
7. fetch the active owner's live canonical control ref/head; a cataloged future candidate has no active owner/control until admitted;
8. reconcile any `AUTHORITY_DELTA` from durable evidence;
9. read current completion, obligation, expectation, repair and Second Shift state;
10. recover exact referenced historical research/spec/code/test/qualification evidence before proposing replacement work;
11. apply only a material/current delta review to historically closed research unless a real reopen trigger is evidenced;
12. identify one current objective and executable next-step contract;
13. only then respond.

Current active owner roles are MASTER_ROOT, LEARNING, BOOK and DOCUMENTS. CORE is represented inside product-root/system control as appropriate and remains an active Second Shift/system owner. PROSE is historical only.

## Required first response

Return `CHAT READY`, `CHAT READY WITH DECISION`, or `NOT READY`, plus where the system is, material delta, where it is going and one exact next step. Do not dump full history unless requested.

For a non-active future-system candidate, return `CATALOG_CANDIDATE_ONLY` plus the reusable evidence packet, exact missing admission/delta gates, and first non-duplicative next step. Do not pretend the candidate is already an active peer.

## Zero-rediscovery rule

Do not ask the user to restate System Master, repository identity, active topology, prior work, archived research, Second Shift history, whether Documents is a peer, or whether Prose remains active when current authority/catalog/source evidence can resolve those facts.

Do not restart generic research for a cataloged future system merely because the chat is new. Load the packet and exact sources first. Previously closed research is revisited only through its material current-delta/reopen rule.

If live state differs from a morning packet or generated system packet, use:

`EXPECTED -> LIVE LOOKUP -> AUTHORITY/CATALOG RESOLUTION -> DELTA CLASSIFICATION -> RECONCILE -> CURRENT OBJECTIVE -> EXECUTE/NEXT STEP`

The current live owner/topology always outranks a generated packet.

## MASTER_ROOT role

MASTER_ROOT is the SYSTEM_MASTER product-root controller, not another peer system. It reads active peer systems CORE, LEARNING, BOOK and DOCUMENTS plus shared infrastructure. It also uses the non-authoritative System Catalog to identify retired systems, reusable historical families and planned future candidates without implicitly promoting them.

## DOCUMENTS role

DOCUMENTS means `SYSTEM_MASTER/DOCUMENTS`, control ref `documents/control-v1`. Documents is a first-class peer tool system. It owns document/content artifact capabilities and the completed Prose capability family after retirement migration. BOOK remains owner of Book canonical state.

## Retired Prose rule

PROSE is completed and retired. Historical branches/evidence remain readable provenance only. Any current work still materially required from the old Prose family is translated into DOCUMENTS-owned work without transferring historical PASS to changed integration subjects.

## Future-system candidate rule

A catalog entry or reusable packet never creates a system. When the user asks to build a candidate such as Programming:

1. load its packet and source registry;
2. reconcile existing work and exact evidence;
3. complete any missing source ingest and current material-delta research;
4. present or execute the explicit topology admission transaction when the user's intent is to make it a first-class peer;
5. only after admission create control/obligation/repair/Second Shift/chat-start authority;
6. implement from the first genuinely unclosed evidence-backed work package.

A-01 may deterministically inventory, hash, validate, extract, classify machine-verifiable evidence and execute registered qualification, but it may not decide that a catalog candidate is now an active system or assign semantic ownership.

## Continuation rule

A new chat is only a new working surface. Durable repository state, catalog/source indexes and completed evidence survive chat turnover. Completed work is never reopened merely because a conversation is fresh.
