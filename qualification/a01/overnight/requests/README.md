# A-01 Overnight Requests

Canonical second-shift authority:

- `qualification/a01/overnight/A01-SECOND-SHIFT-002.md`
- `qualification/a01/overnight/A01-PORTFOLIO-003.md`

A workstream may submit multiple `READY` tickets for a night when each ticket has a distinct completion delta and is safe under the dependency rules. The current cap is four READY tickets per workstream per night, subject to the global eight-slot night plan and time budget.

Use unique filenames such as:

`2026-09-09--LEARNING--large-regression.json`

Do not edit another workstream's ticket. To withdraw your own ticket before the night shift, change its state to `HOLD` or `SUPERSEDED` in a forward commit.

A ticket is a request for A-01 executable work, not a request for an autonomous ChatGPT conversation. The referenced `qualification_id` must already be registered and explicitly marked overnight-eligible in `qualification/a01/registry.json`.

## Dependency rule

Tickets are independent by default. If a ticket can execute safely only after another ticket has passed, set:

`"depends_on_ticket_id": "<predecessor-ticket-id>"`

The dependency must be in the same workstream, READY for the same night, and within the configured chain-length cap. The planner places a dependent ticket immediately after its predecessor and marks it `requires_previous_pass=true`. The night workflow skips that successor unless the immediately preceding A-01 receipt class is `PASS`.

Do not omit a real dependency merely to keep work running after a failure. Omitting `depends_on_ticket_id` is an assertion that the ticket remains valid even if any other ticket fails.

## Completion-delta rule

Unused A-01 capacity is acceptable. A workstream MUST NOT submit or retain a `READY` ticket merely to occupy the runner.

Every `READY` ticket is mechanically required by the planner to declare a valid `overnight_lane`, `completion_delta`, and `stop_condition`.

The supported lanes are:

1. `FINISH`
2. `BUILD_AHEAD`
3. `RESEARCH_AHEAD`
4. `PREPARE_NEXT`
5. `EXPLORE`

The four completion-delta parts are:

1. **Before** — the exact authoritative standing or blocker before the run.
2. **Evidence** — the unique evidence the overnight execution will produce.
3. **After PASS** — the authoritative standing or next-day preparation state that changes if the receipt is conforming.
4. **Unlocks** — the exact next dependency-valid objective or daytime work eliminated by that change.

A ticket with no material `after_pass` or `unlocks` transition is `HOLD` or `SUPERSEDED`, even when A-01 would otherwise be idle.

`value_class` and `critical_path_rank` are descriptive governance metadata. Executable authority remains the registered qualification, exact subject SHA, admission window, canonical receipt and return route.

## Portfolio priority

Priority represents expected reduction in next-day work and critical-path distance, not perceived workstream importance or runtime. Prefer high-value exact-subject closure, bounded build-ahead, research that eliminates defined unknowns, and next-day preparation. Do not repeat completed census, research, stress, or unchanged full regression merely to increase utilization.

Research must produce durable provenance, answer a named gap/question, state implementation/evaluation implications, and create a next-day handoff. A generic reading list is not an A-01 objective.

When the critical path becomes human-dependent, device-incompatible, unavailable, or otherwise non-automatable, use other safe second-shift work only when it has its own measurable completion delta. Otherwise leave that A-01 ticket unscheduled while the workstream's scheduled ChatGPT shift continues safe research/build/preparation work.

## Runner protection

All A-01 tickets pass through the canonical gateway runner guard. The gateway checks runner identity, minimum disk and available memory, required tools, and sleep-prevention capability before subject acquisition; long qualification execution prevents Windows system sleep; qualifier and outer job timeouts remain enforced; timed-out child process trees are forcibly terminated; preflight/postflight resource evidence is captured; stale A-01 temp cleanup is best effort; and unrelated later slots remain independent after a subject failure.

For runtime above 180 minutes, the registry must declare the qualifier checkpoint-capable and the ticket must provide `checkpoint_interval_minutes` no greater than 30.

The central workflow `.github/workflows/a01-overnight-night-shift.yml` is the only canonical A-01 overnight schedule. Do not add per-workstream overnight cron schedules. Scheduled ChatGPT research/build work operates separately and in parallel, but it must not dispatch A-01 independently or bypass the central scheduler.
