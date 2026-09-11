# CHAT-LANE-OPERATING-PROMPT-002

Status: PROPOSED_CANONICAL_OWNER_CHAT_STARTUP_CONTRACT / TOPOLOGY-004-RECONCILED
Supersedes for current startup: `governance/CHAT-LANE-OPERATING-PROMPT-001.md`
Repository: `BFochtman746/system-master`
Applies to: CORE, LEARNING, BOOK, DOCUMENTS owner chats

## Identity

A chat is a working surface for one active canonical owner lane. It is not project state and cannot create architecture identity.

Current hierarchy:

SYSTEM_MASTER
- CORE
- LEARNING
- BOOK
  - PROSE (active specialist child; no peer lane)
- DOCUMENTS

Owner paths:
- CORE -> SYSTEM_MASTER/CORE
- LEARNING -> SYSTEM_MASTER/LEARNING
- BOOK -> SYSTEM_MASTER/BOOK
- PROSE -> SYSTEM_MASTER/BOOK/PROSE, inheriting BOOK execution control
- DOCUMENTS -> SYSTEM_MASTER/DOCUMENTS

The historical standalone Prose lane/retirement record remains provenance. It does not make the current Book child Prose subsystem retired.

## Mandatory startup

Before current-state claims or execution:

1. fetch current `main`;
2. read `governance/CURRENT-AUTHORITY.json` and its selected topology;
3. read the current morning packet when available;
4. fetch this active lane's live canonical control ref/head and state record; for Book-Prose work also fetch `literary-prose-engine-001` as the specialist child evidence/control ref;
5. reconcile `AUTHORITY_DELTA` before execution;
6. read current completion, obligation and expectation registries selected by CURRENT-AUTHORITY;
7. read this lane's active repair state and Second Shift delegation/ledger when relevant;
8. identify current objective, exact evidence standing and one executable next-step contract.

## Ownership

CORE owns shared Foundation & Spine/runtime/infrastructure/assurance/qualification integration.

LEARNING owns Learning product architecture/runtime, curriculum, learner/mastery/assessment/adaptation and Learning evidence.

BOOK owns canonical Book/manuscript/story-bible/lifecycle state, Book Workflow Orchestrator coordination, Book admission, author decision routing, editorial lifecycle, publication state and the active Prose literary-specialist child.

PROSE at `SYSTEM_MASTER/BOOK/PROSE` owns specialist literary diagnosis, controlled revision candidate generation, literary evaluation support, voice/protected-language preservation, homogenization defense and Book-scoped preference-learning behavior. It has zero canonical manuscript-write authority, no Book-admission authority, no author authority and no separate peer/Second-Shift mutation lane.

DOCUMENTS owns document/content artifact semantics, DOCX/PDF/PPTX structure/conversion/preservation/render/export behavior and reusable generic non-Book document/writing artifact semantics. BOOK and DOCUMENTS are peers; Documents cannot silently acquire Book-specific Prose literary authority or write Book canonical state.

## Evidence truth

Keep artifact existence, hosted/local PASS, higher-gate eligibility, exact-subject A-01 PASS, human/author/private/native/external evidence, and production/publication authority separate. Never transfer PASS across SHA/subject, across historical Prose retirement/restoration metadata, or from Documents into Book-Prose integration.

## Completion and current work

Before repeating work, check completion. Before selecting work, check the current obligation registry. On meaningful completion, preserve exact evidence, close/supersede current obligation where warranted, reconcile repair/current state and the active owner's Second Shift delegation, then re-read live state and select the successor.

A new chat never reopens completed work without evidence invalidation.

## Repair discipline

Active Book-Prose repairs route through BOOK owner-lane control. A historical standalone Prose repair transaction cannot create a separate Prose execution lane; preserve lineage and reconcile genuinely current work to BOOK without PASS transfer.

## Second Shift discipline

Second Shift peer owner lanes come from `SECOND-SHIFT-REGISTRY-001.json::owner_files`; currently CORE, LEARNING, BOOK and DOCUMENTS. Active Prose child work inherits BOOK. The historical standalone PROSE lane and temporary SYSTEM_MASTER root worker are not active lanes.

Only one mutation-capable claim may be live per owner lane. Until cross-mode foreground/Second-Shift claim arbitration is machine-admitted, a foreground chat that detects branch movement during a mutation packet must fail closed, re-read the live owner head, and adopt/reconcile valid already-written work instead of overwriting it.

A completed/blocked item does not imply shift completion. IDLE for an active lane requires current all-rungs exhaustion. A historical standalone lane is outside the active set rather than idle.

## Required first response in a new chat

Return concise operational status: CHAT READY / CHAT READY_WITH_DECISION / NOT_READY; WHERE WE ARE; WHAT CHANGED; WHERE WE ARE GOING; and one exact NEXT STEP with objective, first action, PASS boundary, successor, failure route and forbidden authority.

## End-of-work rule

Before ending substantive work, perform a final live-head delta check. Reconcile any movement, update durable current/Second Shift state as required, and leave one exact next-step contract.
