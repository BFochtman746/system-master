
# System Master — What Actually Exists

Verified by tracing code, tests, branch trees and commit history across 502 remote branches.
Evidence tier is marked on every row: **[traced]** = read the code/tests; **[docs]** = inferred from filenames/records only.

---

## 1. The trunk — `main` (repaired)

Head includes recovery PRs #83 (`acf97349`) and #84 (`095bed04`).
Checks: audit BLOCKER/HIGH/MEDIUM = 0/0/0, verifier 9/9, 109 local tests passing, Maven root build 193 classes / 51 sources.

| Area | Files | State |
|---|---|---|
| `control-gateway/` | 38 exec (4 Python, 15 JS, 21 tests) | **Real and tested** [traced] |
| `tools/second_shift_supervisor_v2.py` | 1 | Claim/lease/fencing store [traced] |
| `governance/` | ~210 records | Authority + 5 delegation lanes [traced] |
| `system-master/` | 60 Java | Work-package subjects [docs] |
| `tests/` | 12 harnesses | Scheduler/idempotency/adversarial [traced] |

**Runtime code on main for book / documents / learning / spine: zero.** Verified by excluding
`governance/` and `qualification/` and counting — result 0.

---

## 2. The control plane — verified end to end

Traced path of one work item:

1. `governance/second-shift/*-DELEGATIONS.json` (5 lanes) →
2. `enqueue()` → `night_scheduler_queue` table →
3. `A01NightScheduler.tick()` — checks `in_shift(now)`, calls `reconcile()`, orders candidates →
4. `_claim_authorized()` → `UPDATE ... SET state='CLAIMED'` → returns claim with
   `lease_id`, `dispatch_id`, `fencing_token`, `execution_order`, `priority` →
5. **DEAD END — nothing consumes the claim.**

Grepped every Python and JS file on main for `dispatch_id` / `fencing_token`: 13 hits — the
scheduler, the supervisor store, strict-coordination, test files, and one repair ledger script.
**No worker exists.** [traced]

### Current overnight queue (what would run tonight)

| Lane | Delegation | State |
|---|---|---|
| BOOK | `SECOND-SHIFT-BOOK-RECONSTRUCTION-B02-B` | READY |
| CORE | `SECOND-SHIFT-CORE-KNOWLEDGE-RECOVERY-PROGRAMMING-001` | READY |
| DOCUMENTS | `SECOND-SHIFT-DOCUMENTS-SPINE-UNDERSTAND-FORENSIC-PREP-001` | READY |
| LEARNING | `SECOND-SHIFT-LEARNING-CURRICULUM-001E-BATCH-07` | READY |
| CORE / DOCUMENTS / LEARNING | 3 further items | CANDIDATE |

### Three verified defects

1. **No execution plane.** Coordination without a worker (above).
2. **`recover()` never called in production.** Defined `second_shift_supervisor_v2.py:511`;
   7 call sites, all under `tests/`. `tick()` calls `reconcile()` on both paths, never `recover()`.
   Stale leases are never reclaimed → stage barrier wedges. [traced]
3. **"All night" is a bare CLI loop.** `while True: tick(); print(json); sleep(poll_seconds)`,
   `--db` required. No service, no restart, no log, no alert. Dies silently. [traced]

---

## 3. The core system — on branches, not main

Primary branch: `origin/foundation/keel-build-001-20260912` — **144 files / +20,178 lines vs main**.

`system-master/foundation-spine/` (42 files):

| Module | Contents | Tests |
|---|---|---|
| `system-root/` | `AuthorityRegistry.java` (538 lines), `AuthorityJournal`, `FoundationAuthorityBootstrap` | 2 |
| `identity/` | 13 classes — principal registry, lifecycle, enrollment, proofing, journal, mutation gate, alias | 6 |
| `contracts/` | `ContractAuthorityRuntime` | 1 |
| `keel/` | `KeelAuthorityRuntime.java` + design lock + recovery inventory | **0** |
| `planning-orchestration/` | `PlanningOrchestrationAuthorityRuntime` | 1 |

### The 12 foundation work packages

| Package | Java sources | Tests |
|---|---|---|
| f-wp-001 | 4 | 1 |
| f-wp-002 | 2 | 1 |
| f-wp-003 | 5 | 1 |
| f-wp-004 (holds `StandardChangeCatalog.java`) | 5 | 1 |
| f-wp-005 (holds `ApprovalOrchestrator.java`) | 6 | 1 |
| f-wp-006 | 3 | 1 |
| f-wp-007 | 5 | 1 |
| f-wp-008 | 5 | 1 |
| f-wp-009 | 3 | 1 |
| f-wp-010 | 5 | 1 |
| f-wp-011 | 3 | 1 |
| f-wp-012 | 5 | 1 |

**51 sources, exactly one test each.** Never compiled or run together with foundation-spine.

### Named components → where they live

| Name (user's term) | Reality | Location | Tier |
|---|---|---|---|
| **keel** | 1 runtime class + design lock, no test | `foundation/keel-build-001` | traced |
| **multiple foundations** | Confirmed: 12 work packages + `controller-v2/foundation-002…006` + 14 `foundation/*` branches | many | traced |
| **orchestrator** | `planning-orchestration` runtime + 1 qualification test; `ApprovalOrchestrator.java` | `foundation/planning-orchestration-*` | traced |
| **resource manager** | `CORE-RESOURCE-ADMISSION-*` — adjudication receipt, denominator freeze, recovery inventory. **Docs only** | `foundation/core-resource-admission-recovery-001` | docs |
| **data** | `DATA001` restore-binding patch + reconciliation; SMR021 persistence contracts. **Docs/patches only** | `control-v2` | docs |
| **ui/web** | `USEREXPERIENCE001` (4 docs + patch), `PLATFORM005` nav/route repairs, SMR021 UX descriptors. **Docs/patches only** | `control-v2` | docs |
| **assurance** | See §4 — exists as forensics, not as the standards system | `system-master/assurance-reconciliation-001` | traced |
| **creative fabric** | **Does not exist anywhere** — 0 path hits across 502 branches for creative / fabric / media | — | traced |

`system-master/control-v2` (77 files) is almost entirely reconciliation documents and `.patch`
files: PLATFORM001–012, DATA001, USEREXPERIENCE001, OPERATOROPS001, CHAT001A, FOUNDATION007/008,
SMR018–021. Each carries a `*_PARITY_REPAIR_*.patch` plus a `*-RECONCILIATION-*.md`.

---

## 4. Assurance — what was built vs what was intended

**Intended** (user's definition): coding standards system; growing error/mistake registry that the
team learns from; enforcement of high programming standards; self-documenting discoverability —
what's done, where everything is, where things are logged, who owns what.

**Built**: branch `system-master/assurance-reconciliation-001` — `2a7bac4f`,
**27 commits ahead of main, 808 commits behind**, 22 files / +1,804 lines. Contents:

- `RECON-001A` — current-authority system census, evidence source map, status
- `RECON-001B` — A-01 adjudication, CQ003 durability matrix, overnight prequalification, research method, source-custody reconciliation
- `RECON-001C` — successor hold, GitHub import handoff, library bundle verification, status
- `RECONCILIATION-CONTRACT.md`, `SYSTEM-STANDING-CENSUS-001.csv`
- 3 executables: `a01-assurance-recon-001b-deep-census.js`,
  `assurance-recon-001c-sealed-history-verify.js`, `assurance-recon-001c-hosted-selftest.yml`

Every commit subject is `assurance:` or `reconciliation:` — custody, lineage, sealed-history,
adjudication. **Zero coding standards. Zero error/lessons registry. Zero ownership registry.**

Searched all 502 branches for STANDARD / LESSON / ERROR-REGISTRY / ERROR-LOG / MISTAKE /
OWNERSHIP-REGISTRY / CODING. Only artifacts found:
- `f-wp-004/src/main/java/org/systemmaster/core/StandardChangeCatalog.java`
- `qualification/book-system/.../BOOK-SYSTEM-PUBLICATION-EXPORT-STANDARDS-PROFILE-001.json`
- `learning/...STANDARD-CURRICULUM-COMPILER...` (curriculum, not code standards)

**Verdict: the preventive half of assurance was never built.** What exists is its forensic half —
auditing custody after the fact. Note the branch is 808 commits behind main; merging it wholesale
would revert the repairs.

---

## 5. Subsystems

| System | Where | State |
|---|---|---|
| **Book** | `book-system/control-v1` (78 files) + ~13 siblings; partly restored to main via PR #84 | Duplicate variant families (export-freeze ×5, lifecycle, author-decision, integration-proposal). Qualified commit `e2a23e8b` tagged. 1 READY delegation. |
| **Documents / spine** | `documents/control-v1` | 9 pipeline stages (extract, parse, forensics, identify-profile, understand, plan, rebuild, secure, master) × design-lock + forensic-prep = 18 docs. 16 spine Java, **1 test**. Retired states literally read `DESIGN_LOCK_FROZEN__RUNTIME_IMPLEMENTATION_CUSTODY_GATED`. |
| **Learning** | 163 branches (largest namespace) | Cleanest lane: linear BATCH-02→07 supersession chain. No runtime on main. |
| **Foundation closure harness** | `apply-updates-008` only | `foundation-closure-matrix.js`, `-evidence-verify.js`, `scaffold-foundation-contracts.js`, P00–P03 workflows, **and** the qualify scripts for audiobook / automation / browser / calendar / chat / website. Census `SYSTEM-MASTER-FOUNDATION-CLOSURE-CENSUS-001` is ACTIVE on main but **cannot run** — its machinery is here. Branch conflicts with repaired control-plane files. |

## 6. Branch sprawl — 502 branches

| Namespace | Count |
|---|---|
| learning | 163 |
| system-master | 53 |
| book-system | 30 |
| governance | 25 |
| second-shift | 22 |
| second-shift-control-gateway | 20 |
| controller-v2 | 20 |
| qualification / foundation / documents / core | 14 each |
| document | 9 |
| control-gateway-state | 7 |
| prose | 5 |
| (plus `tmp-*`, `noop-do-not-use`, `_do-not-use-placeholder`, etc.) | — |

---

## 7. The single pattern behind all of it

Every subsystem stops at the same boundary. Filenames repeat: DESIGN-LOCK, FREEZE,
RECOVERY-INVENTORY, RECONCILIATION, TRACEABILITY, ADJUDICATION, DENOMINATOR-FREEZE.
Twelve packages with one test each. Keel with none. Documents frozen at
`RUNTIME_IMPLEMENTATION_CUSTODY_GATED`. Control-v2 as 77 reconciliation records.

Authority, contracts and proof scaffolding were built repeatedly and thoroughly; runtime was
built almost never. Each new attempt cut a new branch and re-reconciled the same ground — which
is what produced 502 branches, a near-empty main, and the sense of nonstop work with nothing
running.

This is precisely the failure mode assurance-as-intended was meant to prevent.


---

## 8. Verified build state — branch `core/consolidation-001`

First time foundation-spine and the 12 work packages have ever been compiled and tested together.

```
mvn -o compile                 SUCCESS
compiled classes               371  (178 org.systemmaster.foundation, 193 org.systemmaster.core)
qualification tests            21/21 PASS
```

| Module | Sources | Tests | Result |
|---|---|---|---|
| system-root | 3 | 2 | PASS |
| identity | 13 | 6 | PASS |
| contracts | 1 | 1 | PASS |
| planning-orchestration | 1 | 1 | PASS |
| **keel** | 1 | **1** | **PASS — 23 cases / 41 checks** |
| f-wp-001..012 | 51 | 12 | 12/12 PASS |

Updated after the keel gap was closed: `mvn -o compile` SUCCESS at 374 classes,
full suite **22/22 PASS**. `KeelAuthorityQualificationTest` covers the non-expanding
refinement algebra (every reason code the evaluator emits: HARD_CONSTRAINT_WEAKENED /
_REMOVED, DELEGATION_ and RESOURCE_CEILING_EXPANDED, ALLOWED_ACTION_EXPANDED,
FORBIDDEN_ACTION_REMOVED, HITL_REQUIREMENT_WEAKENED, SOFT_CONSTRAINT_UNDISPOSITIONED,
UNKNOWN_COMPARATOR), the contract-gate and principal authority gates, command idempotency
and replay conflict, optimistic revision concurrency, hash-chained journal tamper and
truncation detection, and retirement terminality.

`Fwp001QualificationTest` requires two arguments (reconstructed traceability CSV + baseline
binding). Run bare it throws usage; supplied correctly it reports
`PASS F-WP-001 tests=12 requirements=60`. Fixture sha256 verified against
`SOURCE-SLICE-MANIFEST.json`. It fails identically on unmodified `main`, so consolidation
introduced no regression.

### Other six systems — runtimes recovered from `apply-updates-008`

`tools/{audiobook_builder,automation_plan,browser_action_plan,calendar_action_plan,chat_turn_plan,website_builder}.py`
(1,787 lines total) plus their six qualify scripts and the closure harness were stranded on
that branch and are now on this one.

| System | Runtime | Qualify result |
|---|---|---|
| automation | 163 lines | **PASS** — AUTOMATION-FOUNDATION-1.0 |
| browser | 317 lines | **PASS** — BROWSER-FOUNDATION-1.0 |
| calendar | 384 lines | **PASS** — CALENDAR-FOUNDATION-1.0 |
| chat | 294 lines | **PASS** — CHAT-FOUNDATION-1.0 |
| audiobook | 372 lines | **PASS** — AUDIOBOOK-FOUNDATION-1.0 |
| website-building | 257 lines | **PASS** — WEBSITE-BUILDING-FOUNDATION-1.0 |

**All six PASS (was 0/6).** Two recoveries were required, both from `apply-updates-008`:
the governance chain (`CAPABILITY-CROSSWALK-003.json` + `TOOL-OWNER-ALLOCATION-006.json`,
36 ownership rows, 0 mismatches against the crosswalk) and the six qualification corpora
under `qualification/`. `CURRENT-AUTHORITY-003` did not carry a `capability_crosswalk` key
at all; it now names crosswalk-003, and `headless_tool_owner_allocation` moved from
`ALLOCATION-004` (zero ownership rows, different schema) to `ALLOCATION-006`.

`foundation-closure-matrix.js` advanced past `CROSSWALK_ABSENT` and now stops at
`EVIDENCE_REGISTRY_AUTHORITY_MISMATCH registry=CURRENT-AUTHORITY-005
authority=CURRENT-AUTHORITY-003`. **Left failing deliberately** — the registry's receipts
carry exact subject blob bindings authored under `-005`; relabelling them to `-003` would
clear the gate by making every receipt a false statement. This is an authority-reconciliation
decision for the owner (see LESSONS.md L-009), not a code defect.

## Full repository sweep — branch inventory

The complete branch evaluation lives in **`BRANCH-INVENTORY.md`** (human entry
point) and **`governance/branch-catalog/`** (25 files: per-area TSV shards plus
INDEX.md). Read those before concluding that anything is missing.

| Fact | Value |
|---|---:|
| Remote branches swept | 503 |
| Fully merged into main (deleted this pass) | 79 |
| Remaining branches | 424 |
| Unmerged carrying unique content | 329 |
| Unmerged partially rescued | 84 |
| Author-marked garbage (tmp-/noop-/do-not-use) | 8 |
| Unique file paths existing off main | 3,651 |
| Paths existing on exactly ONE branch | 837 |
| Sole-custodian branches (must not delete) | 147 |

**Consolidating a lane's tip does not work and was not used.** Ancestry was
tested per lane: the learning tip contains 75 of 162 siblings (46%),
book-system 11 of 29, system-master 2 of 28. The lanes diverge and rejoin, so
the tip is not a superset and taking it would silently drop content.

Because of that, the unit of organization is the **file**, not the branch. The
catalog maps every off-main path to the branch holding its newest version, so
any stranded file is recoverable with a targeted checkout:

```sh
git checkout origin/<newest_branch> -- <path>
```

This is the same targeted-path recovery used for the six other-system runtimes,
the capability crosswalk chain, and the six qualification corpora — never a
wholesale branch merge.

**Naming caution.** There is no standalone `control-v1` branch. The name always
carries a lane prefix: `book-system/control-v1`, `documents/control-v1`,
`learning/control-v1`. A bare `control-v1` reference resolves to nothing and
will read as data loss when none occurred.
