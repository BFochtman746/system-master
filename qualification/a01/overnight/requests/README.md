# A-01 Overnight Requests

Canonical second-shift authority: `qualification/a01/overnight/A01-SECOND-SHIFT-002.md`.

Each workstream may submit at most one `READY` ticket for a given `night_date`.

Use a unique filename such as:

`2026-09-09--LEARNING--large-regression.json`

Do not edit another workstream's ticket. To withdraw your own ticket before the night shift, change its state to `HOLD` or `SUPERSEDED` in a forward commit.

A ticket is a request for A-01 executable work, not a request for an autonomous ChatGPT conversation. The referenced `qualification_id` must already be registered and explicitly marked overnight-eligible in `qualification/a01/registry.json`.

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

When the critical path becomes human-dependent, device-incompatible, unavailable, or otherwise non-automatable, use other safe second-shift work only when it has its own measurable completion delta. Otherwise leave the workstream unscheduled.

## Runner protection

All A-01 tickets pass through the canonical gateway runner guard. The gateway checks runner identity, minimum disk and available memory, required tools, and sleep-prevention capability before subject acquisition; long qualification execution prevents Windows system sleep; qualifier and outer job timeouts remain enforced; timed-out child process trees are forcibly terminated; preflight/postflight resource evidence is captured; stale A-01 temp cleanup is best effort; and later slots remain independent after a subject failure.

For runtime above 180 minutes, the registry must declare the qualifier checkpoint-capable and the ticket must provide `checkpoint_interval_minutes` no greater than 30.

The central workflow `.github/workflows/a01-overnight-night-shift.yml` is the only canonical A-01 overnight schedule. Do not add per-workstream overnight cron schedules. Scheduled ChatGPT research/build work may operate separately and in parallel, but it must not dispatch A-01 independently or bypass the central scheduler.
