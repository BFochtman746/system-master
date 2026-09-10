# MORNING-CANONICAL-RECONCILIATION-001

Status: ACTIVE_CANONICAL
Owner: SYSTEM_MASTER product-root governance
Schedule target: 07:15 America/New_York after Second Shift closes at 07:00
Purpose: reconcile overnight execution into live canonical owner state and publish one deterministic chat-start manifest for the new day.

## Core rule

Second Shift does not become a second source of truth. Overnight branches, hosted evidence, execution ledgers, scorecards, repairs and successor selections are inputs to morning reconciliation. Current owner control refs, CURRENT-AUTHORITY, topology, completion evidence and the current obligation registry remain authoritative.

The 07:15 process is a reconciliation transaction, not a narrative handoff.

## Required read set

1. current `main` and `governance/CURRENT-AUTHORITY.json`
2. `governance/SYSTEM-TOPOLOGY-002.json`
3. checkpoint selected by CURRENT-AUTHORITY
4. completion ledger selected by CURRENT-AUTHORITY
5. obligation registry selected by CURRENT-AUTHORITY
6. expectation and reallocation registries
7. repair inbox/ledger registries and each lane's current repair state
8. Second Shift registry, execution controls, each lane delegation and shift event ledger
9. latest Second Shift value scorecard/evidence when present
10. live control ref/head and selected current state record for CORE, LEARNING, BOOK and PROSE
11. recent overnight branches, PRs, qualification runs, receipts and exact evidence referenced by the shift ledgers

## Reconciliation transaction

For each owner lane:

1. fetch the live owner control head; never trust an overnight cached SHA;
2. classify every overnight result as ALREADY_CANONICAL, ADMISSIBLE_DELTA, CANDIDATE_ONLY, BLOCKED_HIGHER_AUTHORITY, SUPERSEDED, STALE, REWORK_REQUIRED or INVALID;
3. preserve exact historical evidence; never rewrite old receipts or transfer PASS;
4. admit only deltas permitted by current owner/canonical-writer rules and exact evidence;
5. update completion/obligation/repair/delegation state only when the current owner evidence supports the change;
6. reconcile completed or superseded Second Shift delegations and bind the next unattended-safe successor separately from daytime current work;
7. re-fetch the live owner head after any canonical mutation;
8. determine the lane's single current daytime objective and exact next-step contract.

Then reconcile product-root sequencing across the four lanes and shared infrastructure.

## Morning seal

The transaction publishes one append-only daily manifest at:

`governance/morning/daily/YYYY-MM-DD/DAILY-CHAT-BOOTSTRAP.json`

and updates:

`governance/morning/LATEST-BOOTSTRAP-POINTER.json`

The daily manifest is a fast-start cache and reconciliation receipt, not authority over later repository movement. Every new chat rechecks current `main` and its live owner head before execution.

## Required chat packets

The manifest contains four user-facing chat roles:

- MASTER_ROOT — SYSTEM_MASTER product-root controller; includes a summary of CORE because CORE is the shared foundation/spine child. MASTER_ROOT is not a fifth peer system and may not silently absorb child ownership.
- LEARNING — SYSTEM_MASTER/LEARNING
- BOOK — SYSTEM_MASTER/BOOK
- PROSE — SYSTEM_MASTER/BOOK/PROSE

Each packet must contain:

- source main SHA and reconciliation completion SHA;
- live control ref/head and selected state record(s);
- current standing and objective;
- overnight accepted/candidate deltas and evidence pointers;
- completed predecessors relevant to the next objective;
- current open obligations/blockers;
- active repair transactions;
- current Second Shift delegation standing;
- exact qualification/evidence standing;
- `where_we_are` concise state;
- `where_we_are_going` target/outcome;
- one machine-executable `next_step_contract` with ID, objective, first action, PASS proves, PASS unlocks, failure route and forbidden authority;
- `chat_ready` standing.

## Chat-ready gate

A packet may be `CHAT_READY` only when:

- owner and topology resolve;
- live control ref/head was fetched;
- current objective is selected from current owner state/obligations;
- overnight delta is reconciled or truthfully classified;
- active repair/delegation state is reconciled;
- no evidence mismatch is being hidden;
- next step is dependency-valid or its exact blocking decision is identified.

A lane needing a real human/author/private/native/external decision may still be `CHAT_READY_WITH_DECISION`, but the packet must contain exactly the decision needed and must not ask broad project-setup questions.

## Anti-surprise behavior

A new chat must never use surprise, confusion or project rediscovery as a normal state transition. If live state differs from the morning manifest or previous chat, classify the delta and reconcile it before execution.

Allowed response pattern:
`Live authority advanced from <old> to <new>. I reconciled the delta. Current objective is <X>; next action is <Y>.`

Disallowed normal-response patterns include:
- asking the user to explain what System Master is;
- asking which repository or owner lane is meant when the start command already resolves it;
- treating a stale handoff as authority;
- saying work was lost merely because a chat ended;
- expressing surprise that the repository moved;
- restarting a sealed census or completed phase without invalidating evidence.

If an actual ambiguity remains after canonical lookup, classify it precisely: UNALLOCATED, EVIDENCE_MISMATCH, AUTHORITY_DELTA, REPAIR_OWNER_MISMATCH, HUMAN_DECISION_REQUIRED, AUTHOR_DECISION_REQUIRED, PRIVATE_AUTHORITY_REQUIRED, NATIVE_AUTHORITY_REQUIRED or EXTERNAL_AUTHORITY_REQUIRED. Ask only the smallest decision that cannot be resolved from durable authority.

## New-chat execution rule

The user should be able to start with a short command such as:

- `Start today's System Master chat.`
- `Start today's Learning chat.`
- `Start today's Book chat.`
- `Start today's Prose chat.`

The chat then loads CURRENT-AUTHORITY, the latest morning manifest, the relevant packet, and current live authority automatically. It does not require the user to paste history or restate project architecture.

## Final safeguard

Morning reconciliation must prefer truthful `NOT_READY` over fabricated certainty. The goal is zero avoidable confusion, not concealment of real evidence or authority gaps.
