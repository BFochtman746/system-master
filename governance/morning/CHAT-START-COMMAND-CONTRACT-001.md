# CHAT-START-COMMAND-CONTRACT-001

Status: PROPOSED_FOR_ADMISSION
Repository: BFochtman746/system-master

## Purpose

Define short user commands that deterministically enter current System Master work without project restatement or chat-by-chat reconstruction.

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

Upon a start command:

1. fetch current `main` and read `governance/CURRENT-AUTHORITY.json`;
2. read the current morning pointer/manifest when available;
3. read the topology selected by CURRENT-AUTHORITY;
4. load the requested role packet;
5. fetch the active owner's live canonical control ref/head;
6. reconcile any `AUTHORITY_DELTA` from durable evidence;
7. read current completion, obligation, expectation, repair and Second Shift state;
8. identify one current objective and executable next-step contract;
9. only then respond.

Current active owner roles are MASTER_ROOT, LEARNING, BOOK and DOCUMENTS. CORE is represented inside product-root/system control as appropriate and remains an active Second Shift/system owner. PROSE is historical only.

## Required first response

Return `CHAT READY`, `CHAT READY WITH DECISION`, or `NOT READY`, plus where the system is, material delta, where it is going and one exact next step. Do not dump full history unless requested.

## Zero-rediscovery rule

Do not ask the user to restate System Master, repository identity, active topology, prior work, Second Shift history, whether Documents is a peer, or whether Prose remains active. Current authority resolves those facts.

If live state differs from a morning packet, use:

`EXPECTED -> LIVE LOOKUP -> DELTA CLASSIFICATION -> RECONCILE -> CURRENT OBJECTIVE -> EXECUTE/NEXT STEP`

## MASTER_ROOT role

MASTER_ROOT is the SYSTEM_MASTER product-root controller, not another peer system. It reads active peer systems CORE, LEARNING, BOOK and DOCUMENTS plus shared infrastructure. It does not own a separate root Second Shift worker lane.

## DOCUMENTS role

DOCUMENTS means `SYSTEM_MASTER/DOCUMENTS`, control ref `documents/control-v1`. Documents is a first-class peer tool system. It owns document/content artifact capabilities and the completed Prose capability family after retirement migration. BOOK remains owner of Book canonical state.

## Retired Prose rule

PROSE is completed and retired. Historical branches/evidence remain readable provenance only. Any current work still materially required from the old Prose family is translated into DOCUMENTS-owned work without transferring historical PASS to changed integration subjects.

## Continuation rule

A new chat is only a new working surface. Durable repository state survives chat turnover and completed work is never reopened merely because a conversation is fresh.
