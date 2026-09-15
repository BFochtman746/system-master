# P12 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P12 GitHub to A-01 ingress transport · **Effective** 2026-09-15  
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

`control-gateway/python/a01_github_ingress.py` is the read-only GitHub-to-A-01 transport.
Before this Foundation closure slice, Crosswalk 003 and `CURRENT-AUTHORITY-005` named this
canonical implementation path but no file had ever existed at it. P12 is therefore a new
bounded implementation of an already-declared platform requirement, not recovery of a
prior implementation.

P12 **does not mint admission authority**. A READY owner delegation is transportable only
when it already contains an explicit `a01_execution` envelope with all of the following:

```text
protocol_version = control-gateway.a01-github-ingress-execution.v1
qualification_id = <registered overnight-eligible A-01 qualification>
subject_sha      = <exact 40-hex Git subject>
handoff          = <already-GRANTED frozen CG-008 handoff + admission receipt>
coordination_contract = <already-bound frozen CG-009 coordination contract>
```

`Ingress` validates that envelope and forwards the **same handoff and coordination
objects** to P11. It has no `build_handoff` or `build_contract` authority and never creates
`decision: GRANTED`, admission identity, scheduler priority, idempotency identity, or DAG
identity locally.

- `Ingress.run_once(now, dry_run) -> IngressResult` — one bounded read/validate/offer pass.
- `validate_a01_execution_envelope(...)` — fail-closed exact admission/execution revalidation.
- `GitHubSource` — read-only GitHub contents + live branch-head resolver; no write method.
- `NightBudget` — durable, night-scoped P12 transport ceiling.
- `KillSwitch` — durable local halt checked before the pass and before every item.
- `a01_ingress_service.build_scheduler` — production wiring; owns the `SupervisorStore`
  lifetime and binds the real `A01NightScheduler`.

P12 does **not** select, admit, rank, claim, execute, or repair work. A-01 remains sole
admission/execution authority, P11 remains sole scheduling/claim owner, and GitHub remains
`ADMISSION_TRANSPORT_EVIDENCE_ONLY`.

## 2. Ingress routes

1. **A-01 service** (`a01_ingress_service --once` or `--daemon`) — production route.
   It reads current GitHub authority and binds the real P11 scheduler against the local
   P10 store.
2. **Wiring check** (`a01_ingress_service --check`) — constructs the real P10/P11 stack
   without reading or writing GitHub.
3. **Read-only validation CLI** (`a01_github_ingress --dry-run`) — validates current
   governance and any explicit pre-admitted envelopes but cannot queue work because no
   scheduler is bound.

The Windows Scheduled Task registration remains an operator deployment action; an example
is preserved in the service module docstring rather than performed by repository code.

## 3. Source authority and selection boundary

P12 re-reads the current authority pointer, selected Second Shift registry, current work
obligation registry, every relevant owner file, live owner control branch heads, A-01
policy, and A-01 qualification registry. A pass fails closed when:

- the current authority id is not `CURRENT-AUTHORITY-005`;
- Second Shift owner coverage and the obligation registry owner-head snapshot differ;
- an owner file identity/control head differs from that snapshot;
- the live canonical owner branch head differs from the owner-file/snapshot head;
- a delegation is not bound to that exact current control ref/head;
- the referenced current obligation is missing, non-executable, or owned elsewhere;
- shared-infrastructure work does not name the active lane as both current
  `administrative_owner` and the exact Second Shift `coverage_routes` target;
- the delegation has no explicit `a01_execution` envelope;
- the envelope names an unregistered, non-subject, or non-overnight A-01 qualifier;
- the admission receipt `task_id` differs from the exact current obligation selected for
  the source delegation;
- the exact subject SHA, repository, workstream, owner/lane/delegation/objective/control
  identity, execution class, executor kind, payload digest, night window, or coordination
  identity differs from the already-granted admission;
- the coordination resource is not the exact owner lane or permits more than one
  mutation-capable claim in that lane.

Only owner delegations already marked `READY` are considered. `CANDIDATE` is never
promoted. A generic READY delegation without pre-existing A-01 admission remains ordinary
portfolio work and is skipped as `NO_PRE_ADMITTED_A01_EXECUTION`.

## 4. Frozen execution-envelope invariants

P12 revalidates, but does not rewrite, the following authority chain before P11 enqueue:

1. `qualification_id` exists in `qualification/a01/registry.json`, is `source: subject`,
   and is explicitly `overnight_eligible: true`.
2. `subject_sha` is exactly 40 hexadecimal Git characters.
3. Frozen CG-008 `validate_gateway_handoff` passes, including admission and handoff
   digests and exact receipt-to-handoff field equality.
4. `executor_kind` is `A01_CONTROL_PLANE_QUALIFICATION`, the executor implemented by the
   production A-01 execution worker.
5. `execution_class` is `OVERNIGHT`.
6. The handoff lane/owner/delegation/objective/control ref/control head equal the exact
   current source delegation and live owner control identity.
7. The already-GRANTED receipt repository equals `BFochtman746/system-master`, its
   workstream equals the registered qualifier workstream, its `task_id` equals the exact
   current obligation ID, and its
   `authoritative_subject = {algorithm: sha1, oid: subject_sha}`.
8. If the current obligation is shared-infrastructure work, its `administrative_owner`
   equals the active `SYSTEM_MASTER/<lane>` owner and the selected Second Shift
   `coverage_routes` entry resolves that shared owner path to the same lane.
9. The payload `qualification_id`, `workstream_id`, and `subject_sha` match the envelope
   and registered qualifier; optional `control_plane_sha`, when present, equals the exact
   subject. The admitted `payload_digest` recomputes exactly.
10. `not_before` / `not_after` equal the currently selected A-01 night window for the
    active session.
11. Frozen CG-009 `validate_coordination_contract` passes; the contract binds the exact
    handoff digest and source delegation, uses `OWNER-LANE:<lane>`, and has
    `max_concurrency = 1`.

Any mismatch stops that item before `A01NightScheduler.enqueue`.

## 5. Egress routes

- **Only state-changing egress:** `A01NightScheduler.enqueue(handoff, contract)` with the
  already-admitted objects unchanged.
- **stdout/service log:** structured JSON pass status and counts.
- **exit code:** success only for clean/well-classified service results.

There is no GitHub write route, admission-broker write route, workflow-dispatch route,
subprocess execution route, or external side-effect route in `GitHubSource` or `Ingress`.

## 6. Persistence and canonical writers

Three durable stores have separate authority.

1. **P11 queue / P10 supervisor SQLite** — canonical writers remain P11/P10. P12 never
   inserts a claim, lease, dispatch row, coordination row, or scheduler queue row directly.
2. **P12 night transport budget** — `<state>/a01-ingress-night-budget.json`, written only
   by `NightBudget`. The write is temp-file + `fsync` + atomic replace. Distinct admitted
   delegation identities consume slots permanently for that session; exact replay is
   idempotent.
3. **Kill switch** — `<state>/NIGHT-HALT`, written/removed only by `KillSwitch`.

The P12 budget is conservative and separate from P11's authoritative atomic claim budget.
It bounds how many already-admitted identities P12 may offer; P11 independently bounds
actual claims. Scheduler refusal does not refund a P12 transport slot.

## 7. Identity and night semantics

P12 derives **no execution identity**. `delegation_id`, `idempotency_key`, admission ID,
qualification ID, exact subject SHA, scheduling values, payload digest, graph ID, graph
version and dependency identity all arrive in the explicit `a01_execution` envelope and
must already be digest-bound under CG-008/CG-009. The admitted `task_id` is additionally
rebound to the exact current obligation before transport because P10 materializes its
durable obligation identity from that field.

The ingress computes only the active session's expected 00:00–07:00
`America/New_York` window from current A-01 policy and compares the admitted timestamps to
that window. It refuses disabled overnight policy, a different timezone, or an invalid
slot ceiling. It never rewrites an admitted window to make stale work current.

## 8. Failure semantics

**Fail closed. A malformed, stale, or unadmitted item is never repaired by inventing
admission authority.**

- GitHub read/JSON failure → `ERROR`; no partial authority snapshot is trusted.
- Owner coverage/head/live-branch mismatch → pass `ERROR` before affected work is offered.
- Source state other than `READY` → `NOT_READY` skip.
- Stale owner/control binding → `STALE_CONTROL_BINDING` skip.
- Missing/non-executable current obligation → explicit skip.
- Wrong shared-infrastructure administrator/coverage route → `OBLIGATION_OWNER_MISMATCH`.
- No `a01_execution` envelope → `NO_PRE_ADMITTED_A01_EXECUTION` skip.
- Any qualifier/subject/admission task/payload/owner/control/window/coordination mismatch →
  `A01_EXECUTION_REVALIDATION_FAILED` skip.
- Missing production scheduler → error; no fallback writer.
- P12 budget exhausted → `NIGHT_BUDGET_EXHAUSTED` skip.
- P11 refusal → `P11_ENQUEUE_REFUSED`; P12 does not route around scheduler authority.
- Kill switch → `HALTED`; rechecked before every considered item.
- Active-session budget-policy drift or malformed budget ledger → fail closed.

## 9. Dependencies

- **P00–P02** current governance/obligation truth.
- **P07** frozen A-01 admission semantics; P12 consumes admission, never creates it.
- **P08** exact qualification PASS/subject semantics.
- **CG-008 / P10** frozen supervisor handoff + local supervisor store.
- **CG-009** frozen coordination contract.
- **P11** queue and exclusive scheduling/claim authority.
- `qualification/a01/a01-policy.json` for current overnight policy.
- `qualification/a01/registry.json` for registered qualifier/workstream/overnight eligibility.
- Python 3.12 standard library only for P12 runtime.

## 10. Evidence target and acceptance

Hosted acceptance:

```bash
PYTHONPATH="$PWD/control-gateway/python:$PWD" \
  python tests/test_a01_github_ingress.py
PYTHONPATH="$PWD/control-gateway/python:$PWD" \
  python -m a01_ingress_service --check --db /tmp/p12.db --state-dir /tmp/p12-state
node --test control-gateway/test/a01-github-ingress.test.js
```

The adversarial Python suite proves, at minimum:

- no local `build_handoff` / `build_contract` admission construction remains;
- generic READY work without `a01_execution` never reaches P11;
- an exact pre-admitted handoff/coordination pair is forwarded unchanged;
- unregistered/non-overnight qualifier rejection;
- exact subject and authoritative-subject drift rejection;
- admission `task_id` drift rejection even after all affected digests are recomputed;
- owner/control drift rejection;
- shared-infrastructure administrative-owner/coverage-route rejection and exact-route acceptance;
- payload-digest tamper rejection;
- unsupported executor rejection;
- coordination resource/concurrency drift rejection;
- current-night-window drift rejection;
- live owner branch-head drift rejection;
- dry-run has no budget reservation or enqueue side effect.

A-01 acceptance is reached without modifying the shared qualification registry or shared
cumulative qualifier: `control-gateway/test/a01-github-ingress.test.js` is discovered by
the already-registered `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS` `node --test` stage. Thus
the exact P12 subject executes the repaired Python P12 suite and real service wiring on
A-01 Windows while P07–P11 content-addressed qualifier/registry subjects remain unchanged.

**PASS** requires hosted acceptance, exact-SHA A-01 PASS, immutable hosted/A-01 artifacts,
a current P12 Foundation evidence receipt, Required Verification, and census advancement
to the next active gap.

## 11. Authority boundary / remaining operational deployment

**Lane may decide alone (`agent`):** poll interval, backoff, log wording, additional
negative tests, or internal refactoring that preserves the frozen pre-admitted-only
boundary.

**Requires owner/higher authority:** creating or changing admission; changing exact
subject/qualifier; raising the policy slot limit; adding GitHub write capability;
transporting `CANDIDATE` as READY; changing scheduling priority or execution identity;
changing execution class away from `OVERNIGHT`; weakening current-head/current-obligation
or shared-owner-route checks; accepting another executor kind; weakening
payload/coordination digest checks; removing the per-item kill switch; or bypassing P11.

Repository closure does not claim the Windows Scheduled Task is installed or that a token
exists for future private-repository access. The service docstring preserves deployment
instructions and post-reboot checking. `A01_INGRESS_TOKEN` remains an external/private
access prerequisite when the repository cannot be read anonymously.
