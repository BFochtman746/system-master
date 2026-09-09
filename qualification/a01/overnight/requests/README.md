# A-01 Overnight Requests

Each workstream may submit at most one `READY` ticket for a given `night_date`.

Use a unique filename such as:

`2026-09-09--LEARNING--large-regression.json`

Do not edit another workstream's ticket. To withdraw your own ticket before the night shift, change its state to `HOLD` or `SUPERSEDED` in a forward commit.

A ticket is a request for A-01 executable work, not a request for an autonomous ChatGPT conversation. The referenced `qualification_id` must already be registered and explicitly marked overnight-eligible in `qualification/a01/registry.json`.

## Completion-delta rule

Unused A-01 capacity is acceptable. A workstream MUST NOT submit or retain a `READY` ticket merely to occupy the runner.

Before a ticket is `READY`, the workstream must be able to state all four parts of a completion delta:

1. **Before** — the exact authoritative standing or blocker before the run.
2. **Evidence** — the unique evidence the overnight execution will produce.
3. **After PASS** — the authoritative standing that changes if the receipt is conforming.
4. **Unlocks** — the exact next dependency-valid objective made possible by that change.

A ticket with no material `after_pass` or `unlocks` transition is `HOLD` or `SUPERSEDED`, even when A-01 would otherwise be idle.

Recommended governance fields are `value_class`, `critical_path_rank`, `completion_delta`, and `stop_condition`. They are descriptive policy metadata; executable authority remains the registered qualification, exact subject SHA, admission window, canonical receipt and return route.

## Portfolio priority

Priority represents **critical-path reduction**, not perceived workstream importance or estimated runtime. Prefer, in order when evidence supports it:

1. exact-subject promotion or release gates that change canonical product standing;
2. bounded recovery gates that unblock a known product-critical qualification;
3. bounded reconciliation or diagnostic work that resolves a concrete decision;
4. research/regression work only when it directly feeds an already-defined capability gate.

Do not repeat a completed census, research sweep, stress campaign or unchanged full regression merely to increase utilization. Use changed-scope or failure-focused evidence first and reserve broad repeated campaigns for explicit periodic, promotion, reliability, or contamination-control gates.

When the critical path becomes human-dependent, device-incompatible, unavailable, or otherwise non-automatable, leave the workstream unscheduled instead of inventing substitute work.

For runtime above 180 minutes, the registry must declare the qualifier checkpoint-capable and the ticket must provide `checkpoint_interval_minutes` no greater than 30.

The central workflow `.github/workflows/a01-overnight-night-shift.yml` is the only canonical overnight schedule. Do not add per-workstream overnight cron schedules.
