# P12 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P12 GitHub to A-01 ingress transport · **Effective** 2026-09-15
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

`control-gateway/python/a01_github_ingress.py` is the read-only GitHub-to-A-01 transport.
Before this Foundation closure slice, Crosswalk 003 and `CURRENT-AUTHORITY-005` named this
canonical implementation path but no file had ever existed at it. P12 is therefore a new
bounded implementation of an already-declared platform requirement, not recovery of a
prior implementation.

The module reads current governance state from GitHub, mints the frozen local A-01
admission receipt expected by CG-008, builds the frozen gateway handoff plus CG-009
coordination contract, and offers it to P11.

- `Ingress.run_once(now, dry_run) -> IngressResult` — one bounded pass.
- `build_handoff(...)` — exact CG-008 handoff plus admission receipt.
- `build_contract(...)` — exact CG-009 coordination contract.
- `GitHubSource` — read-only GitHub Contents transport. It exposes no write method.
- `NightBudget` — durable, night-scoped P12 transport ceiling.
- `KillSwitch` — durable local halt checked before the pass and before every item.
- `a01_ingress_service.build_scheduler` — the only production wiring path; owns the
  `SupervisorStore` lifetime and binds the real `A01NightScheduler`.

P12 does **not** select or claim work. A-01 remains sole scheduling/claim owner and GitHub
remains `ADMISSION_TRANSPORT_EVIDENCE_ONLY`.

## 2. Ingress routes

1. **A-01 service** (`a01_ingress_service --once` or `--daemon`) — production route.
   It reads GitHub and binds the real P11 scheduler against the local P10 store.
2. **Wiring check** (`a01_ingress_service --check`) — constructs the real P10/P11 stack
   without reading or writing GitHub.
3. **Builder/dry-run CLI** (`a01_github_ingress`) — constructs with `scheduler=None` and
   can only validate/build/report. It cannot queue or execute work.

The Windows Scheduled Task registration remains an operator deployment action; an example
is preserved in the service module docstring rather than performed by repository code.

## 3. Source authority and selection boundary

P12 reads the current authority pointer, its selected Second Shift registry, current work
obligation registry, owner files and A-01 overnight policy. A pass fails closed when:

- the current authority id is not `CURRENT-AUTHORITY-005`;
- Second Shift owner coverage and the obligation registry owner-head snapshot differ;
- an owner file identity/control head differs from that current snapshot;
- a delegation is not bound to its owner file's exact current control ref/head;
- the referenced current obligation is missing, non-executable, or owned by another lane.

Only source delegations already marked `READY` are transportable. `CANDIDATE` is **not**
promoted by P12. That keeps readiness authority in the existing Second Shift governance
layer.

Source owner-file `priority` values are semantic strings, while the frozen CG-008 handoff
requires numeric scheduler values. P12 therefore uses neutral values
`execution_order = 0`, `priority = 100` and preserves the source semantic priority inside
the immutable payload. It does not invent a cross-peer ranking. P11 remains responsible
for ordering/claim authority after admission.

## 4. Egress routes

- **Only state-changing egress:** `A01NightScheduler.enqueue(handoff, contract)`.
- **stdout/service log:** structured JSON pass status and counts.
- **exit code:** success only for clean/well-classified service results.

There is no GitHub write route, workflow-dispatch route, subprocess execution route, or
external action route in `GitHubSource` or `Ingress`.

## 5. Persistence and canonical writers

Three durable stores have separate authority.

1. **P11 queue / P10 supervisor SQLite** — canonical writers remain P11/P10. P12 never
   inserts a claim, lease, dispatch row, coordination row, or scheduler queue row directly.
2. **P12 night transport budget** — `<state>/a01-ingress-night-budget.json`, written only
   by `NightBudget`. The write is temp-file + `fsync` + atomic replace. Distinct transport
   identities consume slots permanently for that session; exact replay is idempotent.
3. **Kill switch** — `<state>/NIGHT-HALT`, written/removed only by `KillSwitch`.

The P12 budget is intentionally conservative and separate from P11's authoritative claim
budget. It bounds how many distinct identities P12 may offer; P11 independently bounds
actual claims. Scheduler refusal does not refund a P12 slot.

## 6. Identity and night semantics

`delegation_id` is derived from
`digest({objective_id, control_head, session_date})`, truncated to 16 hex characters and
prefixed `ING-`; the idempotency key uses the same full identity material.

The session date rolls at **local noon in `America/New_York`**, so the evening kickoff and
the following 00:00–07:00 execution window are one night. Re-polling unchanged authority
within that session produces the same transport identity and consumes no additional P12
budget slot. The next session gets a new identity and a new budget.

P12 derives `not_before`/`not_after` from the current A-01 overnight policy and refuses a
policy with the wrong timezone, disabled overnight execution, or an invalid slot ceiling.

## 7. Failure semantics

**Fail closed.** A malformed or stale item is never repaired by inventing authority.

- GitHub read/JSON failure → `ERROR`; nothing is offered from an incomplete pass.
- Owner coverage/head mismatch → pass `ERROR` before affected work can be enqueued.
- Source state other than `READY` → `NOT_READY` skip.
- Stale owner/control binding → `STALE_CONTROL_BINDING` skip.
- Missing/non-executable current obligation → explicit skip.
- Frozen handoff/coordination validation failure → `BUILD_FAILED` skip.
- Missing production scheduler → error, never an implicit fallback writer.
- P12 budget exhausted → `NIGHT_BUDGET_EXHAUSTED` skip.
- P11 refusal → `ENQUEUE_REFUSED`; P12 does not retry around scheduler authority.
- Kill switch → `HALTED`; rechecked before every item so a mid-pass halt stops the next
  transport.
- Active-session budget policy drift or malformed budget ledger → fail closed.

## 8. Dependencies

- **P00–P02** current governance and obligation state.
- **P07** frozen admission-receipt semantics.
- **P10** local supervisor store, via the service/P11 boundary only.
- **P11** queue and exclusive scheduling/claim authority.
- `qualification/a01/a01-policy.json` for timezone/window/slot ceiling.
- Python 3.12 standard library only for P12 runtime.

## 9. Evidence target and acceptance

Hosted acceptance:

```bash
PYTHONPATH="$PWD/control-gateway/python:$PWD" \
  python control-gateway/python/test_a01_github_ingress.py
PYTHONPATH="$PWD/control-gateway/python:$PWD" \
  python -m a01_ingress_service --check --db /tmp/p12.db --state-dir /tmp/p12-state
```

The Python suite is offline: GitHub is a fake read-only source and queueing uses a
recording scheduler except for the explicit real-wiring test. It proves frozen handoff and
coordination validation, stable night identity, budget durability/reset/exhaustion,
non-refund on refusal, kill-switch behavior, stale-control rejection, obligation/current
head guards, no GitHub write surface, and real P11 wiring.

A-01 acceptance is reached without modifying the shared qualification registry: the new
`control-gateway/test/a01-github-ingress.test.js` bridge is automatically discovered by
the already-registered `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS` Control Gateway Node stage.
Thus the exact P12 subject must execute the Python P12 suite and real service wiring on
A-01 Windows while P07–P11 registry-bound receipts remain undisturbed.

**PASS** requires hosted acceptance, exact-SHA A-01 PASS, immutable hosted/A-01 artifacts,
a current P12 Foundation evidence receipt, Required Verification, and a census successor
of P15.

## 10. Authority boundary / remaining operational deployment

**Lane may decide alone (`agent`):** poll interval, backoff, log wording, additional
negative tests, internal refactoring that preserves frozen contracts and current authority
checks.

**Requires owner authority:** changing transport identity; raising the policy slot limit;
adding any GitHub write path; transporting `CANDIDATE` as if READY; assigning semantic
cross-peer scheduling priority; changing execution class away from `OVERNIGHT`; weakening
current-head/obligation checks; removing the per-item kill-switch check; bypassing P11.

Repository closure does not claim the Windows Scheduled Task is installed or that a token
exists for a future private repository. The service docstring preserves the deployment
command and post-reboot check. `A01_INGRESS_TOKEN` is optional for the current public
repository and becomes an external/private-authority prerequisite if repository access
changes.
