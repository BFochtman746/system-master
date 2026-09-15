# Claim queue

Each **file in this directory is one claim** for the unattended driver:

- the **file name** is the claim id
- the **first non-blank line** is the payload digest

That is the whole format. It is a directory of files rather than a single JSON queue so two
sessions adding work cannot collide on the same line of the same file — a merge conflict
between two claims is a thing this repository has enough of already.

Dotfiles and `*.md` are ignored, so this README is documentation rather than a claim called
`README.md`. Anything else in here is work.

An entry with no non-blank line is reported as `queue-entry-invalid` and forces a non-zero
exit for the run. It does not abort the other claims: one malformed file must not starve
the queue, and must not pass unnoticed either.

## What runs it

`.github/workflows/claim-driver.yml`, hourly overnight and on manual dispatch. It invokes
`ClaimDriverMain`, which drives `ClaimLedger.Consumer.tick()` inside an iteration ceiling
and a wall-clock ceiling, then prints a run summary to the job log and the run summary page.

## Deliberately not under governance/

`governance/**` paths are governed by the lease-receipt audit. A work queue is operational
state, not an authority record, so it lives here and no lease receipt is required to add a
claim.

## Known limit — read before relying on this

The ledger is **in-memory**, so a claim's lifecycle completes within a single run.
Receipts are printed and published to the run summary; they are not committed back to the
repository. A claim abandoned by a crashed consumer is recovered *inside* a run, not across
runs. Persisting the ledger between runs is the next piece of work, and until it exists,
a claim that outlives its run is simply gone rather than resumed.
