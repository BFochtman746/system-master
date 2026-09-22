# P08 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P08 Qualification execution and PASS semantics · **Effective** 2026-09-15  
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

P08 is the canonical execution and result-semantics layer behind admitted A-01 qualification. Its implementation is `.github/scripts/a01-control-plane.js`.

A qualification executes a **registered** wrapper against an **exact** subject SHA on the A-01 self-hosted runner and emits exactly one of four result classes:

- `PASS`
- `SUBJECT_FAILURE`
- `INFRA_FAILURE`
- `CONTROL_PLANE_FAILURE`

The execution context is one of `normal`, `recovery`, `repair`, or `overnight`. P08 must accept the same four contexts admitted by P06/P07; overnight additionally applies the stricter registry and time-window rules.

Governance comes from `qualification/a01/a01-policy.json` and `qualification/a01/registry.json`. The runner identity remains `A-01` with labels `self-hosted, Windows, X64`; the global execution concurrency namespace remains `a01-global-r2` with `cancel-in-progress: false`. Policy queue semantics are separate from GitHub workflow syntax and must not be represented by an unsupported `queue:` workflow key.

Three gate classes exist, and only one carries promotion authority:

| Class | Purpose | Promotion authority |
|---|---|---|
| `focused` | changed capability plus immediate integration dependencies | **no** |
| `consolidated` | accumulated slice plus broader regressions | **no** |
| `promotion` | exact promotion subject and required regressions | **yes** |

A `focused` or `consolidated` PASS is evidence about its exact subject only. A promotion result is authorized only when the registered gate class has `promotion_authority: true` and the exact subject checkout equals the requested subject SHA.

## 2. Ingress routes

The canonical route is:

**P06 gateway → P07 trusted metadata admission → exact subject checkout → P08 registered wrapper execution.**

No arbitrary command input is accepted. A subject may not be checked out or executed before successful admission. The trusted control-plane checkout and the qualification subject are independently identity-bound: on pull requests the trusted reusable workflow may execute from the PR merge SHA while the qualified subject remains the PR head SHA. Those two identities must be verified, not conflated.

## 3. Egress routes

P08 emits:

- `result_class`;
- `promotion_authorized`;
- `receipt.json` and `result.txt`;
- timing, runner preflight/postflight, stdout/stderr and supporting evidence;
- the registered evidence artifact;
- a return ticket carrying the exact subject SHA and continuation instructions.

Ordinary non-PASS subject results may be consumed by P09 repair routing. Infrastructure/control-plane failures must not be misrouted as subject repair.

## 4. Persistence and canonical writer

Qualification writes evidence, never governance authority.

`qualification/a01/registry.json` is the canonical allowlist for qualification wrappers. A qualification cannot register itself. `require_registered_qualification: true` and `allow_arbitrary_command_input: false` remain fail-closed invariants.

Wrapper source is declared by registry entry:

- `control_plane` — wrapper is supplied by the trusted control-plane checkout;
- `subject` — wrapper is supplied by the exact subject checkout.

Both wrapper paths are validated before execution.

## 5. Dependencies

- **P06** control gateway transport.
- **P07** admission barrier.
- **P03** evidence retention.
- **P04** content-addressed authority writes where a qualified workflow later publishes authority.
- **P09** repair broker for subject failures.
- A healthy A-01 self-hosted runner.

## 6. Failure semantics

P08 is **fail-closed and classifies failures rather than collapsing them into generic failure**.

- Registered child exit `0` → `PASS`.
- Registered child non-zero exit → `SUBJECT_FAILURE`.
- Child spawn/runtime infrastructure error → `INFRA_FAILURE`.
- Control-plane/identity/contract failure before a valid subject result exists → `CONTROL_PLANE_FAILURE`.
- Qualifier timeout → `SUBJECT_FAILURE` with explicit runtime-budget reason.
- Runner unavailable → `WAITING_FOR_RUNNER`, not a subject failure.
- Subject checkout SHA mismatch or trusted control-plane SHA mismatch fails closed.
- Promotion authorization is true only for an exact-subject `PASS` from a gate class whose policy grants promotion authority.

Runner health guards require minimum free disk and memory, node/git availability, sleep prevention during qualification, and recorded preflight/postflight evidence.

## 7. Evidence target

The current closure procedure is `.github/workflows/p08-qualification-pass-semantics-foundation-qualification.yml`.

It must prove, on the same exact qualification subject:

1. the policy exposes exactly the four P08 result classes;
2. P06/P07/P08 agree on the four execution contexts;
3. PASS, failure-classification and promotion-authority bindings are present;
4. `A01-CONTROL-PLANE-SELFTEST` is a registered `promotion` qualification;
5. trusted metadata admission returns `ADMITTED` before subject checkout;
6. A-01 checks out the exact requested subject SHA;
7. the registered qualification returns `PASS` with child exit `0`;
8. the receipt reports `promotion_authorized: true` for that exact subject;
9. the trusted control-plane SHA is independently bound to the workflow execution SHA;
10. the authoritative A-01 evidence artifact uploads successfully.

Hosted prequalification is necessary but not sufficient. Foundation completion requires the live A-01 portion and registration of its immutable run/artifact identity in `governance/census/FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json`.

## 8. Acceptance target

Canonical P08 qualification:

```text
.github/workflows/p08-qualification-pass-semantics-foundation-qualification.yml
```

Acceptance is **PASS** only when the complete workflow succeeds and its live A-01 receipt proves:

```text
admission_state = ADMITTED
result_class = PASS
child_exit_code = 0
promotion_authorized = true
checkout_sha = subject_sha = requested exact subject SHA
control_plane_checkout_sha = control_plane_sha = trusted workflow SHA
```

A hosted-only result cannot close P08.

## 9. Authority boundary

**Lane may decide alone (`agent`):** evidence formatting and wrapper internals for a qualification the lane owns, provided result semantics and authority are unchanged.

**Requires the owner (`owner`):** registering/deregistering a qualification; changing a `gate_class`; granting or removing promotion authority; changing result classes; changing runner identity/labels, health thresholds or concurrency; changing overnight eligibility; adding disruptive post-actions; relaxing admission or exact-SHA identity checks.

Granting promotion authority remains the highest-consequence registry edit because it changes whether a PASS may authorize promotion rather than merely record evidence about one exact subject.

## 10. Open gaps

P08 has a live exact-SHA proof procedure. Its Foundation closure condition is therefore evidence-registration, not missing implementation.

Queued-but-unstarted operator visibility remains a **P15 observability concern**. It does not change P08 result semantics and must not be used to classify an unstarted request as a subject failure.

### Current-subject evidence refresh rule

When any blob bound by the current P08 Foundation evidence receipt changes, the prior P08 PASS remains historical evidence only. Current Foundation closure requires the canonical P08 workflow to succeed again on an exact descendant subject that contains the current bound blobs, including a live A-01 receipt proving `ADMITTED`, `PASS`, exact subject checkout, and `promotion_authorized: true`. The evidence registry may be refreshed only after that exact-subject run succeeds; no historical PASS may be transferred across changed P08 subjects.
