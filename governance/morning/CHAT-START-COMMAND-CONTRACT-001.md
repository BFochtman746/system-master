# CHAT-START-COMMAND-CONTRACT-001

Status: PROPOSED_FOR_ADMISSION
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
6. independently fetch current `main`, current headless-tool owner allocation, the Second Shift registry and every relevant current owner control binding;
7. compare current state with the morning packet and classify any difference as `AUTHORITY_DELTA`;
8. reconcile only that delta from durable evidence;
9. read current completion, the obligation registry selected by CURRENT-AUTHORITY, expectation, repair and registry-declared Second Shift state relevant to the role;
10. for MASTER_ROOT, read `governance/second-shift/SYSTEM-MASTER-DELEGATIONS.json` and verify it against the current `central_next_objective` whenever that objective is READY/ACTIVE and SYSTEM_MASTER-owned;
11. identify one current objective and one exact next-step contract;
12. only then respond.

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
- what the canonical child/system topology is;
- whether Second Shift happened;
- what was worked on last night;
- whether a newly started SYSTEM_MASTER-owned headless tool needs its own Second Shift lane;
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

`MASTER_ROOT` means the SYSTEM_MASTER product-root control chat. It reads the SYSTEM_MASTER root Second Shift lane, all four child/system owner lanes and shared infrastructure, tracks root obligations/architecture/headless capability portfolios and routes work to canonical owners.

It is not a fifth peer system. It may not silently take child canonical-writer authority. CORE remains the Foundation & Spine owner, LEARNING remains Learning owner, BOOK remains canonical Book owner, and PROSE remains the Book/Prose child owner. SYSTEM_MASTER-owned non-system headless capability portfolios, including Content & Document Artifacts and future root-owned tools, are handled through MASTER_ROOT and inherit the reusable SYSTEM_MASTER Second Shift lane rather than creating another chat role or peer system.

## Continuation rule

A new chat is merely a new working surface. It does not create a new project state. Durable repository state survives chat turnover. A new chat resumes from current authority and the first incomplete current objective; it never restarts completed work solely because conversation context is fresh.

Whenever MASTER_ROOT materially changes a READY/ACTIVE SYSTEM_MASTER-owned `central_next_objective`, it must reconcile the root Second Shift delegation in the same working session. This is what makes future headless tools inherit the operating system automatically instead of requiring manual overnight setup each time.
