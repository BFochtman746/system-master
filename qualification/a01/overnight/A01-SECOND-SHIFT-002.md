# A01-SECOND-SHIFT-002 — Overnight Acceleration Operating Model

Status: CANONICAL EXTENSION OF A01-OVERNIGHT-001
Timezone: America/New_York
Primary window: 00:00–07:00
Full portfolio authority: `qualification/a01/overnight/A01-PORTFOLIO-003.md`

## Objective

Use the sleeping window as a real second shift for System Master. Optimize for reduction in next-day work, uncertainty, waiting, and critical-path distance — not raw A-01 utilization.

A-01 and ChatGPT overnight work are complementary:

- **A-01** is the authoritative Windows execution/evidence resource.
- **Scheduled ChatGPT overnight work** performs current web research, forensic gap analysis, implementation preparation, and bounded branch work that does not require A-01.
- The two may operate in parallel. ChatGPT research must not create independent A-01 cron workflows or bypass the central A-01 scheduler.

The overnight portfolio is not limited to one job per chat. A workstream may submit multiple READY A-01 tickets, currently up to four per night, when each ticket has a distinct completion delta and is either independently valid or carries an explicit PASS dependency on the immediately preceding ticket. The global eight-slot and 00:00–07:00 safety budgets still apply.

## Second-shift lanes

1. **FINISH** — close an already-defined build, test, evaluation, qualification, recovery, or promotion boundary.
2. **BUILD_AHEAD** — implement bounded work whose requirements and acceptance evidence are already clear and that requires no human decision.
3. **RESEARCH_AHEAD** — answer a defined uncertainty or systematically fill capability/evaluation/source gaps so daytime work starts with evidence rather than discovery.
4. **PREPARE_NEXT** — convert established evidence into implementation-ready packets, tests, datasets, source registries, benchmark plans, or exact next objectives.
5. **EXPLORE** — bounded high-upside discovery only after the other lanes have no safe higher-value work.

A lane does not outrank a higher-value task merely because of its name. Ticket `priority`, exact completion delta, safety, dependencies, and admission window remain authoritative.

## Multi-ticket dependency semantics

- No `depends_on_ticket_id` means the ticket is independently valid and may run after unrelated failures.
- `depends_on_ticket_id` means the ticket requires that predecessor's authoritative receipt class to be `PASS`.
- Dependencies are same-workstream, same-night, bounded chains.
- The planner keeps a dependent immediately behind its predecessor.
- The night workflow skips a dependent when the predecessor is not PASS; it does not reinterpret a failure as permission to continue.
- Independent later work may continue after a failed or skipped chain.

## What A-01 is for

A-01 may perform repository-registered Windows work such as:

- exact-SHA builds and compilation;
- unit, integration, regression, mutation, fuzz/property, reliability, stress, and deterministic replay testing when the registered wrapper defines them;
- evaluator/benchmark execution and source-held-out evaluation when the required data is lawfully and securely available to the runner;
- CPU-, memory-, I/O-, and network-bound data processing;
- model training/evaluation when the model, data, runtime, memory, storage, and checkpoint requirements are explicitly registered and available;
- public-source metadata/research acquisition through bounded repository-owned programs;
- artifact generation, integrity checks, provenance capture, packaging, and forensic repository/source analysis;
- registered recovery and promotion qualifications;
- registered disruptive work outside overnight mode when the control-plane post-action protocol explicitly permits it.

A-01 is **not** an autonomous ChatGPT conversation. It does not independently perform high-level synthesis just because a chat wants research. High-level current-web research and synthesis belongs to scheduled ChatGPT work; A-01 may acquire/process the evidence that makes that synthesis faster and more complete.

## What A-01 must never fake

A-01 must not fabricate or infer:

- human consent, participant responses, human preference evidence, author intent, or publication approval;
- unavailable private files, hidden evaluation authority, or credentials;
- iOS/macOS-native execution evidence on the Windows runner;
- a PASS after timeout, missing evidence, checkout mismatch, failed preflight, or failed registered wrapper;
- a new overnight task merely to avoid idle time.

## Runner survival and fail-closed protections

Every A-01 gateway job is protected by the canonical control plane and runner-health guard:

- exact runner identity and Windows/X64 labels;
- global serialized A-01 concurrency with queueing;
- registered qualification allowlist; no arbitrary command input;
- exact subject checkout and exact-SHA receipt binding;
- preflight minimum free disk and available-memory thresholds;
- Node and Git availability checks;
- Windows sleep-prevention capability probe;
- system-sleep prevention for the entire long qualification step;
- bounded qualifier timeout and outer job timeout;
- forced Windows child-process-tree termination on qualifier timeout;
- refusal to start an overnight qualifier that no longer fits its admission window;
- no disruptive post-actions in the overnight scheduler;
- evidence upload even when the qualifier fails;
- preflight/postflight resource snapshots and best-effort stale A-01 temporary-directory hygiene;
- independent later slots continue after a subject failure, while explicit successors require predecessor PASS.

These controls reduce software and operating-system failure modes. They cannot eliminate physical power loss, hardware failure, an OS/kernel crash, loss of Internet connectivity, a forced external restart, or a GitHub service outage. Those events are infrastructure failures, not subject failures, and must never authorize promotion.

## Research-ahead contract

Research is useful overnight when it eliminates tomorrow's discovery work. It must end with durable outputs, not a reading list.

Each research project should produce, as applicable:

1. question/gap inventory tied to the current repository capability;
2. current primary/authoritative sources and provenance;
3. evidence-backed findings, disagreements, and uncertainty;
4. explicit `already-covered / partial / missing / unsupported / human-only` disposition;
5. implementation and evaluation implications;
6. candidate tests, benchmarks, datasets/source-registry entries, or acceptance criteria;
7. exact prioritized next-day build packets;
8. a stop condition explaining when more research becomes repetition rather than progress.

Research must preserve copyright, privacy, evaluation-separation, human-consent, author-intent, and named-author-imitation boundaries already established by each workstream.

## Build-ahead contract

Unattended implementation is allowed only when:

- the scope is bounded and repository authority is clear;
- no unresolved human/author/product decision is required;
- acceptance tests or equivalent objective checks can be defined before implementation;
- frozen/private evaluation sets are not used for iterative tuning;
- work remains on the owning workstream branch;
- promotion/merge authority is not inferred from hosted tests;
- any A-01 promotion or exact-target claim still goes through a registered gate.

If these conditions are not met, the overnight task produces research or an implementation-ready packet instead of guessing.

## Workstream operating intent

The full current scopes and exact active objectives are maintained in `A01-PORTFOLIO-003.md`. In summary:

- **Book Evaluation:** evaluator validity, private-gold/source custody, Teacher v3 440/440 freeze, 1,052-record hierarchical student path, source-held-out evaluation and selective escalation.
- **Learning:** exact software qualification plus learning-science, mastery/retention/transfer, adaptive sequencing, measurement validity and human-evaluation preparation without fabricated human evidence.
- **Literary Prose:** systematic prose-intelligence strengthening beyond current author-dependent manuscript decisions, including craft theory, discourse/narrative structure, POV, pacing, dialogue, rhythm, voice/canon preservation, evaluation and professional editorial workflow.
- **System Master Foundation/Continuity:** Replacement + Signals + Compatibility closure when executable, Recovery Integrity + Visibility + Resource Admission publication path, next Continuity/Recovery scope, and native iOS suspend/resume preparation without claiming Apple-native proof from Windows.
- **Assurance/Reconciliation:** evidence/source custody, integrity, reachability, regression standing and exact recovery/repair decisions.
- **A-01/control plane:** runner/scheduler reliability and truthful evidence classification without inventing work for utilization.

## Nightly orchestration

- A scheduled ChatGPT portfolio-prep pass re-evaluates current work before the night window and avoids stale tickets.
- The central A-01 scheduler at 23:57 owns all A-01 overnight execution.
- Workstream research/build automations operate on their own branches and do not dispatch A-01 independently.
- Morning handoff summarizes completed execution, research, code/evidence changes, unresolved failures, and the exact best daytime objective.

The target morning state is not “A-01 was busy.” It is: **the team wakes up with completed work, fewer unknowns, stronger systems, and a shorter path through the next day.**
