# Cleanup backlog — take the top unchecked item, verify, tick it, commit

Rules: one item per run. Nothing ships without its check passing. Floors never go
down. Anything that moves or deletes must be reversible (tag, archive folder, or
git history). When every box is ticked, the cleanup is done — stop.

## Done 2026-09-25
- [x] Rebuild map `REPO-MAP.md`.
- [x] Branch manifest `cleanup/BRANCH-MANIFEST-2026-09-25.tsv` + restore script.
- [x] Branch cleanup (see manifest classes).
- [x] C11 fix: `response-expectation-engine-qualify.js` parses C04 JSON from stdout only. Passes; mutant (merged stdout+stderr) fails with `C11_C04_QUALIFIER_OUTPUT_INVALID` under a typeless package.json.
- [x] Ratchet: `A01-REPAIR-BROKER-001.md` baseline 1 -> 0 (measured 0), total 99 -> 98. Ratchet PASS.

## Sorting (script job, no model needed)
- [ ] S1 Move superseded `WORK-OBLIGATION-REGISTRY-0xx.json` (all but the one in CURRENT-AUTHORITY) to `governance/archive/superseded/`, updating every reference in the same commit; ratchet must stay PASS.
- [ ] S2 Same for `EXPECTATION-REGISTRY`, `SYSTEM-STATE-BASELINE`, `REALLOCATION-LEDGER`, `SYSTEM-TOPOLOGY`, `SYSTEM-COMPLETION-STATUS`, `COMPLETION-LEDGER`.
- [ ] S3 Mark `BRANCH-INVENTORY.md` superseded (point to the manifest).
- [ ] S4 Thin `.github/workflows` (77): list each workflow's last run date; retire ones not run in 14 days into the retirement JSON.
- [ ] S5 Review small stubs: `learning/`, `docs/`, `transport/`, `execution/`.

## Untested code (ranked for the rebuild)
Need tests (no selftest/qualify references them):
- [ ] T1 `control-gateway/python/a01_supervisor_coordination_strict.py` (runner coordination — highest)
- [ ] T2 `assurance-standards-check.js` (the nightly standards gate)
- [ ] T3 `validate-system-topology.js`, `system-catalog-enforce.js`, `current-obligation-registry-enforce.js`
- [ ] T4 `system-file-lease-enforce.js`, `program-job-lock-enforce.js`, `programming-work-program-enforce.js`
- [ ] T5 `a01-repair-ledger-reconcile.js`, `a01-repair-inbox-update.js`, `github-adapter-workflow-dispatch.js`
- [ ] T6 `foundation-closure-matrix.js`, `foundation-closure-matrix-committed-check.js`, `foundation-closure-evidence-verify.js`, `fwp001-seal-audit.js`, `fwp002-rebuild.js`
- [ ] T7 `control-gateway-production-enforcement-audit.js`, `control-gateway-production-r01-live-proof.js`, `second-shift-owner-coverage.js`, `second-shift-eight-lane-qualification.py`
- [ ] T8 One-time/legacy (likely retire, not test): `a01-repair-001c-live-proof-prepare.js`, `a01-system-master-knowledge-recovery-001.js`, `system-master-knowledge-recovery-current-enforce.js`, `scaffold-foundation-contracts.js`, `lane-brief.js`, `validate-system-control-branch.js`

## A-01 local loop targets (small pure functions only, 120B)
Queue in `a01-coder/targets.txt` only when a defect is precisely described and has an oracle test. Writing tests (T-items) is not a fit for the loop; it is assistant/script work.
