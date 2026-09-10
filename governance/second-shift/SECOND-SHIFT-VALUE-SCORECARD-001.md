# SECOND-SHIFT-VALUE-SCORECARD-001

Status: PROPOSED_FOR_ADMISSION
Effective target: 2026-09-10 before the next Second Shift
Scope: measurement of Second Shift usefulness, leverage and rework. This scorecard does not grant product, canonical-writer, A-01, human, author, private, blind, native, publication or production authority.

## Why this exists

Second Shift must be judged by useful verified advancement, not by time spent, runner uptime, commit count, token use, artifact count or whether a worker can say that the night "helped." Activity is diagnostic only. The scorecard separates outcome, quality, autonomous leverage, flow health and later rework so a shift cannot score well merely by producing more artifacts.

The measurement design follows three principles:

1. Speed and stability must be viewed together. A fast night that creates repair work is not high value.
2. Productivity is multidimensional. No single activity measure is accepted as productivity evidence.
3. Perceived AI time savings are not measurement. Counterfactual time is reported only from an observed/calibrated daytime baseline; before calibration, only hard lower-bound avoided interactions are reported.

## Primary morning scorecard

Every post-07:00 handoff reports these measures separately before presenting any composite score.

### 1. Verified Progress Units (VPU)

VPU measures owner-valid project advancement, not files or commits. Credit is tied to a unique objective/stage transition and may be awarded only once per shift for the same transition.

- 3.0 VPU — closes a canonical obligation or major acceptance/qualification boundary with exact evidence.
- 2.0 VPU — advances a canonical implementation/qualification stage or resolves a dependency/blocker that directly unlocks the next stage.
- 1.0 VPU — closes a meaningful research, provenance, contract, state, interface, evidence, test or reconciliation boundary with owner-valid durable evidence.
- 0.5 VPU — produces an owner-valid, verified successor/readiness packet that materially reduces the next execution step but does not itself close the underlying boundary.
- 0.0 VPU — activity with no durable owner/evidence delta, duplicate work, unverified output, or an artifact that merely restates known state.

Anti-gaming rules:
- Splitting one logical stage into multiple files does not multiply VPU.
- Re-running an already-passed unchanged subject does not earn VPU unless it closes a previously open authority/evidence boundary.
- A hosted/local PASS that is not admitted to the required owner lineage receives only the credit supported by that evidence class; it cannot be counted as canonical closure.
- Work later proven defective remains historically recorded and is charged through rework/instability rather than silently deleted.

### 2. Evidence Acceptance Yield (EAY)

`EAY = accepted_verified_VPU / delivered_candidate_VPU`

Report as a percentage. "Accepted" means the work has the evidence/owner standing it claims. Candidate work that passed a lower evidence class but still requires owner admission remains candidate, not accepted at the higher class.

### 3. Autonomous Continuations (AC)

Count each terminal work event (COMPLETED, materially BLOCKED or STALE) that is reconciled into a new dependency-valid successor and continued without a user message.

AC is a hard operational measure of autonomous continuation. It is not automatically converted to hours.

### 4. Minimum Interactive Turns Avoided (MITA)

`MITA = number of autonomous successor transitions that, under the established manual chat workflow, would require a new user execution/continue turn.`

MITA is a lower bound. Do not count internal tool calls, model messages, commits or worker invocations as avoided user turns. The first scheduled work item is not automatically an avoided continuation; successor transitions are.

### 5. Calibrated Daytime Turn Equivalent (DTE)

DTE estimates how many interactive daytime execution turns would have been required for the accepted overnight work.

For each work class, maintain a daytime calibration set of comparable owner-valid work units. A class may be used for time conversion only after at least 5 comparable daytime observations; 10+ is preferred.

Required calibration fields:
- work_class
- complexity_band
- user_execution_turns
- verified_progress_units
- accepted_or_reworked
- session_start/end evidence when available
- notes on unusual human/authority decisions

`DTE = sum(class_median_user_turns_per_VPU * accepted_overnight_VPU_in_class)`

Report sample count and interquartile range. If the calibration threshold is not met, report DTE as UNCALIBRATED and show MITA instead.

### 6. Counterfactual Chat Elapsed Time Avoided (CCETA)

This answers: "How long would the same accepted work likely have taken if we had progressed it sequentially turn-for-turn in daytime chat?"

It is computed only from calibrated comparable daytime work:

`CCETA_hours = sum(class_median_elapsed_chat_minutes_per_VPU * accepted_overnight_VPU_in_class) / 60`

This is elapsed interactive-session time avoided, including model/tool turnaround between required user turns. It is not the same as the user's active attention time. Never estimate it from the seven-hour shift duration, workflow duration, token count or subjective AI speedup.

### 7. Human Attention Saved (HAS)

HAS is stricter than CCETA and remains UNKNOWN until direct human-attention measurement exists.

`HAS = calibrated_counterfactual_active_user_minutes - actual_setup_minutes - morning_review_minutes - correction/rework_user_minutes`

If active-user-minute instrumentation is absent, do not invent HAS. Report MITA and DTE instead.

### 8. Rework / Instability Rate (RIR)

This is a lagging metric and is why the morning score is provisional.

`RIR = delivered_VPU_later_requiring_defect_repair_or_reversal / delivered_VPU`

Do not count normal next-stage work as rework. Count only defect correction, invalid admission, duplicated effort, rollback/reversal, evidence inflation correction or work that must be redone because the overnight result was wrong/stale.

The morning score is PROVISIONAL until the next owner revalidation or a 24-hour observation window, whichever first gives enough evidence. The finalized score records any rework discovered during day shift.

### 9. Flow Health

Report separately:
- READY-to-CLAIM median and maximum latency
- unexplained READY-undispatched minutes
- unjustified IDLE minutes
- stale-claim count and recovery latency
- blocked-to-independent-successor latency
- retry attempts and retry-waste count
- circuit-open count with successful fallback count
- telemetry UNKNOWN minutes

These metrics diagnose execution quality. They do not earn value by keeping a process busy.

## Second Shift Value Index (SSVI)

SSVI is a 0-100 summary for trend comparison, never a replacement for the raw measures above.

### A. Outcome advancement — 35 points

For each eligible owner lane, award up to one lane target based on accepted VPU:
- full lane target at >= 1.0 accepted VPU
- proportional below 1.0 VPU
- a lane with a valid all-eight-rungs-exhausted proof is excluded from the denominator rather than penalized for refusing unsafe/busy work

`Outcome = 35 * average(min(accepted_lane_VPU, 1.0)) across eligible lanes`

The raw VPU total is always shown beside this capped score so unusually productive nights remain visible without incentivizing artificial work splitting.

### B. Evidence and acceptance quality — 20 points

`EvidenceQuality = 20 * EAY`

If claimed evidence exceeds actual authority, the hard-gate rules below apply.

### C. Autonomous leverage — 15 points

Evaluate terminal work transitions during the shift:
- 10 points: percentage reconciled to SUCCESSOR_BOUND or valid all-rungs exhaustion without a user intervention
- 5 points: percentage of eligible successor transitions actually continued within the same or next scheduled cadence

Show AC and MITA as the raw leverage measures.

### D. Flow/reliability — 15 points

Start at 15 and deduct proportionally for:
- READY-undispatched intervals beyond the dispatch SLO
- unexplained IDLE
- stale claims not recovered by the next cadence
- overlapping mutation claims
- unclassified/unbounded retry loops
- poison work left on the hot path
- telemetry gaps large enough to obscure lane state

No deduction is made for a truthful bounded dependency block that is promptly bypassed or correctly exhausted.

### E. Stability/rework — 15 points

Provisional morning value uses objective validation/admission integrity available at handoff. Final value after observation uses:

`Stability = 15 * (1 - RIR)`

A score may therefore decrease later when overnight work causes real rework. This is intentional.

## Hard gates and score confidence

A shift cannot be called high-value if it violated authority to create apparent progress.

Hard-gate failures include fabricated human/author/private/native/production evidence, mutation under a stale owner head without valid reconciliation, canonical-writer violation, PASS transfer, or knowingly counting unverified output as a stronger evidence class.

On a hard-gate failure:
- standing = FAIL_AUTHORITY_OR_EVIDENCE
- SSVI is capped at 49 regardless of activity
- affected VPU is zeroed at the unsupported evidence class
- preserved truthful lower-class evidence may retain only the credit it actually earned

Measurement confidence:
- HIGH: >=95% of the shift interval has coherent event telemetry and all scored VPU has exact evidence pointers.
- MEDIUM: >=80% telemetry coverage and all scored VPU is evidenced.
- LOW: below 80% telemetry coverage or material counterfactual calibration gaps.
- UNSCORABLE: evidence/telemetry contradictions prevent a defensible score.

## Daytime calibration program

The purpose of calibration is to answer the user's turn-for-turn question empirically.

For the next comparable daytime work units, record a small baseline sample by work class. Do not change daytime behavior merely to improve the baseline. At minimum capture the count of user execution/continue turns needed to move from an owner-valid starting state to accepted evidence. Where reliable session timestamps exist, also capture elapsed chat time.

Suggested work classes:
- research/provenance closure
- architecture/contract/state specification
- deterministic test/fixture design
- bounded implementation
- hosted qualification/admission
- repair/recovery
- census/reconciliation
- successor/readiness packet

Do not mix obviously different complexity bands. A five-minute evidence reconciliation and a multi-stage implementation/qualification are not interchangeable samples.

Until enough calibration exists:
- report MITA as the hard lower bound
- report accepted VPU and AC
- do not publish a precise hours-saved number

After calibration:
- report MITA
- report DTE with sample size/range
- report CCETA with sample size/range
- report HAS only when active human attention is actually measured

## Morning presentation

Every morning handoff should show, at minimum:
- SSVI provisional/final and measurement confidence
- accepted VPU by lane and total
- EAY
- AC and MITA
- DTE and CCETA, or UNCALIBRATED with the reason
- RIR/provisional stability standing
- READY/IDLE/stale/retry/telemetry diagnostics
- user interventions required overnight
- morning review/correction burden when known
- exact examples of the highest-value and lowest-value overnight work
- recommendation: KEEP / TUNE / REDUCE / SUSPEND Second Shift based on measured trend, not enthusiasm

## Decision rules after enough nights

Use a rolling seven-shift view rather than one night.

Second Shift is clearly earning its place when it repeatedly shows:
- positive accepted VPU across the intended lanes
- high EAY
- low rework/instability
- meaningful MITA/DTE
- low morning review/correction burden
- no authority/evidence violations
- declining unexplained idle/READY latency

A busy but low-VPU or high-rework shift should be tuned or reduced. If the net calibrated human/time leverage becomes zero or negative over a representative window, the system should recommend suspending or narrowing Second Shift rather than preserving it as a ritual.
