# P06 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P06 Control gateway dispatch and admission · **Effective** 2026-09-13  
**Authority** `governance/CURRENT-AUTHORITY.json` → `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

Two workflows plus a normalizer carry an A-01 qualification request from an external caller to the gateway.

- `a01-control-plane-dispatch-bridge.yml` — `workflow_dispatch` ingress, ten physical GitHub inputs, one fail-closed preflight job, one reusable-call route job.
- `a01-control-plane-gateway.yml` — the reusable gateway, `workflow_call` plus direct `workflow_dispatch`.
- `control-gateway/src/github-workflow-dispatch.js` — `normalizeA01Dispatch`, the programmatic path.

The frozen **logical packet contains fifteen fields**: `qualification_id`, `workstream_id`, `subject_sha` (exact lowercase sha40), `origin_ref`, `resume_on_pass`, `resume_on_failure`, `notification_target`, `execution_context`, `qualifier_timeout_minutes`, `job_timeout_minutes`, `not_before`, `not_after`, `repair_attempt`, `max_repair_attempts`, `repair_transaction_id`.

GitHub `workflow_dispatch` permits ten declared inputs, so the six advanced logical fields — `notification_target`, `qualifier_timeout_minutes`, `job_timeout_minutes`, `not_before`, `not_after`, `repair_transaction_id` — travel inside one validated `advanced_json` envelope. The other nine logical fields travel directly. The bridge must validate the complete fifteen-field logical packet before routing, and all fifteen must reach the reusable gateway unchanged in meaning.

## 2. Ingress routes

1. **`workflow_dispatch` on the bridge** — operator/App route. Admitting authority is the bridge preflight job.
2. **`workflow_call` into the gateway** from the bridge route job.
3. **Direct `workflow_dispatch` on the gateway** — recovery path that bypasses bridge preflight and is therefore weaker; it is not the habitual route.

Registered execution contexts are `normal`, `recovery`, `repair`, and `overnight`.

Not an ingress: `.github/scripts/github-adapter-workflow-dispatch.js` is referenced by nothing. The issue-triggered connector ingress it was written for does not exist.

## 3. Egress routes

- A reusable-workflow call carrying the typed fifteen-field logical packet.
- Evidence artifacts per qualification.
- Downstream `workflow_run` consumers: `a01-repair-receipt-ingest`, `a01-repair-rerun-adjudicate`.
- Preflight verdict on stdout: `A01_DISPATCH_BRIDGE_PREFLIGHT=PASS|FAIL code=… detail=…`.

## 4. Persistence and canonical writer

The gateway holds no durable state of its own. It emits evidence artifacts, and the repair ledger is written by the repair broker (P09), never here.

`repair_transaction_id` is the lineage key the broker reads. P06 carries it unmodified; minting, dropping, or reusing a transaction id here would fork the repair lineage.

Workflow permissions are `contents: read`, `actions: read`. No write path.

## 5. Dependencies

- **P07** A-01 admission barrier.
- **P08** qualification execution — the subject of the dispatch.
- **P09** repair broker — consumes `repair_transaction_id` and `repair_attempt`.
- GitHub Actions reusable-workflow mechanism.

Crosses no boundary rule; CORE-internal.

## 6. Failure semantics

**Fail closed at normalization/preflight, with a named code for every rejection.**

- `subject_sha` not exact lowercase sha40 → `DISPATCH_INPUT_INVALID`.
- `origin_ref` failing shape or containing traversal → `DISPATCH_INPUT_INVALID`.
- `execution_context` outside `normal | recovery | repair | overnight` → `DISPATCH_INPUT_INVALID`.
- Timeouts outside 1–360, or `job_timeout_minutes` not exceeding `qualifier_timeout_minutes` → `DISPATCH_BUDGET_INVALID`.
- `execution_context: overnight` without both window bounds, bounds not ISO-8601 with an explicit offset, or `not_before` not strictly before `not_after` → `DISPATCH_WINDOW_INVALID`.
- A window supplied outside `overnight` → `DISPATCH_WINDOW_INVALID`; supplied constraints are never silently ignored.
- `repair_attempt` above zero with no `repair_transaction_id` → `DISPATCH_LINEAGE_INVALID`.

The programmatic normalizer emits exactly ten physical GitHub inputs containing the complete fifteen-field logical packet. The bridge preflight validates that same logical shape before the reusable call.

No idempotency: each dispatch creates a genuinely new run. Correlation exists; deduplication does not. An accidental double-send produces two qualifications. **This is a known gap.**

## 7. Evidence target

Per-run Actions artifacts bound to exact Git subjects. Historical bridge runs remain provenance only; current completion requires the P06 Foundation qualification artifact for the exact current contract, normalizer, bridge, gateway, and acceptance-test blobs.

## 8. Acceptance target

```bash
cd control-gateway && node --test test/github-workflow-dispatch-passthrough.test.js
```

**PASS** when all 12 cases pass: two positive packet/passthrough cases and ten negative fail-closed cases covering input, traversal, execution context, budgets, overnight windows, and repair lineage. The qualification must also prove that both bridge and gateway contain the six advanced-field bindings and that current Crosswalk 003 owns P06 at `SYSTEM_MASTER/CORE` with implementation `.github/workflows/a01-control-plane-gateway.yml`.

## 9. Authority boundary

**Lane may decide alone (`agent`):** error-code detail strings, preflight step ordering, additional tests.

**Requires the owner (`owner`):** adding or removing a logical packet field; changing the `execution_context` allowlist; changing any bound; granting either workflow `contents: write`; removing bridge preflight; making direct gateway dispatch the primary route.

## 10. Open gaps

- **No idempotency key.** A retried dispatch creates a new run. Closing this needs a dedupe key on `(qualification_id, subject_sha, repair_transaction_id)` and belongs to a separately qualified change rather than being hidden inside P06 evidence admission.
