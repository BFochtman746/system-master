# CHAT-START-COMMAND-CONTRACT-001

Status: CANONICAL_CURRENT / TOPOLOGY-004-RECONCILED
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

A Prose command never creates a separate Prose peer/owner lane. It opens the Book owner role at the active Prose specialist-child boundary.

## Mandatory startup action

Upon a start command or a request to build/resume a known system/candidate:

1. fetch current `main` and read `governance/CURRENT-AUTHORITY.json`;
2. read the current morning pointer/manifest when available;
3. read the topology selected by CURRENT-AUTHORITY;
4. read `governance/catalog/SYSTEM-MASTER-SYSTEM-CATALOG-001.json` before broad project/system rediscovery;
5. if the request names a cataloged future system/candidate or historical family, load its reusable system packet and archive source registry before generic research;
6. load the requested active owner-role packet when applicable;
7. fetch the active owner's live canonical control ref/head; for Prose focus fetch BOOK and `literary-prose-engine-001` while keeping BOOK as the execution owner lane;
8. reconcile any `AUTHORITY_DELTA` from durable evidence;
9. read current completion, obligation, expectation, repair and Second Shift state;
10. recover exact referenced historical research/spec/code/test/qualification evidence before proposing replacement work;
11. apply only a material/current delta review to historically closed research unless a real reopen trigger is evidenced;
12. identify one current objective and executable next-step contract;
13. only then respond.

Current owner roles are MASTER_ROOT, LEARNING, BOOK and DOCUMENTS. CORE remains an active system/Second Shift owner. PROSE is an active Book child specialist, not another owner role or peer mutation lane.

## Required first response

Return `CHAT READY`, `CHAT READY WITH DECISION`, or `NOT READY`, plus where the system is, material delta, where it is going and one exact next step. Do not dump full history unless requested.

For a non-active future-system candidate, return `CATALOG_CANDIDATE_ONLY` plus reusable evidence, exact missing admission/delta gates, and the first non-duplicative next step. Do not pretend the candidate is already active.

## Zero-rediscovery rule

Do not ask the user to restate System Master, repository identity, active topology, prior work, archived research, Second Shift history, whether Documents is a peer, or whether Prose is the active Book child when current authority/catalog/source evidence can resolve those facts.

Do not restart generic research for a cataloged future system merely because the chat is new. Load the packet and exact sources first. Previously closed research is revisited only through its material current-delta/reopen rule.

If live state differs from a morning packet or generated system packet, use:

`EXPECTED -> LIVE LOOKUP -> AUTHORITY/CATALOG RESOLUTION -> DELTA CLASSIFICATION -> RECONCILE -> CURRENT OBJECTIVE -> EXECUTE/NEXT STEP`

The current live owner/topology always outranks a generated packet.

## MASTER_ROOT role

MASTER_ROOT is the SYSTEM_MASTER product-root controller, not another peer system. It reads active peer systems CORE, LEARNING, BOOK and DOCUMENTS, the Book child PROSE where relevant, and shared infrastructure. It also uses the non-authoritative System Catalog to identify historical systems, reusable families and planned future candidates without implicitly promoting them.

## BOOK / PROSE role

BOOK means `SYSTEM_MASTER/BOOK`, control ref `book-system/control-v1`. BOOK is canonical owner of Book/manuscript/Story-Bible/lifecycle/admission/author/publication state.

PROSE means `SYSTEM_MASTER/BOOK/PROSE`, specialist control ref `literary-prose-engine-001`, operating beneath BOOK. It owns literary diagnosis, controlled revision candidates, evaluation support, voice/protected-language preservation, homogenization defense and Book-scoped preference learning. It has zero direct canonical manuscript-write authority and no separate owner/Second-Shift lane.

## DOCUMENTS role

DOCUMENTS means `SYSTEM_MASTER/DOCUMENTS`, control ref `documents/control-v1`. Documents is a first-class peer tool system. It owns document/content artifact mechanics and generic document services. BOOK remains owner of Book canonical state and its Prose literary-specialist child.

## Historical Prose retirement rule

The historical standalone Prose retirement record remains readable provenance. ADR-0004 supersedes its current effect: it must not be used to redirect active `SYSTEM_MASTER/BOOK/PROSE` work to Documents or to transfer historical PASS. Attempts to recreate a separate Prose peer lane remain stale topology.

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
