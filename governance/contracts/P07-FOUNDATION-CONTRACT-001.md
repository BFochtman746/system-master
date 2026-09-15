# P07 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P07 A-01 admission barrier · **Effective** 2026-09-15  
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

`.github/scripts/a01-admission-barrier.js` decides whether a qualification request may proceed to subject checkout or subject execution. It is the fail-closed boundary between "a request arrived" and "the governed subject may be touched."

Commands: default `evaluate`, `evaluate-remote`, `selftest`, `integration-selftest`.

The barrier emits `admission_version: 2` with `admitted`, `admission_state`, `detail`, `fresh_dispatch_required`, control-plane SHA, subject SHA, policy version, registry version, execution context, timeout and repair lineage metadata.

The execution-context allowlist is exactly:

- `normal`
- `recovery`
- `repair`
- `overnight`

`recovery` and `repair` are first-class admitted contexts after all ordinary admission checks pass. `overnight` is recognized as a valid context and then remains subject to the stricter overnight eligibility, runtime and disruptive-post-action rules.

## 2. Ingress routes

The barrier is invoked by the A-01 gateway before subject checkout and is configured through environment values including:

- `A01_ADMISSION_CONTROL_ROOT`
- `A01_ADMISSION_SUBJECT_ROOT`
- `A01_QUALIFICATION_ID`
- `A01_WORKSTREAM_ID`
- `A01_SUBJECT_SHA`
- `A01_CONTROL_PLANE_SHA`
- `A01_EXECUTION_CONTEXT`
- `A01_QUALIFIER_TIMEOUT_MINUTES`
- `A01_REPAIR_TRANSACTION_ID`
- `A01_ADMISSION_EVIDENCE`

The policy ordering remains non-negotiable: `pre_admission_subject_checkout_forbidden` and `pre_admission_subject_execution_forbidden` are true, and `trusted_metadata_barrier_required_before_subject_checkout` is true. Pre-admission work is metadata-only.

## 3. Egress routes

GitHub Actions outputs include `admitted`, `admission_state`, `control_plane_sha`, `registry_version`, and `policy_version`.

The barrier writes a machine-readable admission evidence JSON to `A01_ADMISSION_EVIDENCE` when configured and emits one `A01_ADMISSION=<state> admitted=<bool> ...` stdout line. Every refusal emits `A01_FRESH_DISPATCH_REQUIRED=1`.

A refusal always demands a fresh dispatch rather than an in-place re-decision. Registry, policy or control-plane state changes therefore cannot retroactively authorize a run whose inputs were already read.

## 4. Persistence and canonical writer

The barrier holds no durable mutable state. It reads:

- `qualification/a01/a01-policy.json`
- `qualification/a01/registry.json`

from the control-plane checkout and writes only its own per-run evidence file.

The registry remains the canonical record of what may run. The barrier never registers work and never synthesizes execution authority.

## 5. Dependencies

- **P00–P02** current governance state; **P01** for control-plane identity.
- `qualification/a01/a01-policy.json` policy version 8.
- `qualification/a01/registry.json` current registration authority.
- Git for exact checkout identity.
- **P06** dispatch/gateway supplies the governed envelope and calls P07.
- **P08** qualification execution may begin only after P07 admits.
- **P09** owns durable repair-lineage semantics; P07 only preserves and records the repair transaction metadata supplied through P06.

## 6. Failure semantics

**Fail-closed.** No refusal path authorizes subject checkout or subject execution.

The barrier refuses, among other cases:

- control-plane checkout SHA differs from the exact expected SHA;
- subject SHA is malformed or subject checkout identity differs from the exact requested SHA;
- policy identity/canonical ref is invalid;
- qualification is absent from the registry;
- workstream differs from the registered workstream;
- registered wrapper path is unsafe;
- registered wrapper source is outside `subject | control_plane`;
- execution context is outside `normal | recovery | repair | overnight`;
- timeout is invalid or above policy maximum;
- overnight qualification is not registered as overnight-eligible;
- overnight timeout exceeds the registry maximum;
- overnight qualification has disruptive post-actions;
- control-plane or subject metadata cannot be read safely;
- registered executable metadata is missing.

`safeWrapper` remains unchanged: the wrapper must begin `.github/scripts/`, contain no `..`, and not be absolute. `allow_arbitrary_command_input` remains false and `require_registered_qualification` remains true.

## 7. Evidence target

A current-authority exact-subject P07 receipt must bind at minimum:

- `governance/CURRENT-AUTHORITY.json`;
- the authority-selected Crosswalk, Registry, Topology and owner allocation;
- this P07 contract;
- `.github/scripts/a01-admission-barrier.js`;
- `qualification/a01/a01-policy.json`;
- `qualification/a01/registry.json`;
- the gateway/admission wiring relied upon by P07;
- the P07 qualification workflow itself.

The receipt must be preserved as an immutable GitHub Actions artifact and must include the exact Git blob SHA of every subject.

## 8. Acceptance target

Run:

```text
node .github/scripts/a01-admission-barrier.js selftest
node .github/scripts/a01-admission-barrier.js integration-selftest
```

PASS requires:

- `A01_ADMISSION_BARRIER_SELFTEST=PASS contexts=4`;
- unregistered work is refused with `WAITING_FOR_REGISTRATION` and fresh-dispatch required;
- a registered qualification is admitted in `normal`, `recovery`, and `repair` contexts with exact subject/control-plane SHA binding;
- an unknown execution context is refused with `INVALID_EXECUTION_CONTEXT` and fresh-dispatch required;
- `overnight` is recognized as a valid context and reaches overnight-specific policy checks rather than being rejected as an invalid context;
- integration output ends with `A01_ADMISSION_BARRIER_INTEGRATION_SELFTEST=PASS blocked_unregistered=1 admitted_registered=3 invalid_context_blocked=1 overnight_policy_blocked=1`.

The repository-wide required verification, A-01 enforcement, state reconciliation and lease enforcement must also pass on the exact merge candidate.

## 9. Authority boundary

**Lane may decide alone (`agent`):** detail-string wording and additional fail-closed selftest coverage.

**Requires the owner (`owner`):** changing the execution-context allowlist; adding/removing an admission state; relaxing `safeWrapper`; permitting arbitrary command input; allowing disruptive post-actions overnight; removing exact control-plane SHA equality; or setting `require_registered_qualification` false.

Owner decision for this P07 closure packet: align P07 with the already-admitted P06 envelope by extending the barrier execution-context allowlist from `normal | overnight` to `normal | recovery | repair | overnight`. No other admission control is relaxed.

## 10. Open gaps

The previously recorded execution-context mismatch is resolved by this packet. `recovery` and `repair` are no longer late-failure contexts at P07, while `overnight` retains its stricter eligibility/runtime/disruption checks.

No remaining P07-specific contract gap is known after successful exact-subject qualification. Repair transaction lifecycle semantics remain owned by P09 and qualification execution/PASS semantics remain owned by P08; P07 does not absorb either responsibility.
