# P06 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P06 Control gateway dispatch and admission · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-001.json`

## 1. Contract / interface

Two workflows plus a normalizer, carrying an A-01 qualification request from an external
caller to the gateway.

- `a01-control-plane-dispatch-bridge.yml` — `workflow_dispatch` ingress, 15 declared
  inputs, one preflight normalization job, one reusable-call route job.
- `a01-control-plane-gateway.yml` — the reusable gateway, `workflow_call` plus direct
  `workflow_dispatch`.
- `control-gateway/src/github-workflow-dispatch.js` — `normalizeA01Dispatch`, the
  programmatic path.

Frozen packet: `qualification_id`, `workstream_id`, `subject_sha` (exact lowercase
sha40), `origin_ref`, `resume_on_pass`, `resume_on_failure`, `notification_target`,
`execution_context`, `qualifier_timeout_minutes`, `job_timeout_minutes`, `not_before`,
`not_after`, `repair_attempt`, `max_repair_attempts`, `repair_transaction_id`.

All fifteen are forwarded. Three of them — `not_before`, `not_after`,
`repair_transaction_id` — were declared and silently dropped until 2026-09-13; the drop
forked the repair ledger and ran overnight work with no admission window.

## 2. Ingress routes

1. **`workflow_dispatch` on the bridge** — the operator and App route. Admitting authority
   is the bridge preflight job.
2. **`workflow_call` into the gateway** from the bridge's route job.
3. **Direct `workflow_dispatch` on the gateway** — bypasses the bridge preflight. Present
   for recovery; it is the weaker path and should not be the habitual one.

Not an ingress: `.github/scripts/github-adapter-workflow-dispatch.js` is referenced by
nothing. The issue-triggered connector ingress it was written for does not exist.

## 3. Egress routes

- A reusable-workflow call carrying the typed packet.
- Evidence artifacts per qualification.
- Downstream `workflow_run` consumers: `a01-repair-receipt-ingest`,
  `a01-repair-rerun-adjudicate`.
- Preflight verdict on stdout: `A01_DISPATCH_BRIDGE_PREFLIGHT=PASS|FAIL code=… detail=…`.

## 4. Persistence and canonical writer

The gateway holds no durable state of its own. It emits evidence artifacts, and the
repair ledger is written by the repair broker (P09), never here.

`repair_transaction_id` is the lineage key the broker reads. The gateway's obligation is
to carry it unmodified; minting or reusing a transaction id here would fork the ledger,
which is exactly what the dropped-field defect did.

Workflow permissions are `contents: read`, `actions: read`. No write path.

## 5. Dependencies

- **P07** A-01 admission barrier.
- **P08** qualification execution — the subject of the dispatch.
- **P09** repair broker — consumes `repair_transaction_id` and `repair_attempt`.
- GitHub Actions reusable-workflow mechanism.

Crosses no boundary rule; CORE-internal.

## 6. Failure semantics

**Fail-closed at the preflight, with a named code for every rejection.**

- `subject_sha` not exact lowercase sha40 → `DISPATCH_INPUT_INVALID`.
- `origin_ref` failing shape or containing traversal → `DISPATCH_INPUT_INVALID`.
- `execution_context` outside `normal | recovery | repair | overnight` →
  `DISPATCH_INPUT_INVALID`.
- Timeouts outside 1–360, or `job_timeout_minutes` not exceeding
  `qualifier_timeout_minutes` → `DISPATCH_BUDGET_INVALID`. The outer budget must leave
  room for evidence capture.
- `execution_context: overnight` without both window bounds, bounds not ISO-8601 with an
  explicit offset, or `not_before` not strictly before `not_after` →
  `DISPATCH_WINDOW_INVALID`.
- A window supplied outside `overnight` → rejected rather than ignored. Silently dropping
  a supplied constraint is the defect class this whole section exists to close.
- `repair_attempt` above zero with no `repair_transaction_id` → `DISPATCH_LINEAGE_INVALID`.

Normalization happens once, in the preflight, which emits typed outputs the route job
consumes. Fifteen flat inputs are the fragile shape; the single-JSON-packet pattern used
by P04 is the better one and is the recommended direction.

No idempotency: each dispatch creates a genuinely new run. Correlation exists; deduplication
does not. An accidental double-send produces two qualifications. **This is a known gap.**

## 7. Evidence target

Per-run Actions artifacts. Live proof: `A-01 Control Plane Dispatch Bridge #4`,
2026-09-13, Success, qualification `BOOK-SYSTEM-E2E-AUTHORITY-GUARDS-001`, evidence
6.48 KB plus a 667-byte admission record.

## 8. Acceptance target

```
cd control-gateway && node --test test/github-workflow-dispatch-passthrough.test.js
```

**PASS** when all 12 cases pass: every registered field survives normalization, the
overnight window and repair transaction id are carried, and eight negative cases fail
closed. Runs in the `control-gateway-suite` CI job.

Workflow-level acceptance is a green bridge run whose gateway job reports the qualification
id it was given.

## 9. Authority boundary

**Lane may decide alone (`agent`):** error code detail strings, preflight step ordering,
additional tests.

**Requires the owner (`owner`):** adding or removing a packet field; changing the
`execution_context` allowlist; changing any bound; granting either workflow `contents:
write`; removing the bridge preflight; making the direct gateway dispatch the primary path.

## 10. Open gaps

Two, both recorded rather than resolved.

- **No idempotency key.** A retried dispatch creates a new run. Closing this needs a
  dedupe key on `(qualification_id, subject_sha, repair_transaction_id)`.
**Withdrawn: the 23-second qualification.** I previously flagged Bridge run #4 finishing
its qualification job in 23 seconds against a declared 28-minute budget as possibly meaning
nothing ran. That was wrong, and `qualification/a01/a01-policy.json` settles it: admission
mode is `TRUSTED_SELF_HOSTED_METADATA_ONLY_FOR_NONDISRUPTIVE`, and
`BOOK-SYSTEM-E2E-AUTHORITY-GUARDS-001` is registered `gate_class: focused`,
`overnight_eligible: false`, `source: subject`, running one in-process guard script. A
focused guard check completing in 23 seconds is correct; `qualifier_timeout_minutes` is a
ceiling, not an expectation. I read a budget as a duration. See P08 §10.
