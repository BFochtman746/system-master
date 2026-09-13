# System Master — Update Package 001

Generated 2026-09-13. Every file here was run or tested against your repository at
commit `49c28f7` before packaging. 89 files: 18 code, 71 governance (37 scaffolded contract stubs, 14 complete contracts).

## How to apply

Unzip over your repository root. Paths mirror the repo exactly, so the files land
where they belong. Nothing is deleted — every governance file is a **successor**
(`-005`, `-006`, `-013`, `-004`); your existing files stay as history. The only
overwrite is `governance/CURRENT-AUTHORITY.json`, which is the pointer file and is
designed to be repointed.

Two files replace existing code. Diff them before committing:
- `.github/workflows/a01-control-plane-dispatch-bridge.yml`
- `control-gateway/src/github-workflow-dispatch.js`

## Verify after applying

```bash
cd control-gateway && node --test          # expect: 201 tests, 190 pass, 0 fail, 11 skipped
cd python && PYTHONPATH="$PWD:$(cd ../.. && pwd)" \
  python3 -m unittest test_a01_github_ingress test_a01_morning_receipt \
    test_a01_evidence_retention             # expect: 55 tests, OK
cd ../..
node .github/scripts/validate-governance.js # expect: 4 PASS, GOVERNANCE_VALIDATION=PASS
node .github/scripts/system-brief.js       # expect: CURRENT-AUTHORITY-004, registry 013
node .github/scripts/foundation-closure-matrix.js --summary
node .github/scripts/lane-brief.js --list       # expect: 9 lanes, 35 modules
```

Expected matrix summary:

```
COMPLETE_WITH_EVIDENCE: 14
ACTIVE_GAP: 33
DURABLY_BLOCKED: 2
EXPLICITLY_OUT_OF_SCOPE_WITH_AUTHORITY: 7
completion_percent: 25
scope_uncovered: 8
```

If the brief still reports CURRENT-AUTHORITY-003, the pointer file didn't land.

---

## What changed

### Code — defect repairs

| File | Change |
|---|---|
| `.github/workflows/a01-control-plane-dispatch-bridge.yml` | Forwards `not_before`, `not_after`, `repair_transaction_id` — previously declared and silently dropped. Single normalization point emitting typed outputs. Bounds aligned to the JS normalizer (1–360 timeouts, 0–100 repair). Overnight windows validated as ISO-8601 with offset and ordering. Repair lineage fails closed when attempts are claimed without a transaction id. |
| `control-gateway/src/github-workflow-dispatch.js` | Same four fields restored to `normalizedInputs`. Adds window validation, lineage validation, and a job-budget-exceeds-qualifier-budget invariant. |
| `control-gateway/test/github-workflow-dispatch-passthrough.test.js` | **New.** 12 cases locking the passthrough so the drop cannot recur. |
| `.github/workflows/a01-control-plane-enforcement.yml` | Adds `control-gateway/**` to path filters and a second job running the full suite on every push and PR. Previously no workflow ran these tests on `main` or any PR. |

### Code — new instruments

| File | Purpose |
|---|---|
| `.github/scripts/system-brief.js` | Resolves the `CURRENT-AUTHORITY` pointer chain into one ~5 KB page. `--json`, `--out`, `--strict`. |
| `.github/scripts/foundation-closure-matrix.js` | Executes Foundation Closure Census 001 under its own no-silent-gap rule. Reads ratified ownership from the allocation registry, falls back to the P6 census when unratified. `--json`, `--out`, `--summary`. |
| `.github/scripts/lane-brief.js` | Generates a ready-to-paste ChatGPT brief for any of the 9 owner lanes, from the ratified allocation and obligation registries. `--list`, `--lane`, `--obligation`, `--fast-lane`, `--out`. |

### Governance — chat operating model

Merged from your design-time governance build spec. `CHATGPT-OPERATING-CONTRACT-002.md`
supersedes 001 and now carries a four-way decision classification (`process` / `agent` /
`owner` / `escalate`), defined in `DECISION-RIGHTS-001.md`, with `FAST-LANE-001.md` as
the reduced-format escape hatch. The contract explains what was kept from the build spec,
what changed, and what was deliberately dropped — chiefly the persona "qualification
testing," which would have let a chat self-certify under a word your governance reserves
for A-01 registered runs, and every mechanism that assumed the AI can write files.

### Governance — the seven ratified decisions

Four candidates admitted as peer systems, **4 peers → 8**:

| System | Modules |
|---|---|
| SPREADSHEET_DATA | EXCEL, MATH, DATA, LEDGER |
| MEDIA | AUDIOBOOK, IMAGE, MEDIA, PHOTO, VIDEO, VOICE |
| CONNECTED_ACTIONS | BROWSER, CALENDAR, COMMS, PLUGINS |
| RESEARCH_KNOWLEDGE | RESEARCH, KNOWLEDGE, GEO |

Existing owners absorb the rest: DOCUMENTS (DOCX, PDF, PPTX, OCR, FILE, IMG-INGEST),
CORE (CHAT, EXPERIENCE, PROJECTS, EXPECTATION, LOCALAI), BOOK (MANUSCRIPT, STORYBIBLE,
WRITING), LEARNING (CURRICULUM, LEARNING), PROGRAMMING (CODE, AUTOMATION).
Five explicitly deferred with authority: CAD, PHONEOPS, PHYSICALAI, AIINCOME, PORTFOLIO.

Four boundary rules are recorded in the allocation registry: CORE keeps the shared data
foundation while SPREADSHEET_DATA owns product BI; CORE keeps the connector runtime
while CONNECTED_ACTIONS owns module policy; BOOK owns authoring semantics while
DOCUMENTS owns artifact mechanics; RESEARCH_KNOWLEDGE consumes BROWSER rather than
owning it. Plus one standing constraint: no CONNECTED_ACTIONS module reaches production
authority before Foundation 1.0 closes.

The four `HEADLESS-*-CONTRACT-001` obligations move HOLD → READY, each bound to its new
owner. They were blocked on owner registration and nothing else.

---

## Correcting a number I gave you

The decision pack estimated ACTIVE_GAP would fall from 35 to ~18. The real figure is
**33**. Ownership was one of eight gap-forcing columns, and clearing one column does not
clear the gap.

What did change is the thing that matters: **modules with no canonical owner went 27 → 0.**
All 40 are now owned or explicitly deferred — 100% disposition. Every remaining gap
reads "owner registered but foundation columns unpopulated" instead of "no canonical
owner." The backlog converted from authority to engineering, which is the unlock. The
count will not move until foundation contracts are written.

Also fixed in this package: the first version of the crosswalk detector counted my own
new obligation text as evidence that the crosswalk exists. It now requires a file to
define at least 10 distinct identifiers. `scope_uncovered` is honestly 9, not 8.

---

## What is still open

1. **The C00–C49 / P00–P15 crosswalk does not exist on any ref.** Census scope area 1
   requires it; those identifiers appear only in the census specification itself. The
   census cannot close until it is authored or the scope is amended. Now tracked as
   `FOUNDATION-1-0-CLOSURE-001`, the new central objective.
2. **No foundation contract template.** Census scope areas 3–10 have no source artifact.
   This is the next build.
3. **No ingress.** Nothing on A-01 polls GitHub. You remain the transport layer.
4. **No governance schemas.** The four load-bearing files have no validation.
5. **No morning receipt, no night budget, no kill switch, no rollback procedure.**

## Recommended order

1. Apply, verify, commit.
2. Make `a01-control-plane-enforcement` a required status check.
3. Paste `governance/CHATGPT-OPERATING-CONTRACT-002.md` into each lane's ChatGPT Project
   instructions, then open each lane with `node .github/scripts/lane-brief.js --lane <LANE>`.
4. Governance schemas.
5. Foundation contract template, filled for owned modules.
6. The poller.


---

## Added in the second pass

### A-01 GitHub ingress — the transport layer

`control-gateway/python/a01_github_ingress.py` plus `test_a01_github_ingress.py` (25
tests, offline). This is the component whose absence made you the message bus.

It reads the governance state of record from GitHub **read-only**, mints a local A-01
admission receipt, builds a frozen gateway handoff and coordination contract, and
enqueues through the existing night scheduler. Authority is unchanged: A-01 stays the
sole scheduling owner, GitHub stays `ADMISSION_TRANSPORT_EVIDENCE_ONLY`, and the class
that talks to GitHub has no write method — a test asserts it never grows one.

Two things the estate lacked:

- **Kill switch.** `--halt "reason"` writes `control-gateway/state/NIGHT-HALT`. Checked
  before every item, so it stops the night mid-pass without restarting anything.
  `--resume` releases it.
- **Global night budget.** `--max-delegations` and `--max-minutes` bound the entire
  night, not one lineage. A repair loop across a dozen obligations cannot eat the window.

**Wiring required before use.** `main()` constructs the ingress with `scheduler=None`,
which builds handoffs and enqueues nothing. Pass a real `NightScheduler` from your
service entry point, where the `SupervisorStore` lifetime is owned. Until you do,
`--dry-run` is the only meaningful mode. That is deliberate — I will not open a write
path into your queue from a CLI default.

**A bug the tests caught.** The first version derived `delegation_id` from the poll
instant, so every re-poll produced a new delegation — the exact duplicate-work failure
idempotency exists to prevent. Identity is now `(objective, control_head, session_date)`,
where the session date rolls at midday so a night spanning midnight stays one night.

### Governance schemas and validation

Four schemas in `governance/schemas/` plus `.github/scripts/validate-governance.js`,
dependency-free by design — a governance gate that needs an install step is a gate that
gets skipped. All four load-bearing files now PASS. Verified negatively: an invalid
`completion` value and a broken pointer both fail with exit 1.

It also reports cross-file warnings a schema alone cannot see. Five are live right now:
obligations owned by `SYSTEM_MASTER`, `SYSTEM_MASTER/SHARED_INFRASTRUCTURE`, and
`SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01` — paths that own no modules in the allocation.
Warnings, not failures, because they are pre-existing and may be intentional. Worth a
decision: either those are lanes and belong in the allocation, or the obligations should
be reassigned.

### Foundation contract template

`governance/FOUNDATION-CONTRACT-TEMPLATE-001.md` — ten sections covering census scope
areas 3 through 10, one file per owned module at
`governance/contracts/<MODULE_KEY>-FOUNDATION-CONTRACT-001.md`. This is what moves a
module off ACTIVE_GAP. Section 8, the acceptance target, is the only section the matrix
can verify mechanically; if you fill one section per module first, fill that one.

### Enforcement workflow

Now three jobs: `enforce` (with governance validation added), `control-gateway-suite`,
and `ingress-suite`. Confirm the `setup-python` SHA against one you trust before merging;
I pinned a placeholder, same as `setup-node`.

---

## Still open after this pass

1. **The C00-C49 / P00-P15 crosswalk.** Unwritten. The census cannot close without it.
2. **Foundation contracts.** Template exists; 35 modules still need theirs.
3. **Ingress scheduler wiring**, plus running it as a Windows service that survives a
   reboot — otherwise one Windows Update ends the night silently.
4. **Morning receipt.** PR #28 is the open half.
5. **Rollback procedure.** Every repair path is still forward-only.
6. **Branch federation.** Five control records remain unreadable from any single ref.


---

## Added in the third pass

### 35 foundation contract stubs

`.github/scripts/scaffold-foundation-contracts.js` generated
`governance/contracts/<MODULE>-FOUNDATION-CONTRACT-001.md` for every owned module. Each
stub is pre-filled with what the repository already knows — owner, lane, the census
standing and evidence summary from P6, and the boundary rules touching that module — and
leaves the eight gap-forcing sections explicitly marked `UNPOPULATED`.

The generator does not guess. A stub that invented plausible failure semantics would read
as populated to both the matrix and a reviewer, which is worse than an empty section: the
census forbids inferring completion from planning volume, and a plausible guess is the
most expensive kind of planning volume.

Never overwrites. Re-running reports `left 35 existing untouched`, so it is safe to run
after admitting a new module — it fills only the new one.

    node .github/scripts/scaffold-foundation-contracts.js --lane DOCUMENTS   # preview
    node .github/scripts/scaffold-foundation-contracts.js --write            # create

### Ingress service entry point

`control-gateway/python/a01_ingress_service.py` owns the `SupervisorStore` lifetime and
wires the real `A01NightScheduler` in. This is the only place a write path into the night
queue is opened.

Verified: `--check` reports `A01NightScheduler` bound against a real SQLite store, and a
pass with GitHub unreachable reports the error and exits 1 rather than crashing.

    python -m a01_ingress_service --check --dry-run   # prove wiring, no DB, no writes
    python -m a01_ingress_service --check             # prove real scheduler binding
    python -m a01_ingress_service --daemon

The module docstring carries the `schtasks /Create /SC ONSTART` registration and, more
importantly, the verification step: reboot, then check Last Result is 0. A console
process dies to the first Windows Update and ends the night with no error and no
evidence. Check it the first morning after you install it.

### Capability crosswalk proposal

`governance/CAPABILITY-CROSSWALK-PROPOSAL-001.md` — **needs your ratification**, same as
the owner decision pack.

It resolves the finding that has been blocking Foundation 1.0 all along: the census is
scoped to C00-C49 and P00-P15, and those 66 identifiers exist nowhere but the census spec
itself. As written the census can never close. The proposal defines C00-C34 as the owned
modules, C35-C39 as the deferred ones, C40-C49 reserved, and hand-derives P00-P15 as the
platform layer from what the repo actually runs.

Three of the platform entries are gaps nobody had written down: **P03** evidence
retention on A-01, **P13** model routing contract, and **P15** observability, morning
receipt and rollback. The alternative — amending the census scope to drop the crosswalk —
is set out in the document and is a legitimate choice.

Ratifying raises the foundation surface from 35 contracts owed to **51**, and projected
gaps from 33 to roughly 46. The number goes up because the measurement got honest. A
count that only ever improves was never measuring anything.

---

## Open after three passes

1. **Ratify or amend the crosswalk proposal.** Everything about census closure waits on
   this one decision.
2. **Fill 35 contract stubs** (51 if the crosswalk is ratified). Section 8, the acceptance
   target, is the only one the matrix can verify — fill it first.
3. **Install the ingress as a scheduled task and verify it survives a reboot.**
4. **Morning receipt** — PR #28, and P15 in the proposal.
5. **Rollback procedure** — still forward-only everywhere.
6. **Branch federation** — five control records unreadable from any single ref.


---

## Added in the fourth pass

### Morning receipt

`control-gateway/python/a01_morning_receipt.py` plus 13 tests. Closes the open half of
PR #28 and P15 in the crosswalk proposal.

Reads the supervisor SQLite **read-only** — opened with `mode=ro`, with a test asserting
the connection refuses writes. A reporting tool that can mutate what it reports on is one
you cannot trust at 6am.

Four sections, ordered by what each costs you: **what needs your decision**, what is
stuck, what ran, what the night was allowed to spend. Decisions lead because they are the
only section that blocks the next night, and a test enforces that ordering. A test also
caps the receipt under 80 lines with 20 completed claims, so it stays one scroll.

Exit 0 clean, 1 attention required, 2 database unreadable — so you can wire it to a
notification without parsing the text. A missing database raises rather than reporting a
clean night; "nothing ran" and "I could not tell" must never look alike.

    python -m a01_morning_receipt
    python -m a01_morning_receipt --json --out receipt.json

Its session window uses the same midday rollover as the ingress, so a night spanning
midnight is one night in both.

### Rollback procedure

`governance/ROLLBACK-PROCEDURE-001.md`. Every repair path here was forward-only —
correct for evidence, wrong for code, because a bad control-plane commit could only be
fixed by shipping another commit while the broken one was live.

Opens with the decision table, because rolling back is often the wrong move: a failing
gate with nothing dispatching should be fixed forward, since rolling back a red gate hides
the finding. Then four scenarios — control-plane code, governance content, broken pointer,
bad CAS ref — each with its own method, because reverting a governance file and reverting
a script are different operations.

Three prohibitions worth reading before you need them: never force-push the control plane
(breaks every recorded digest), never delete a CAS authority ref (destroys the write-once
guarantee permanently and silently), and never resume while any of the five verification
checks is red.

The log template ends with a follow-up line naming the gate that should have caught the
problem. A rollback that does not end in a new or tightened gate will happen again in the
same place.

### CI

`ingress-suite` now runs both Python suites — 38 tests.

---

## Open after four passes

1. **Ratify or amend the capability crosswalk proposal.** Census closure waits on this
   one decision and nothing else.
2. **Fill the contract stubs** — 35 now, 51 if the crosswalk is ratified. Section 8, the
   acceptance target, first.
3. **Install the ingress as a scheduled task and verify it survives a reboot.**
4. **Branch federation** — five control records still unreadable from any single ref.
   This is an architecture decision, not a cleanup.

Items 1 and 4 are yours. Item 3 takes an evening. Item 2 is the long one, and it is the
only work that moves the completion percentage off zero.


---

## Added in the fifth pass — crosswalk ratified

You approved the recommendation, so this pass executes it.

### The crosswalk is now canonical

`governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-001.json` — C00-C34 the owned
modules, C35-C39 deferred, C40-C49 reserved (never renumbered: a rename must not orphan a
contract cross-reference), P00-P15 the platform layer. `CURRENT-AUTHORITY` repoints to it.
Census scope area 1 now has a source artifact; `scope_uncovered` 9 → 8.

### The matrix now reads contracts — this is the change that matters

Until this pass the completion count could never move, because nothing consumed the
contracts. The matrix now opens each `governance/contracts/<KEY>-FOUNDATION-CONTRACT-001.md`
and checks whether the eight census gap-forcing sections carry real prose. The template's
`UNPOPULATED` marker, a `TBD`, or a bare placeholder all count as unpopulated. A module
reaches `COMPLETE_WITH_EVIDENCE` only with an owner **and** all eight sections filled.

It also censuses P00-P15 alongside the 40 modules, so total entries are 56.

### Three complete foundation contracts

P05 governance validation, P12 ingress transport, P15 observability and rollback — the
three components built and tested in this session, so all ten sections rest on first-hand
evidence rather than intent. They are the worked standard for the other 48.

Each records its acceptance target as a runnable command, names its canonical writer, and
states what is an `owner` decision. P12's §9 names the two things that must never change
without a written decision — the identity rule and the read-only property — because both
have already failed once in that module's short history.

### 51 contracts scaffolded

35 module stubs plus 16 platform stubs. The platform ones carry a line naming what
implements them, and for P03, P08, P09, P13 and P14 that line reads **nothing — this
requirement has no implementation**. Those five were invisible until the crosswalk named
them.

### Current state

```
COMPLETE_WITH_EVIDENCE  3     (P05, P12, P15)
ACTIVE_GAP             46
DURABLY_BLOCKED         2
OUT_OF_SCOPE            5
                       ---
                       56 entries · 5% complete
```

Gaps went 33 → 46 because the platform layer is counted now. That is the honest number,
and 5% is the first non-zero reading this estate has ever produced.

### Also fixed

All five Node CLIs crashed with `EPIPE` when piped to `head`. Guarded.

---

## Open after five passes

1. **Fill the remaining 48 contracts.** Section 8, the acceptance target, first — it is
   the only section the matrix can verify. Three worked examples are in the package.
2. **Decide P03, P08, P09, P13, P14** — five platform requirements with no implementation.
   Build, defer with authority, or absorb. This is an `owner` decision.
3. **Register the ingress and receipt as scheduled tasks; verify across a reboot.**
4. **Branch federation** — five control records unreadable from any single ref.

Item 1 is the long one and the only work that moves the percentage. Items 2 and 4 are
yours.


---

## Added in the sixth pass — six more platform contracts

Filled every remaining platform contract I could evidence first-hand from this session's
audit, rather than leaving them as stubs for you.

**P00** authority pointer · **P01** topology and allocation · **P02** obligation registry ·
**P04** content-addressed authority writes · **P06** control gateway dispatch ·
**P11** night scheduler and claim authority

With P05, P12 and P15 from earlier passes that is **9 of 16 platform requirements
complete**, and the estate reads **16%**.

Each rests on evidence in the repository, not intent. P04 cites the eleven error codes,
the triple ref guard and the post-write reconstruction, with Authority Bootstrap #1 as
live proof. P06 cites Dispatch Bridge #4 and the twelve passthrough cases. P11 cites the
`CG010_NIGHT_SCHEDULER_AUTH_REQUIRED` trigger and the `uq_active_claim_per_lane` index —
rules enforced in SQLite rather than only in application code.

Three of them record real gaps rather than claiming coverage:

- **P06** — no idempotency key, so a retried dispatch creates a genuinely new run; and the
  unresolved 23-second qualification against a declared 28-minute budget.
- **P11** — the acceptance target proves the admission contract but not `tick`,
  `reconcile`, or claim selection under contention. Stated plainly rather than dressed up.
- **P00** — the only contract in the estate with an empty `agent` column. Every change to
  a root pointer is an owner decision, and that is the correct shape.

### Remaining platform contracts

**P03** evidence retention · **P07** admission barrier · **P08** qualification PASS
semantics · **P09** repair broker · **P10** supervisor primitives · **P13** model routing ·
**P14** connector runtime

P07, P08, P09 and P10 exist in code I did not read closely enough this session to write
a contract that would survive scrutiny — writing one from partial reading would produce
exactly the plausible-guess failure the census forbids. P03, P13 and P14 have no
implementation at all and need your decision first: build, defer with authority, or absorb.

---

## Open after six passes

1. **Fill the 33 module contracts.** Nine worked platform examples now set the standard.
2. **Decide P03, P13, P14** — no implementation exists. Owner decision.
3. **Contracts for P07, P08, P09, P10** — the code exists; someone who knows its failure
   behaviour should write these, or point me at the sources and I will.
4. **Register the ingress and receipt as scheduled tasks; verify across a reboot.**
5. **Branch federation.**


---

## Added in the seventh pass — the three platform dispositions

You delegated these. Recorded in `governance/PLATFORM-DISPOSITION-DECISIONS-001.md` with
the evidence each rests on, because a delegated decision owes the same audit trail as a
ratified one — more, if anything, since you were not in the room.

### P03 Evidence retention — BUILT

`control-gateway/python/a01_evidence_retention.py`, 17 tests.

Build rather than defer, because the failure mode is already latent: evidence accumulates
on A-01 every night with nothing governing it, so either the disk fills until a night dies
or someone clears it by hand and the audit trail has a hole nobody can date. The second is
worse and likelier. Deferring would also hollow out P04 — a content-addressed ref that
means one thing forever is worth little if the evidence it points at gets cleared for disk.

Design follows current audit practice, where immutability is a property of the write path
rather than of a policy sentence:

- **Hash-chained append-only manifest** — each entry carries the artifact digest and the
  previous entry digest, so any edit, removal or insertion is detectable by replay. Opened
  `"a"`, never `"w"`; no update or delete method exists on the class.
- **Record before delete** — an artifact is never removed until its `PRUNED` entry is
  written and fsynced. If the record fails, the artifact stays.
- **Prune refused on a broken chain** — verification failure means nothing is deleted.
- **Asymmetric retention** — artifacts are prunable, manifest entries never are. Pruning an
  artifact is a space decision; losing the record that it existed is an audit decision.
- **Tiered windows** — 30 days whole, one per day to 365, then prunable. `authority/`,
  `qualification/` and `closure/` prefixes never prunable at any age.

Stated limit, recorded rather than glossed: hash-chaining gives tamper-*evidence*, not
tamper-*proofing*. Anyone with local write access could rewrite the chain. Closing that
needs an external anchor, which conflicts with the sovereignty rule and is your decision.

### P13 Model routing — ABSORBED into C20 LOCALAI
### P14 Connector runtime — ABSORBED into C27 PLUGINS

Both correct a defect in the crosswalk I authored two passes ago.

**The System Master control plane performs no inference and holds no connector runtime.**
Not one workflow, script or module here calls a model. Model routing is real and already
working on A-01 under Lemonade with a hard-won configuration; connector runtime is already
split by a standing boundary rule between CORE and CONNECTED_ACTIONS.

Listing either as a platform requirement creates a second owner for one capability — the
exact split-ownership defect the Owner Decision Pack spent seven decisions eliminating. I
introduced it when I derived P00-P15 from what the repo runs, and A-01's product layer is
not what this repo runs.

Both decisions name what reverses them: if the control plane ever performs inference or
holds a connector runtime of its own, the requirement returns and this decision should be
superseded rather than stretched.

### Effect

| | Before | After |
|---|---:|---:|
| Contracts owed | 51 | 49 |
| ACTIVE_GAP | 40 | 37 |
| OUT_OF_SCOPE | 5 | 7 |
| Complete | 9 | 10 |
| **Completion** | **16%** | **18%** |

The percentage moved by one contract, not by the absorptions. A disposition decision that
moved the completion number would be one that had quietly counted something as done.

CI now runs 55 Python tests across three suites.

---

## Open after seven passes

1. **33 module contracts** — ten worked examples set the standard.
2. **P07, P08, P09, P10 contracts** — code exists; point me at those four sources and I
   will write them.
3. **Register ingress, receipt and evidence indexing as scheduled tasks; verify across a
   reboot.**
4. **Branch federation** — still the one architecture decision outstanding.


---

## Added in the eighth pass — the platform layer is complete

I read the four sources rather than waiting to be pointed at them. **All 14 owed platform
requirements now have complete foundation contracts.** P13 and P14 are absorbed. There is
no platform gap left.

**P07 admission barrier** — 281 lines, fifteen named refusal states. Documents the
structural ordering that makes it meaningful: `pre_admission_subject_checkout_forbidden`
and `pre_admission_subject_execution_forbidden` are both policy-true, so the barrier sees
only metadata until it admits. Every refusal demands a *fresh dispatch* rather than a
retry in place.

**P08 qualification and PASS semantics** — policy_version 8, runner labels
`self-hosted, Windows, X64`, three gate classes of which only `promotion` carries promotion
authority, four result classes. The classes exist so failure routes correctly: collapsing
them into "failed" is how a healthy subject gets repaired for an infrastructure fault.

**P09 repair broker** — the reconciler's invariant is that state must be reconstructable
from events. A transaction with no `TRANSACTION_OPENED` is an error, not an absence.

**P10 supervisor** — the strongest engineering in the estate, and its contract says so
while naming the gap honestly: `uq_active_claim_per_lane`, monotonic fencing tokens,
`recover` distinguishing `LEASE_EXPIRED` from `HEARTBEAT_STALE`, `audit_invariants` with a
`PRAGMA integrity_check`. None of it proven by anything that runs in CI.

### A finding I withdrew

The P06 contract flagged Bridge run #4's 23-second qualification against a 28-minute budget
as possibly meaning nothing ran. **That was wrong.** `a01-policy.json` settles it:
admission mode is `TRUSTED_SELF_HOSTED_METADATA_ONLY_FOR_NONDISRUPTIVE`, and
`BOOK-SYSTEM-E2E-AUTHORITY-GUARDS-001` is registered `gate_class: focused`,
`source: subject`, running one in-process guard script. A focused guard check completing in
23 seconds is correct behaviour — `qualifier_timeout_minutes` is a ceiling, not an
expectation. I read a budget as a duration. Corrected in P06 §10 and explained in P08 §10.

The registration's own wording was the right reading all along: *"PASS is exact-SHA focused
evidence only"*, granting no lifecycle, publication, promotion or production authority.

### New defects found while writing these

- **P07 §10 — execution-context allowlists disagree across three layers.** The barrier
  accepts `normal | overnight`; the bridge and `normalizeA01Dispatch` accept
  `normal | recovery | repair | overnight`. A `recovery` or `repair` dispatch passes the
  bridge and is refused late at the barrier, consuming a run. Your decision which way to
  resolve; I recommend extending the barrier, since P09 has genuine use for a distinct
  `repair` context. Until then, treat those two contexts as unusable.
- **P09 §10 — no global repair budget.** P12 bounds ingress; nothing bounds repair reruns
  triggered by `workflow_run`. A repair loop can still eat a night.
- **P09 §10 — result-class routing unproven.** Nothing asserts that `INFRA_FAILURE` and
  `CONTROL_PLANE_FAILURE` never open a repair transaction. Highest-risk untested path here.
- **P09 §10 — reconcile not wired into CI.** The ledger can drift with nothing noticing.
- **P08 §10 — no live-proof procedure.** Execution semantics cannot be proven in hosted CI
  because they need the A-01 runner. A runbook plus a recorded run is the honest closure.
- **P10 §10 — five untested behaviours** in the supervisor: contention, stale-token writes,
  the recover SLA boundary, circuit opening, and `audit_invariants` catching seeded
  violations. The highest-value remaining test work in the estate.

### State

```
COMPLETE_WITH_EVIDENCE  14    all 14 owed platform requirements
ACTIVE_GAP              33    all module contracts
DURABLY_BLOCKED          2
OUT_OF_SCOPE             7
                        ---
                        56 entries · 25% complete
```

---

## Open after eight passes

1. **33 module contracts** — the entire remaining gap. Fourteen worked examples now set
   the standard.
2. **Resolve the execution-context mismatch** (P07 §10). Owner decision, and it is small.
3. **The P10 supervisor test suite** — five behaviours, highest value per hour of any
   remaining work.
4. **Wire repair reconcile into CI** (P09 §10).
5. **Register the three scheduled tasks; verify across a reboot.**
6. **Branch federation.**
