# A01-PORTFOLIO-003 — Full Overnight Work Portfolio

Status: CANONICAL EXTENSION OF A01-SECOND-SHIFT-002
Timezone: America/New_York
Primary window: 00:00–07:00

## Purpose

This contract restores the intended overnight scope from the active System Master conversations. The night shift is not limited to one qualification per chat. It is a portfolio of all dependency-valid work that can safely advance while the operator sleeps.

A-01 and scheduled ChatGPT work are complementary:

- **A-01** executes registered, exact-SHA Windows qualifications and produces authoritative receipts/evidence.
- **Scheduled ChatGPT shifts** perform current research, repository forensics, bounded implementation, test/benchmark preparation, evaluation design, and next-step packaging that does not require A-01.
- A workstream may contribute multiple A-01 tickets when each has its own completion delta and is either independently valid after other failures or explicitly depends on the immediately preceding ticket.
- `depends_on_ticket_id` means the successor may run only after the predecessor receipt class is `PASS`. The planner keeps that successor immediately after its predecessor; the night workflow skips it if the predecessor does not PASS.
- Independent tickets continue after unrelated failures.

## Reconstructed active overnight portfolio

### 1. A-01 / control plane / runner reliability

Objective: keep the shared Windows execution resource safe and useful for the whole portfolio.

Overnight scope:

- runner identity, disk, memory, Node/Git, network and power-state evidence;
- Windows sleep prevention during active qualifications;
- exact-SHA checkout, receipt/evidence integrity and queue serialization;
- timeout/process-tree cleanup and stale temporary-directory hygiene;
- scheduler/planner/enforcement regressions;
- classify infrastructure/control-plane failures without converting them into subject failures or PASS.

Do not create product work merely to exercise A-01.

### 2. Book Evaluation — BOOK-EVAL-LEMONADE-001 / REPAIR-005 Gate-D path

Current intended sequence from the Book System workstream:

`VERIFY TEACHER v3 440/440 FREEZE → INGEST FROZEN TEACHER ARTIFACT → RETRAIN 1,052-RECORD TASK-QUALIFIED HIERARCHICAL STUDENT → SOURCE-HELD-OUT + SELECTIVE-120B ESCALATION ADJUDICATION`

Overnight research/build-ahead scope:

- blind/sequestered evaluator design;
- train/dev/test contamination and leakage controls;
- rubric/construct validity;
- calibration and confidence/abstention;
- inter-rater/judge disagreement and reliability;
- error taxonomy and robustness;
- selective prediction/escalation policy;
- source-held-out evaluation;
- hierarchical teacher/student distillation and task qualification;
- hidden-holdout governance and reproducibility;
- bounded implementation/tests that never inspect, infer, regenerate, relabel or tune against frozen scoring-private gold.

A-01 may execute the Book path only when the exact subject contains the registered wrapper and required private authority is actually available. Missing private data or missing wrapper/source custody is a blocker to that A-01 gate, not permission to fabricate it. Until then, the Book ChatGPT shift continues research, source-custody reconciliation, test design and bounded non-private implementation.

### 3. Learning System

Current exact A-01 boundary:

`LEARNING-PILOT-001-RUN-001-FINAL-HUMAN-EXECUTION`

Frozen subject for the current qualification path:

`effcc16b158f16ec5cbc82ea228df9be52d0b75b`

Overnight scope after/alongside that gate:

- retrieval practice, spacing, interleaving and desirable difficulty;
- mastery and forgetting/retention models;
- transfer and misconception diagnosis;
- assessment validity and calibration;
- adaptive sequencing and feedback timing;
- cognitive load/metacognition/formative assessment;
- learner modeling, accessibility and privacy-preserving evidence;
- rigorous human-evaluation design;
- bounded implementation and hosted tests that require no real participant evidence.

Never fabricate consent, participant responses, retention outcomes, transfer outcomes or human evidence. A software PASS can make the system ready for a human session but cannot supply the human session.

### 4. Literary Prose Engine — LITERARY-PROSE-ENGINE-001

Active branch: `literary-prose-engine-001`.

Current real-book path includes AGLO whole-book processing with unresolved author-only decisions. Those decisions do not block broader prose-system research/build-ahead.

Overnight scope:

- developmental and line-editing intelligence;
- narratology, discourse coherence, POV/focalization and narrative distance;
- scene/chapter/book structure;
- pacing, tension, dialogue and interiority;
- rhythm/prosody/cadence, syntax and paragraph architecture;
- imagery/metaphor, exposition/information flow, motif/repetition;
- voice/canon preservation and revision sequencing;
- uncertainty/abstention and professional editorial workflow;
- evaluation methodology, genre/audience sensitivity and failure cases where automated editing harms good prose;
- rights-aware source/corpus research and bounded implementation with deterministic regression evidence.

Never mutate a manuscript without authority, resolve author intent automatically, publish, imitate named living authors, ingest bulk copyrighted bodies, or weaken preservation/privacy/rights gates.

### 5. System Master Foundation / Continuity

Current conversation objectives include:

- close the Replacement + Signals + Compatibility integration milestone when its exact executable gate is available;
- publish the already-green Recovery Integrity + Visibility + Resource Admission slice when repository authority permits;
- continue the next substantial Continuity & Recovery scope;
- prepare the native iOS client suspend/resume qualification path.

Current known Continuity subject lineage includes `system-master/g-wp-011-015-continuity-slice` and the native-target branch `system-master/continuity-target-ios-suspend-resume-qualification`.

Overnight scope:

- background execution and long-job orchestration;
- recovery/durability and app-state restoration;
- provenance/observability;
- concurrency/idempotency;
- cache/invalidation/synchronization;
- artifact lifecycle;
- security/reliability/resilience;
- portable tests and implementation packets;
- fault-injection/test-harness preparation for native iOS evidence.

A-01 may run Windows/portable evidence only. It must never claim native iOS/macOS suspend/resume evidence.

### 6. System Master Assurance / Reconciliation

Current A-01 boundary:

`ASSURANCE-RECON-001B-OVERNIGHT-DEEP-CENSUS`

Frozen subject:

`5ae9dfbeff56cc05883d7ba3e9f7a4f0da43191c`

Overnight scope:

- source/evidence custody and SHA reachability;
- artifact integrity and historical proof reconciliation;
- current F-WP regression standing;
- separate missing source custody from missing capability and missing target evidence;
- produce exact recovery/repair decisions rather than generalized repeat audits.

PASS proves the bounded census executed; it does not prove Assurance completeness or production authorization.

## Portfolio scheduling rules

1. Up to four READY A-01 tickets per workstream per night are allowed, subject to the global eight-slot night cap and time budget.
2. Every ticket requires a registered qualification, exact subject SHA, completion delta, stop condition, return route and valid runtime window.
3. Omission of `depends_on_ticket_id` means the ticket is independently valid even if another ticket fails.
4. Setting `depends_on_ticket_id` means the ticket requires that predecessor's PASS and must follow it immediately in the A-01 plan.
5. The scheduler balances workstream fairness with priority, critical-path rank, reservations and safe fit.
6. Do not repeat completed regressions/research merely for utilization.
7. When A-01 cannot execute a scope because of platform, private-data, human, author or missing-wrapper authority, the corresponding ChatGPT shift continues every safe research/build/preparation task instead of silently dropping the workstream.

## Scheduled ChatGPT second shift

The persistent nightly portfolio consists of:

- Literary Prose Night Shift;
- Book Evaluator Night Shift;
- Learning Night Shift;
- System Master Night Shift focused on Foundation/Continuity;
- Assurance Night Shift focused on RECON/evidence custody;
- Morning Second Shift Handoff.

The 23:15 portfolio-prep pass must inspect all six active scopes plus A-01 health and may prepare multiple READY A-01 tickets per workstream under this contract. It must not collapse the portfolio back to one ticket per chat.

## Morning success criterion

The success condition is not runner utilization. By morning the portfolio should contain as much as safely possible of:

- completed authoritative A-01 qualifications;
- repaired infrastructure/control-plane defects;
- completed bounded code/test work;
- current research with provenance;
- closed capability/evaluation gaps;
- exact blockers separated from assumptions;
- implementation-ready successor packets;
- fewer unresolved unknowns and shorter critical paths for Book Evaluation, Learning, Literary Prose, System Master and Assurance.
