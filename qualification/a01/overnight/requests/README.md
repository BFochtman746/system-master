# A-01 Overnight Requests

Each workstream may submit at most one `READY` ticket for a given `night_date`.

Use a unique filename such as:

`2026-09-09--LEARNING--large-regression.json`

Do not edit another workstream's ticket. To withdraw your own ticket before the night shift, change its state to `HOLD` or `SUPERSEDED` in a forward commit.

A ticket is a request for A-01 executable work, not a request for an autonomous ChatGPT conversation. The referenced `qualification_id` must already be registered and explicitly marked overnight-eligible in `qualification/a01/registry.json`.

For runtime above 180 minutes, the registry must declare the qualifier checkpoint-capable and the ticket must provide `checkpoint_interval_minutes` no greater than 30.

The central workflow `.github/workflows/a01-overnight-night-shift.yml` is the only canonical overnight schedule. Do not add per-workstream overnight cron schedules.
