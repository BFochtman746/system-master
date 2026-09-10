# CHAT-START-COMMAND-CONTRACT-001

Status: ACTIVE_CANONICAL
Repository: BFochtman746/system-master

## Purpose

Define short user commands that deterministically enter current System Master work without requiring project restatement, historical explanation or chat-by-chat reconstruction.

## Canonical commands

The following natural-language commands are equivalent to canonical startup intents:

- `Start today's System Master chat.` -> `MASTER_ROOT`
- `Let's start our new Master chat today.` -> `MASTER_ROOT`
- `Start today's Learning chat.` -> `LEARNING`
- `Let's start our Learning chat.` -> `LEARNING`
- `Start today's Book chat.` -> `BOOK`
- `Let's start our Book Writing chat.` -> `BOOK`
- `Start today's Prose chat.` -> `PROSE`
- `Let's start our Prose chat.` -> `PROSE`

Minor grammatical variants do not require clarification when the intended chat role is unambiguous.

## Mandatory startup action

Upon receiving a start command, before answering substantive project questions or proposing work:

1. open current `main` in `BFochtman746/system-master`;
2. read `governance/CURRENT-AUTHORITY.json`;
3. read the morning reconciliation contract and `governance/morning/LATEST-BOOTSTRAP-POINTER.json` when present;
4. read the daily manifest selected by that pointer when it exists and is for the current New York date;
5. load the packet for the requested chat role;
6. independently fetch current `main` and each relevant live owner control ref/head;
7. compare live state with the morning packet and classify any difference as `AUTHORITY_DELTA`;
8. reconcile only that delta from durable evidence;
9. read current completion, obligation, expectation, repair and Second Shift state relevant to the role;
10. identify one current objective and one exact next-step contract;
11. only then respond.

The daily manifest accelerates startup but never overrides newer live authority.

## Required first response

The first response in a newly started chat should be concise and operational. It must communicate:

- `CHAT READY` or `CHAT READY WITH DECISION`;
- where the system is now;
- what materially changed since the prior/morning state, if anything;
- where the lane/product is going;
- the exact next step that will be executed on `Continue` or equivalent instruction.

Do not dump the entire project history unless the user asks for it.

## Zero-rediscovery rule

A start command is authorization to perform repository discovery/reconciliation automatically. Do not ask:

- what System Master is;
- which repository to use;
- whether prior work should be kept;
- what the four-system topology is;
- whether Second Shift happened;
- what was worked on last night;
- where the user wants to continue when current owner state/obligations already select it.

## Anti-confusion state machine

If live repository state differs from expected state, do not answer with surprise or confusion.

Use:

`EXPECTED -> LIVE LOOKUP -> DELTA CLASSIFICATION -> RECONCILE -> CURRENT OBJECTIVE -> EXECUTE/NEXT STEP`

If the mismatch is machine-resolvable from canonical sources, resolve it without asking the user.

If it is not machine-resolvable, emit one precise classified decision only, such as:

- `HUMAN_DECISION_REQUIRED`
- `AUTHOR_DECISION_REQUIRED`
- `PRIVATE_AUTHORITY_REQUIRED`
- `NATIVE_AUTHORITY_REQUIRED`
- `EXTERNAL_AUTHORITY_REQUIRED`
- `UNALLOCATED`
- `EVIDENCE_MISMATCH`

Then state exactly what fact/choice is missing and what remains safely executable meanwhile.

## MASTER_ROOT role

`MASTER_ROOT` means the SYSTEM_MASTER product-root control chat. It reads all four owner lanes and shared infrastructure, tracks root obligations/architecture and routes work to canonical owners.

It is not a fifth peer system. It may not silently take child canonical-writer authority. CORE remains the Foundation & Spine owner, LEARNING remains Learning owner, BOOK remains canonical Book owner, and PROSE remains the Book/Prose child owner.

## Continuation rule

A new chat is merely a new working surface. It does not create a new project state. Durable repository state survives chat turnover. A new chat resumes from current authority and the first incomplete current objective; it never restarts completed work solely because conversation context is fresh.
