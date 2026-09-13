# P07 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P07 A-01 admission barrier · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-002.json`

## 1. Contract / interface

`.github/scripts/a01-admission-barrier.js` (281 lines) decides whether a qualification
request may proceed to subject checkout. It is the gate between "a request arrived" and
"the subject is touched."

Commands: default evaluate, `remote`, `selftest`, `integration-selftest`.
Emits `admission_version: 2` with `admitted`, `admission_state`, `detail`,
`fresh_dispatch_required`, plus control-plane sha, policy version and registry version.

Fifteen refusal states, each named: `WAITING_FOR_REGISTRATION`,
`CONTROL_PLANE_CHECKOUT_MISMATCH`, `WORKSTREAM_MISMATCH`, `INVALID_SUBJECT_SHA`,
`INVALID_CONTROL_PLANE_POLICY`, `INVALID_REGISTRY`, `INVALID_REGISTERED_WRAPPER_PATH`,
`INVALID_REGISTERED_WRAPPER_SOURCE`, `INVALID_EXECUTION_CONTEXT`,
`INVALID_QUALIFIER_TIMEOUT`, `QUALIFICATION_NOT_OVERNIGHT_ELIGIBLE`,
`QUALIFIER_TIMEOUT_EXCEEDS_REGISTRY`, `DISRUPTIVE_QUALIFICATION_NOT_ALLOWED_OVERNIGHT`,
`CONTROL_PLANE_READ_FAILURE`, and admitted.

## 2. Ingress routes

Invoked by the gateway before subject checkout, configured entirely through environment:
`A01_ADMISSION_CONTROL_ROOT`, `A01_ADMISSION_SUBJECT_ROOT`, `A01_ADMISSION_EVIDENCE`.
Also `selftest` from the `enforce` CI job.

Policy makes the ordering non-negotiable: `pre_admission_subject_checkout_forbidden` and
`pre_admission_subject_execution_forbidden` are both true, and
`trusted_metadata_barrier_required_before_subject_checkout` is true. The barrier sees only
metadata until it admits.

## 3. Egress routes

- GitHub Actions outputs: `admitted`, `admission_state`, `control_plane_sha`,
  `registry_version`, `policy_version`.
- An evidence JSON at `A01_ADMISSION_EVIDENCE` (667 bytes on Bridge run #4).
- A single stdout line `A01_ADMISSION=<state> admitted=<bool> …`, plus
  `A01_FRESH_DISPATCH_REQUIRED=1` on any refusal.

Refusal always demands a *fresh dispatch* rather than a retry in place: registration and
control-plane state must be resolved in a new run, so an admission can never be re-decided
inside a run whose inputs have already been read.

## 4. Persistence and canonical writer

Holds no durable state. It reads `qualification/a01/a01-policy.json` and
`qualification/a01/registry.json` from the control-plane checkout, and writes only its own
evidence file, which the caller names.

The registry is the canonical record of what may run; its writer is a human through a
reviewed pull request. The barrier never registers anything, which is what makes
`require_registered_qualification: true` meaningful.

## 5. Dependencies

- **P00–P02** governance state; **P01** for control-plane identity.
- `qualification/a01/a01-policy.json` (policy_version 8) and `registry.json`.
- Git, for `gitHead(controlRoot)`.
- **P06** gateway invokes it; **P08** executes only after it admits.

## 6. Failure semantics

**Fail-closed, and it is the strictest gate in the estate.**

- Control-plane checkout sha not exactly equal to expected → refused. Not a prefix match,
  not a range: exact, case-normalised.
- Policy not `A01-CONTROL-PLANE-001` on `canonical_ref: main` → refused.
- Qualification id absent from the registry → `WAITING_FOR_REGISTRATION`. Unregistered
  work cannot run, by design.
- Registered wrapper path failing `safeWrapper` — must start `.github/scripts/`, contain
  no `..`, and not be absolute → refused. This is the arbitrary-command guard, and
  `allow_arbitrary_command_input: false` is the policy behind it.
- Wrapper `source` outside `subject | control_plane` → refused.
- Timeout not a positive integer within `policy.runtime.max_qualifier_timeout_minutes` →
  refused.
- Overnight: not `overnight_eligible` → refused; timeout above the registry's
  `overnight_max_runtime_minutes` → refused; any non-empty `allowed_post_actions` →
  refused as disruptive. Unattended work may not take post-actions.
- Any read failure → `CONTROL_PLANE_READ_FAILURE`, refused.

Every refusal is idempotent and side-effect free: nothing is checked out, nothing runs.

## 7. Evidence target

The admission evidence JSON per run, carrying the state, both versions, the control-plane
sha and the subject sha. Retained as an Actions artifact. Live proof: Bridge run #4
emitted a 667-byte `a01-admission` artifact.

## 8. Acceptance target

```
node .github/scripts/a01-admission-barrier.js selftest
node .github/scripts/a01-admission-barrier.js integration-selftest
```

**PASS** when `selftest` prints `A01_ADMISSION_BARRIER_SELFTEST=PASS` and
`integration-selftest` prints
`A01_ADMISSION_BARRIER_INTEGRATION_SELFTEST=PASS blocked_unregistered=1 admitted_registered=1`.
The integration selftest spawns real child processes against a temp control root, so it
proves the refusal and admission paths end to end rather than in unit isolation.

`selftest` runs in the `enforce` CI job.

## 9. Authority boundary

**Lane may decide alone (`agent`):** detail-string wording, additional selftest cases.

**Requires the owner (`owner`):** adding an admission state; relaxing `safeWrapper`;
permitting arbitrary command input; allowing post-actions overnight; removing the exact
control-plane sha equality; setting `require_registered_qualification` false.

Relaxing `safeWrapper` or the registration requirement converts this barrier into a remote
code execution path. There is no partial version of that change.

## 10. Open gaps

One real defect, found while writing this contract.

**Execution-context allowlists disagree across three layers.** The barrier accepts
`normal | overnight` only. The dispatch bridge and `normalizeA01Dispatch` both accept
`normal | recovery | repair | overnight`. A dispatch with `execution_context: recovery` or
`repair` passes the bridge and is then refused at the barrier with
`INVALID_EXECUTION_CONTEXT` — a late failure that consumes a run and produces a confusing
result.

Resolution is an `owner` decision, because either answer is defensible: extend the barrier
to four contexts, or narrow the bridge to two. My recommendation is to extend the barrier,
since the repair broker (P09) has genuine use for a distinct `repair` context. Until it is
decided, treat `recovery` and `repair` as unusable in practice.
