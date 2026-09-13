# P08 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P08 Qualification execution and PASS semantics · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-002.json`

## 1. Contract / interface

Qualification executes a **registered** wrapper against an **exact** subject SHA on the
A-01 self-hosted runner, and emits one of four result classes: `PASS`, `SUBJECT_FAILURE`,
`INFRA_FAILURE`, `CONTROL_PLANE_FAILURE`.

Governed by `qualification/a01/a01-policy.json` (policy_version 8, control plane
`A01-CONTROL-PLANE-001`, canonical ref `main`) and `registry.json`. Runner requires labels
`self-hosted, Windows, X64`, concurrency group `a01-global-r2`, queue capacity 100.

Three gate classes, and only one carries promotion authority:

| Class | Purpose | Promotion authority |
|---|---|---|
| `focused` | changed capability plus immediate integration dependencies | **no** |
| `consolidated` | accumulated slice plus broader regressions | **no** |
| `promotion` | exact promotion subject and required regressions | **yes** |

A `focused` PASS is evidence about one subject SHA. It is not a statement that anything is
complete, and the registry makes each qualification say so in its own description.

## 2. Ingress routes

One admitted route: **P06** gateway → **P07** admission barrier → subject checkout →
registered wrapper. Nothing else may execute a subject.

Policy makes the ordering structural: `pre_admission_subject_checkout_forbidden`,
`pre_admission_subject_execution_forbidden`, and
`trusted_metadata_barrier_required_before_subject_checkout` are all true. Blocked requests
may acquire a trusted admission runner but `blocked_requests_must_not_checkout_or_execute_subject`.

`max_outstanding_per_workstream: 4`.

## 3. Egress routes

- A result class and a receipt, per the policy `receipt` and `return_ticket` sections.
- Evidence artifacts named by the registry's `evidence_artifact`.
- A return ticket to `origin_ref` for the workstream.
- Downstream `workflow_run` consumers: repair receipt ingest and rerun adjudication (P09).

## 4. Persistence and canonical writer

Qualification writes evidence, never governance. It holds no authority state.

`registry.json` is the canonical record of what may be qualified and is written only by a
human through a reviewed pull request. A qualification cannot register itself, which is
what `require_registered_qualification: true` and `allow_arbitrary_command_input: false`
mean in practice.

Where the wrapper lives is declared by `source`: `control_plane` means it ships on `main`;
`subject` means it ships on the subject ref. Both are validated for path safety by P07
before checkout.

## 5. Dependencies

- **P07** admission — nothing runs unadmitted.
- **P06** gateway — the transport.
- **P04** authority writes — for qualifications that publish.
- **P09** repair broker — consumes failures.
- **P03** retention — governs the evidence produced.
- The A-01 self-hosted runner.

## 6. Failure semantics

**Fail-closed, with failure *classified* rather than merely reported.**

The four result classes exist so a failure routes correctly: `SUBJECT_FAILURE` is the
subject's problem and goes to repair; `INFRA_FAILURE` and `CONTROL_PLANE_FAILURE` are not
the subject's fault and must never consume a repair attempt. Collapsing these into
"failed" is how a healthy subject gets repaired for an infrastructure fault.

- Runner unavailable → `WAITING_FOR_RUNNER`, not a failure. Queue expiry 24 hours,
  requeue 60 seconds.
- Runner health guards — minimum 10 GB free disk, 4 GB available memory, node and git
  present — with `fail_closed_on_identity_or_resource_guard: true`.
- Sleep prevented during qualification; preflight and postflight recorded.
- Disruptive qualifications fail closed without hosted admission;
  `non_disruptive_only_without_hosted_runner: true`.
- Stale requests handled by the policy's `stale_request_policy` rather than by silent
  re-execution.

## 7. Evidence target

Per-qualification evidence artifacts named in the registry, plus the receipt and return
ticket. Live proof: Bridge run #4, `BOOK-SYSTEM-E2E-AUTHORITY-GUARDS-001`, 6.48 KB
evidence plus a 667-byte admission record.

## 8. Acceptance target

```
node .github/scripts/a01-control-plane-enforce.js selftest
node .github/scripts/a01-control-plane-enforce.js scan
node .github/scripts/a01-admission-barrier.js selftest
```

**PASS** when all three pass in the `enforce` CI job: the scan rejects ungoverned executor
and scheduling paths, and admission self-tests green.

**Weak, and named as weak.** These prove the *governance* of qualification, not
qualification execution itself. Proving execution needs a live registered run against a
known subject SHA with an asserted result class, and that cannot run in hosted CI because
it requires the A-01 runner. A recorded live-proof procedure is the honest closure here,
and it does not exist yet.

## 9. Authority boundary

**Lane may decide alone (`agent`):** evidence formatting, wrapper internals for a
qualification the lane owns.

**Requires the owner (`owner`):** registering or deregistering a qualification; changing a
`gate_class`, especially granting `promotion`; setting `overnight_eligible`; adding
`allowed_post_actions`; changing runner labels, health thresholds or concurrency; relaxing
any admission ordering flag; changing the result classes.

Granting `promotion_authority` is the single highest-consequence registry edit: it is what
lets a PASS mean more than evidence about one SHA.

## 10. Open gaps

- **No live-proof procedure.** Execution semantics are unproven by anything automated.
  Needs a documented runbook plus a recorded run, since CI cannot reach the runner.
- **`WAITING_FOR_RUNNER` is silent to the operator.** A request can sit for 24 hours and
  expire; the P15 receipt does not yet surface queued-but-unstarted requests.

**Correcting an earlier finding of mine.** In the P06 contract I flagged Bridge run #4's
23-second qualification against a 28-minute budget as possibly meaning nothing ran. That
was wrong, and the policy says why: admission mode is
`TRUSTED_SELF_HOSTED_METADATA_ONLY_FOR_NONDISRUPTIVE`, and the registration for that
qualification is `gate_class: focused`, `overnight_eligible: false`, `source: subject`,
running a single in-process guard script. A focused guard check completing in 23 seconds is
correct behaviour; `qualifier_timeout_minutes` is a ceiling, not an expectation. I had read
a budget as a duration.

The registration's own wording is the right reading of that run: *"PASS is exact-SHA
focused evidence only"*, granting no lifecycle, publication, promotion or production
authority. So the run was valid, and it was never a Books completion — exactly as
registered.
