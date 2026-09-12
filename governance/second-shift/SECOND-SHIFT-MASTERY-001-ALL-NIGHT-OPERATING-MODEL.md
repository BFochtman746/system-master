# SECOND-SHIFT-MASTERY-001 — ALL-NIGHT OPERATING MODEL

Status: DESIGN LOCK / NOT YET ACTIVE
Date: 2026-09-12
Owner: SYSTEM_MASTER / Second Shift control
Purpose: define the operating model Second Shift must obey before its reliability mechanisms are treated as sufficient for unattended overnight work.

This document is a control-design lock, not production activation. It does not modify the current CG-011 qualification state, does not begin CG-012, does not grant A-01 qualification, and does not transfer product/canonical-writer/human/author/private/native/publication/production authority.

## 1. Problem being solved

The current Second Shift can prove many forms of authority correctness, but it does not yet prove that an entire night is used well. The existing model also permits multiple peer lanes to progress independently and contains a broad eight-rung work-ahead ladder that can move a worker into research/specification activity after its original task completes or blocks.

The operating model therefore must solve six distinct problems at once:

1. keep useful work moving from shift open through morning handoff rather than merely launching overnight work;
2. focus the night on the highest-value system instead of spreading attention across every active system by default;
3. select that system reproducibly and explainably;
4. prevent assignment drift by constraining every executable successor to the frozen night mission;
5. observe real progress, stalls, recovery, idle time and unknown telemetry without inferring utilization from runner uptime;
6. produce a morning report optimized for human understanding while preserving complete technical evidence underneath it.

## 2. Research-backed design conclusions

The following principles are treated as architectural invariants:

- Persistent orchestration is required for long-running work. A scheduler/supervisor must repeatedly discover eligible work and continue until an exit condition, rather than assuming a one-shot nightly launch will remain productive.
- Workflow state must be durable so crashes/restarts resume from checkpoints instead of restarting or losing work.
- At-least-once execution requires idempotent effects, deduplication and bounded retries.
- Work-in-progress must be constrained. Limiting concurrent top-level work reduces context switching and encourages completion before new work is opened.
- Long-running agents need tractable work units plus durable handoff artifacts; broad high-level prompts are insufficient.
- The worker that produced an artifact must not be the sole judge that the work is complete or still aligned. Planning/execution and evaluation are separate responsibilities.
- Guardrails must be layered and explicit: allowed scope, forbidden scope, stop/escalation conditions, and output validation.
- Monitoring must distinguish useful execution from liveness. Heartbeats prove that something is alive; checkpoints/evidence prove that it is advancing.
- Morning handoff must foreground current condition, meaningful changes, unresolved issues and next actions; technical detail remains available as evidence rather than dominating the operator summary.

Research basis:

- Anthropic, “Effective harnesses for long-running agents” (2025): incremental progress, structured artifacts, clean session handoff.
- Anthropic, “Harness design for long-running application development” (2026): planner/generator/evaluator separation and skeptical external evaluation.
- OpenAI, “A practical guide to building agents”: explicit instructions, orchestration loops, layered guardrails, defined exit conditions and human intervention thresholds.
- OpenAI, “How AI-native companies turn workflows into operating capability” (2026): define outcome/KPI/owner/guardrails, job description, evidence and stop points.
- Apache Airflow scheduler documentation: persistent scheduler loops, queue/capacity awareness and explicit priority handling.
- Temporal durable-execution documentation: persisted workflow state, retries, task queues, timers and continuation after failure.
- Kubernetes CronJob documentation: scheduled work can be delivered more than once; jobs must be idempotent and concurrency behavior must be explicit.
- Google SRE monitoring/on-call guidance: structured telemetry, meaningful signals, explicit handoff, playbooks, escalation and post-incident learning.
- Kanban/WIP guidance: limit concurrent work, finish before starting more, expose bottlenecks and reduce context switching.

## 3. The overnight operating objective

Second Shift is not successful because a workflow was launched, a runner remained online, commits were produced, or the shift window elapsed.

A successful night means:

- the correct primary system was selected from current authority;
- a concrete primary-system mission was frozen before mutation;
- useful mission-aligned work continued whenever dependency-valid unattended-safe work existed;
- stalls/crashes/retries were detected and recovered without duplicate effects;
- work did not drift outside the frozen mission;
- every completed packet was independently verified before its successor became executable;
- idle time was either prevented or supported by a durable proof that no mission-valid work remained;
- the morning handoff truthfully explains the starting point, ending point, achieved progress, utilization, adherence, quality, remaining work and decisions.

The controller must optimize for completed, verified progress—not raw activity, commit count, token usage, runner uptime or simultaneous lane count.

## 4. Primary-System Night policy

### 4.1 Default WIP rule

The night has exactly one PRIMARY SYSTEM mission at a time.

Top-level system WIP = 1.

Parallel work is permitted only when every parallel activity directly supports the same primary-system mission, for example:

- implementation plus tests;
- independent evaluator/qualification;
- evidence collection for the same packet;
- recovery/reconciliation of the same mission;
- non-mutating analysis explicitly required by the current approved packet.

Parallel product advancement of unrelated systems is not permitted merely because capacity exists.

### 4.2 Same-system continuation

When a packet completes or becomes materially blocked, the controller must first select the next pre-approved dependency-valid packet inside the same primary-system mission.

A blocker does not automatically authorize broad research or unrelated work.

### 4.3 Reserve system

Before shift start, the selector may name exactly one RESERVE SYSTEM.

The reserve remains non-executable unless all of the following are true:

1. the primary system has no executable packet in its approved mission queue;
2. every permitted same-system fallback class has been checked;
3. blockers/exhaustion are durable and independently evaluated;
4. no safe primary-system qualification, repair, evidence, reconciliation or successor-preparation packet remains inside the frozen mission;
5. reserve activation is recorded as a mission transition with its reason.

Reserve activation never rewrites or hides the primary-system result.

### 4.4 No round-robin night rotation

Systems are not selected simply because they have not had a recent night. Aging/starvation matters only after eligibility and value are established.

## 5. Night Selection Gate

System selection has two stages: ELIGIBILITY, then PRIORITY.

### 5.1 Hard eligibility gate

A system is night-eligible only when all are true:

- it resolves through current authority/topology and an authorized owner/control head;
- the work is unattended-safe under existing authority boundaries;
- an exact current objective is open;
- there is at least one concrete executable packet with measurable completion evidence;
- the immediate next step does not require a user decision, author/private/native/external permission, or unavailable mandatory authority;
- the system has a prepared same-system work-ahead queue rather than a single isolated task;
- completion/quality can be independently evaluated;
- mutation ownership and foreground/Second-Shift arbitration are unambiguous;
- any mandatory repair/control-health obligation is represented before discretionary work.

A system failing eligibility cannot win the night regardless of importance.

### 5.2 Priority score v1

Eligible systems are ranked on a 100-point score:

- 30 — CRITICAL-PATH / UNLOCK VALUE: how much completing this system mission unblocks downstream System Master work;
- 20 — EXECUTABLE QUEUE DEPTH: confidence that enough approved same-system work exists to use the shift productively;
- 15 — MILESTONE COMPLETION VALUE: likelihood of crossing a meaningful verified milestone rather than producing partial artifacts;
- 15 — RELIABILITY / BLOCKER REDUCTION: reduction of defects or control risk that currently threatens progress;
- 10 — DEPENDENCY LEVERAGE: reusable value for other authorized work without crossing ownership boundaries;
- 10 — AGE / STARVATION: prevents a consistently eligible valuable system from never receiving a night.

Tie breakers, in order:

1. mandatory repair/control-health work;
2. larger critical-path unlock;
3. stronger executable queue depth;
4. older last-primary-night timestamp;
5. deterministic lexical system id.

The selector must persist both the winning score and the rejected candidates with reasons so the morning report can answer “Why did we work on this system?”

### 5.3 Calibratable parameters

The score weights are the v1 operational policy and may change only through a recorded policy revision after measured night outcomes. Time-based watchdog and utilization thresholds are intentionally not frozen by this document; they require baseline telemetry rather than guesswork.

## 6. Night Assignment Contract v3

No autonomous mutation begins from a broad prose request. Every executable overnight mission requires a frozen machine-readable Assignment Contract v3.

Required fields:

- shift_id
- mission_id
- primary_system
- reserve_system_or_null
- owner_path
- control_ref
- control_head_at_freeze
- objective_id
- module_or_capability
- plain_language_mission
- starting_state
- target_end_state
- definition_of_done
- approved_packet_queue
- packet_dependency_graph
- allowed_actions
- allowed_paths_or_surfaces
- forbidden_actions
- forbidden_authority
- required_tests_or_evaluations
- required_evidence
- checkpoint_contract
- retry/recovery policy
- research_policy
- successor_policy
- reserve_activation_policy
- human_escalation_conditions
- stop_conditions
- morning_report_labels

### 6.1 Packet requirements

Every approved packet must identify:

- packet_id;
- exact purpose;
- required predecessor evidence;
- bounded scope;
- expected completion delta;
- allowed mutation surface;
- forbidden mutation surface;
- objective verification method;
- evaluator acceptance criteria;
- on-pass successor ids;
- on-block fallback ids;
- conditions that require human escalation.

### 6.2 Research policy

Default overnight research permission = NONE.

Research is executable only when one of these is true:

- the frozen mission is explicitly a research/benchmark mission; or
- the current packet identifies a named uncertainty that directly blocks its defined outcome and gives a bounded research question, allowed sources/surfaces and stop condition.

“Research something useful,” “improve the system,” “look for opportunities,” or equivalent open-ended exploration is non-executable overnight.

Research discovered during execution may be recorded as a candidate for future planning but cannot silently become the current assignment.

### 6.3 Successor law

A worker may propose a successor but cannot self-authorize an unlisted successor.

A successor becomes executable only if:

1. it is already in the frozen approved queue; or
2. the independent evaluator proves it is a necessary same-mission continuation and the controller admits it through the mission’s successor policy.

A successor that changes system, capability boundary, objective, research scope or authority class requires replanning, not automatic continuation.

## 7. Planner / Worker / Evaluator separation

Second Shift uses three logical responsibilities even if some are implemented by the same model family:

### Planner

- reconstructs current authority;
- runs the Night Selection Gate;
- freezes the Assignment Contract;
- prepares the mission queue and reserve;
- does not claim execution success.

### Worker

- executes one admitted packet at a time;
- preserves checkpoints and evidence;
- may propose but not self-authorize scope expansion;
- cannot mark its own packet as finally accepted.

### Evaluator

- independently checks exact packet completion evidence;
- verifies mission adherence and forbidden-scope compliance;
- classifies PASS / REWORK / BLOCKED / DRIFT;
- validates any proposed successor against the frozen mission;
- is intentionally skeptical and must cite evidence for PASS.

No packet is terminally accepted solely because the worker says it is complete.

## 8. Drift control

Drift is a control event, not merely a reporting label.

A candidate action is in-bounds only when it maps to:

- the current mission_id;
- current primary system;
- current module/capability boundary;
- one admitted packet_id;
- one allowed action class;
- an allowed mutation/read surface;
- the packet’s objective or verification need.

Drift classes:

- SCOPE_DRIFT — unrelated capability/system work;
- RESEARCH_DRIFT — unapproved/open-ended research;
- SUCCESSOR_DRIFT — worker invents an unapproved successor;
- AUTHORITY_DRIFT — action requires authority not granted by the mission;
- EVIDENCE_DRIFT — activity produces artifacts without advancing required evidence;
- COMPLETION_DRIFT — worker declares success without evaluator-backed definition-of-done evidence.

On drift detection:

1. stop the candidate action before further mutation where possible;
2. preserve exact evidence;
3. mark DRIFT_DETECTED;
4. restore/reconcile the last valid checkpoint;
5. re-enter the current approved packet or admitted fallback;
6. include the drift and recovery in the morning report;
7. add the failure pattern to the future assignment/evaluator regression suite.

## 9. All-night supervisor

The supervisor owns the entire 00:00–07:00 America/New_York shift window already defined by current telemetry.

Its responsibility is continuous; a successful initial dispatch does not discharge the supervisor.

The supervisor repeatedly performs:

1. authority freshness check;
2. active packet/claim reconciliation;
3. progress/checkpoint freshness check;
4. evaluator state check;
5. runnable-queue check;
6. retry/recovery check;
7. successor admission;
8. reserve eligibility check;
9. telemetry integrity check;
10. morning-close preparation near shift end.

### 9.1 Runtime state classes

Every shift interval must be reconstructable as one of:

- EXECUTING — worker actively advancing an admitted packet;
- VALIDATING — required tests/evaluator/qualification for the admitted packet;
- RECOVERING — bounded restart/retry/reconciliation for the admitted mission;
- WAITING_REQUIRED — bounded wait on an admitted external/internal dependency with next probe/timeout recorded;
- READY_UNCLAIMED — executable work exists but is not running;
- IDLE_VALID — no mission-valid work remains after required exhaustion proof;
- UNKNOWN — telemetry is missing/contradictory and utilization must not be inferred.

READY_UNCLAIMED and UNKNOWN are operational defects when they exceed the eventually calibrated service thresholds.

IDLE_VALID is truthful but not considered productive execution.

### 9.2 Liveness is not progress

Heartbeat = worker/process liveness.

Progress checkpoint = evidence that the packet advanced.

The watchdog must evaluate both independently. Repeated heartbeats with no meaningful checkpoint advancement become NO_PROGRESS, not healthy execution.

### 9.3 Queue replenishment

The mission begins with a prepared queue, but the controller may admit same-mission successors while the night proceeds only under the successor law above.

The queue must never be replenished by generic open-ended research merely to keep the system busy.

### 9.4 Failure/restart relationship to CG-011

CG-011 remains the reliability foundation for this supervisor: durable enqueue/claim/dispatch/result state, idempotent replay, fencing, crash/restart recovery, cancellation, duplicate handling and durable reconstruction.

SECOND-SHIFT-MASTERY-001 does not replace CG-011. It defines what CG-011 must reliably preserve and resume.

## 10. Progress telemetry v2 requirements

The existing utilization ledger is retained as provenance but must evolve to represent mission-level truth.

Required new concepts:

- NIGHT_SELECTED with selector score and candidate dispositions;
- MISSION_FROZEN with assignment-contract digest;
- PACKET_READY / PACKET_CLAIMED / PACKET_PROGRESS / PACKET_VALIDATING;
- PACKET_ACCEPTED / PACKET_REWORK / PACKET_BLOCKED;
- EVALUATOR_VERDICT;
- DRIFT_DETECTED / DRIFT_RECOVERED;
- NO_PROGRESS;
- RECOVERY_STARTED / RECOVERY_SUCCEEDED / RECOVERY_FAILED;
- RESERVE_ACTIVATED;
- REQUIRED_WAIT_STARTED / REQUIRED_WAIT_ENDED;
- IDLE_VALID;
- MORNING_HANDOFF_SEALED.

For every time interval, the morning reconciler must be able to explain what state the primary mission was in and why.

Required shift metrics:

- planned shift duration;
- observable shift duration;
- executing duration;
- validating duration;
- recovering duration;
- required-wait duration;
- ready-unclaimed duration;
- valid-idle duration;
- unknown duration;
- packets planned;
- packets accepted;
- packets reworked;
- packets blocked;
- drift events;
- recovery events and outcomes;
- primary-to-reserve transition if any;
- mission-adherence result;
- telemetry completeness.

Do not infer these metrics from Git commit timestamps, process uptime or workflow duration.

## 11. Calibration before hard time thresholds

Current telemetry uses 50-minute heartbeat, 70-minute ready-dispatch and 75-minute freshness SLAs. This design does not automatically carry those numbers forward as mastery targets.

Before activation, collect baseline measurements from representative simulated/shadow nights and determine:

- normal scheduler tick latency;
- normal worker checkpoint cadence;
- validation duration distribution;
- restart/recovery duration;
- queue handoff latency;
- expected bounded dependency wait durations.

Then lock service thresholds from measured distributions plus a safety margin.

Threshold policy must separately cover:

- scheduler liveness;
- worker liveness;
- meaningful progress;
- ready-to-dispatch latency;
- evaluator turnaround;
- telemetry freshness;
- recovery completion;
- morning handoff seal.

Threshold changes require versioned policy evidence; they cannot be loosened automatically to make a bad night appear healthy.

## 12. Morning Report v2 — human-first design

The technical reconciliation remains available, but the default morning report is a one-minute operator briefing.

### 12.1 Human summary — required order

1. TONIGHT’S MISSION
   - primary system;
   - module/capability;
   - plain-language goal;
   - why this system won the Night Selection Gate.

2. WHERE WE STARTED
   - one plain-language baseline statement;
   - meaningful milestone or packet position.

3. WHERE WE FINISHED
   - one plain-language ending-state statement;
   - highest accepted milestone reached.

4. PROGRESS ACHIEVED
   - accepted planned packets / planned packets;
   - milestone delta;
   - never invent a whole-system percentage without an audited denominator.

5. DID SECOND SHIFT USE THE NIGHT?
   - shift window;
   - executing + validating + recovering + required-wait time;
   - ready-unclaimed time;
   - valid idle time;
   - unknown time;
   - longest unexplained/nonproductive gap and reason.

6. DID IT STAY ON ASSIGNMENT?
   - STAYED_ON_MISSION / CONTROLLED_RECOVERY / DRIFT_DETECTED_RECOVERED / DRIFT_UNRESOLVED;
   - short explanation.

7. DID THE WORK HOLD UP?
   - evaluator result;
   - tests/qualification actually executed;
   - rework/rollback if any;
   - unresolved uncertainty.

8. WHAT WENT WRONG OR NEEDED RECOVERY?
   - only material issues;
   - whether automatically recovered;
   - time/progress impact.

9. WHAT IS LEFT?
   - next same-system milestone;
   - remaining admitted packet chain or exact blocker.

10. DO YOU NEED TO DECIDE ANYTHING?
    - NO, or one concise decision with choices and consequences.

11. NIGHT VERDICT
    - SUCCESS / PARTIAL_SUCCESS / BLOCKED / INCONCLUSIVE;
    - one-sentence explanation based on mission progress, utilization, adherence and quality.

12. NEXT-NIGHT RECOMMENDATION
    - recommended primary system for the next shift is a recommendation only; the next Night Selection Gate must recompute from fresh authority.

### 12.2 Technical appendix

The following remains attached/referenced but outside the default human summary:

- exact SHAs/refs;
- assignment-contract digest;
- packet/evaluator receipts;
- tests and run ids;
- retry/circuit/recovery events;
- drift evidence;
- telemetry ledger;
- authority reads;
- blocker details;
- non-claims.

The human report never sacrifices evidence; it changes the presentation order.

## 13. Night verdict rules

SUCCESS requires:

- at least one meaningful planned mission milestone accepted unless the mission itself was a pure qualification/verification mission;
- no unresolved drift;
- evaluator-backed quality acceptance for claimed completion;
- no unexplained READY_UNCLAIMED or UNKNOWN interval beyond calibrated limits;
- morning handoff sealed truthfully.

PARTIAL_SUCCESS means meaningful accepted progress occurred but the target end state was not reached or material recoverable inefficiency remained.

BLOCKED means the mission could not advance because an explicit dependency/authority/human condition prevented safe work and no admitted fallback/reserve path could execute.

INCONCLUSIVE means telemetry/evidence is insufficient to know whether the night was productive or correct. Inconclusive must never be converted to success by inference.

## 14. Learning loop

Every material overnight defect becomes reusable control evidence.

Morning reconciliation must classify:

- wasted ready time;
- no-progress periods;
- unexpected blocker;
- bad selector decision;
- insufficient queue depth;
- drift attempt;
- evaluator false accept/reject;
- recovery failure;
- missing telemetry;
- confusing morning-report output.

Each classified defect must produce one of:

- assignment-contract rule improvement;
- selector feature/policy update;
- evaluator regression case;
- supervisor/watchdog regression case;
- telemetry/schema improvement;
- morning-report presentation improvement;
- explicit NO_CHANGE with evidence that the event is acceptable variance.

The system must learn from nights without silently changing its authority boundaries.

## 15. Required implementation sequence after this design lock

This document does not activate the new operating model. Implementation must proceed in this order:

1. Preserve and finish CG-011 qualification/closure because durable restart/idempotency is foundational.
2. Define machine-readable Night Selection and Assignment Contract v3 schemas.
3. Implement selector eligibility + scoring + persisted explanation.
4. Implement primary-system WIP=1 and reserve-system transition law.
5. Implement packet queue + planner/worker/evaluator admission flow.
6. Implement drift guard/evaluator and regression suite.
7. Implement all-night supervisor/watchdog state model on top of CG-011 durability.
8. Implement Progress Telemetry v2 and deterministic interval reconstruction.
9. Implement Morning Report v2 human summary plus technical appendix.
10. Run simulations/failure injection covering crashes, empty queue, blocked primary, reserve activation, duplicate delivery, stale authority, drift attempt, no-progress heartbeat, evaluator rework and missing telemetry.
11. Run shadow nights without production authority and collect baseline timing distributions.
12. Freeze calibrated service thresholds from measured evidence.
13. Run adversarial closure audit of the complete Second Shift operating model.
14. Only then consider active-night promotion through the repository’s normal authority path.

## 16. Acceptance criteria for SECOND-SHIFT-MASTERY-001

The design is complete only when all of the following are true:

- one primary system per night is the default top-level WIP law;
- reserve activation is bounded and cannot bypass same-system exhaustion;
- selection is eligibility-gated, scored, deterministic and explainable;
- assignment contracts freeze scope, target, evidence, permissions, research and successors;
- research defaults to forbidden unless specifically admitted;
- worker self-expansion and self-acceptance are prohibited;
- evaluator independence is explicit;
- drift has machine-detectable classes and recovery behavior;
- supervisor responsibility spans the whole shift rather than only initial dispatch;
- liveness and progress are separate signals;
- telemetry can reconstruct every interval or report UNKNOWN;
- time thresholds are calibrated from evidence before activation;
- morning reporting is human-first while preserving complete technical evidence;
- CG-011 remains the underlying crash/restart/idempotency foundation;
- no production/A-01/author/native/external authority is implied.

## 17. Locked conclusion

Second Shift will be designed as a focused overnight operating system, not a collection of independent nightly jobs.

Its default behavior is:

SELECT ONE PRIMARY SYSTEM -> FREEZE ONE MISSION -> PREPARE A SAME-SYSTEM WORK QUEUE -> EXECUTE ONE ADMITTED PACKET AT A TIME -> INDEPENDENTLY EVALUATE -> CONTINUE SAME MISSION -> RECOVER DURABLY ON FAILURE -> ACTIVATE RESERVE ONLY AFTER VERIFIED PRIMARY EXHAUSTION -> SEAL A HUMAN-FIRST MORNING HANDOFF.

CG-011 is the reliability substrate that makes this operating model survivable. SECOND-SHIFT-MASTERY-001 defines what that reliability must preserve.