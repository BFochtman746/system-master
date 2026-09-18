# System Master — Authority-Derived System Map

Generated from `CURRENT-AUTHORITY-005` + `SYSTEM-TOPOLOGY-007`. This is the human-readable ownership map; machine truth lives in the selected authority, topology, completion, obligation and capability records named below.

## Topology

```text
SYSTEM_MASTER  (product root; INCOMPLETE)
├── CORE                (INCOMPLETE)
├── LEARNING            (INCOMPLETE)
├── BOOK                (INCOMPLETE)
├── DOCUMENTS           (INCOMPLETE)
├── SPREADSHEET_DATA    (INCOMPLETE)
├── MEDIA               (INCOMPLETE)
├── CONNECTED_ACTIONS   (INCOMPLETE)
├── RESEARCH_KNOWLEDGE  (INCOMPLETE)
└── PROGRAMMING         (INCOMPLETE)
    ├── C01 AUTOMATION
    ├── C05 CODE
    └── C40 WEBSITE_BUILDING

PROSE  (historically COMPLETE; RETIRED_TERMINAL; no current lane)
```

Exactly nine active peers exist. `WEBSITE_BUILDING` is C40 under Programming and is not a tenth peer.

## Canonical ownership map

| Peer | Capability ownership / semantic boundary |
|---|---|
| CORE | Shared Foundation & Spine; CHAT, EXPECTATION, EXPERIENCE, LOCALAI, PROJECTS; common platform/runtime/control infrastructure |
| LEARNING | CURRICULUM, LEARNING |
| BOOK | MANUSCRIPT, STORYBIBLE, WRITING; canonical Book/manuscript/lifecycle/author/publication state; any genuinely open integration of preserved completed Prose capability |
| DOCUMENTS | DOCX, FILE, IMG-INGEST, OCR, PDF, PPTX; generic document/artifact mechanics; no Prose work |
| SPREADSHEET_DATA | DATA, EXCEL, LEDGER, MATH |
| MEDIA | AUDIOBOOK, IMAGE, MEDIA, PHOTO, VIDEO, VOICE |
| CONNECTED_ACTIONS | BROWSER, CALENDAR, COMMS, PLUGINS; user/external side-effect policy remains here |
| RESEARCH_KNOWLEDGE | GEO, KNOWLEDGE, RESEARCH |
| PROGRAMMING | AUTOMATION, CODE, WEBSITE_BUILDING C40; software-engineering semantics and preserved Programming continuity |

Capabilities C35 AIINCOME, C36 CAD, C37 PHONEOPS, C38 PHYSICALAI and C39 PORTFOLIO retain the explicit non-owned/deferred dispositions in the canonical crosswalk. C41-C49 remain reserved/unallocated. Reserved IDs are not renumbered.

## Registered implementation subsystems

Implementation-subsystem registration satisfies `STANDARDS.md` S-05 and does **not** add a peer, move semantic ownership, or create a new authority domain.

| Subsystem | What it is | Repository path | Tests | Owner | Logs / evidence |
|---|---|---|---:|---|---|
| `learning-handler-binding-001` | Thin, transport-neutral inbound registration/adaptation seam for the frozen Learning/Curriculum command/query contracts. CORE remains router/dispatcher and generic physical-persistence-mechanics owner; LEARNING remains sole owner of Learning/Curriculum semantic state and operation meaning. | `system-master/learning-handler-binding-001/` | 10 runnable qualification entry points covering 52 local Learning/Curriculum seams, including I032, I056-I074, I076-I077, and I088; CORE-owned I021/I022/I031 and the I075 shared sync-reconciliation boundary remain peer dependencies. Portable qualification is exact-subject evidence only and does not imply production route, UoW, idempotency, persistence, or production-bound closure. | `LEARNING` (`CURRICULUM` + `LEARNING` semantics) | `Required Verification / required-verification`; Maven `target/surefire-reports/`; Learning handler-binding governance receipts |
| `research_knowledge_source_query` | Bounded RESEARCH_KNOWLEDGE-owned `QUERY` provider for source/provenance projections consumed by BOOK. It validates Book request identity, authorization/classification preconditions and source provenance while leaving external browser execution with CONNECTED_ACTIONS, physical artifact mechanics/classification semantics with CORE, and Book admission/canonical writes with BOOK. | `tools/research_knowledge_source_query.py` | 12 runnable focused tests plus auto-discovered qualifier; external production execution remains blocked until exact CORE classification and CONNECTED_ACTIONS provider bindings exist. | `RESEARCH_KNOWLEDGE` (`RESEARCH` semantics) | `Required Verification / required-verification`; `.github/scripts/research-knowledge-source-query-qualify.py`; `RESEARCH-KNOWLEDGE-PUBLIC-SOURCE-QUERY-OPERATIONS-001` |

## Platform requirements P00-P15

Platform requirements are dependencies, not peer systems. They remain CORE-owned shared infrastructure unless the canonical crosswalk marks an absorbed dependency. P00 is the authority pointer, P01 topology/ownership, P02 obligation registry, P03 evidence retention, P04 content-addressed authority writes, P05 governance validation, P06 control-gateway admission, P07 A-01 barrier, P08 qualification semantics, P09 repair lineage, P10 Second Shift supervisor, P11 night scheduler, P12 GitHub ingress, P13 model routing/local inference (absorbed into C20), P14 connector action runtime (absorbed into C27), and P15 observability/morning receipt/rollback.

## Enforcement subsystem directories

| Directory | Platform requirement | Responsibility |
|---|---|---|
| `system-master/control-gateway-lock` | P06 control-gateway admission | Single-writer admission for governed system files. Provides the mutual exclusion that the pre-existing machinery did not: `ExecutionLeaseManager` (F-WP-007) fences a *stale* writer but `acquire()` unconditionally grants a new epoch, so a *second concurrent* writer was never refused. This subsystem adds per-path exclusion on top of it, an expected-revision precondition reusing `ChangeRegistry` (F-WP-002) optimistic-concurrency semantics, and refusal of any session without an admitted recovery contract. The `*-LOCK-*.json` governance records remain ownership decisions, not mutexes. |
| `system-master/execution-claims` | P10 Second Shift supervisor, P11 night scheduler | Claim lifecycle and consumer: `READY -> CLAIMED -> (DONE \| FAILED)`, with bounded `recover()` readmission to `READY` and terminal `DEAD` on `ATTEMPT_LIMIT_EXHAUSTED`. `ClaimLedger.Consumer.tick()` calls `recover()` first, then executes at most one claim, writes an append-only evidence receipt, and terminalizes. Reuses `ExecutionLeaseManager` for epochs, fence tokens and trusted-time admission; the one-consumer-per-claim decision is made here because `acquire()` deliberately does not refuse a second live holder. Terminalizing without a receipt for the current epoch is refused, so a completed claim always has evidence behind it. |
| `system-master/execution-driver` | P10 Second Shift supervisor, P11 night scheduler, P15 observability/morning receipt/rollback | The unattended launcher. `ClaimDriver` runs `ClaimLedger.Consumer.tick()` inside two independent ceilings — an iteration count and a wall-clock budget — and always reports an explicit stop reason (`QUEUE_DRAINED`, `ITERATION_LIMIT`, `BUDGET_EXHAUSTED`) plus counts of readmitted, dead-lettered, completed and failed claims. Both ceilings are mutation-proofed. `ActionsDispatch` is the production dispatch: it posts `workflow_dispatch` to `claim-work.yml`, and refuses loudly with `DISPATCH_NO_CREDENTIAL` / `DISPATCH_MISCONFIGURED_*` / `DISPATCH_REJECTED_<http>` / `DISPATCH_TRANSPORT_FAILURE` rather than degrading silently — every refusal lands in the claim's evidence trail. `ClaimDriverMain` is the entry point invoked by `.github/workflows/claim-driver.yml`; the queue is `execution/claims/queue`. `ActionsRunPoller` (landed `36d0037c`) closes the completion gap as a **decorator at the `Dispatch` seam** — `ClaimLedger` is unmodified. Wrapped, a claim terminalizes `DONE` only after the correlated run concludes `success`, with the run id in the receipt; a non-success conclusion throws and the existing path terminalizes `FAILED`. **Unwired, the digest stays `ACTIONS_DISPATCHED`** — acceptance by Actions, not completion, since `workflow_dispatch` returns 204 with no run id. See "Run completion polling" below for what is and is not wired. |

Enforced on pull requests by `.github/workflows/system-file-lease-enforcement.yml`, which audits `System-File-Lease` commit-trailer receipts so a lease-less mutation to a governed path stays detectable from git history alone. Its two required status checks are `Governed mutations carry lease receipts` and `Single-writer runtime qualification`. Operation identity (`System-Operation: <ID>`) is read from the **pull-request event payload** (title or body) — never from a commit trailer, and never re-read live. A re-run of an existing run therefore replays the original payload: after editing a PR title or body, a **new commit** is required to produce a fresh event. `SYSTEM_OPERATION_ID_REQUIRED` with `operation=NONE` is that situation, not a Node version warning.

Path scope, because these two lists are routinely confused: a `System-File-Lease` trailer is required only for the narrow governed paths under `governance/`. Operation identity is required for a wider set including all of `control-gateway/**`. A change under `control-gateway/test/` therefore needs an operation id and **no** lease trailer.

### Session admission

| Subsystem | Runtime | Test | Status |
|---|---|---|---|
| `chat-session-admission` | `control-gateway/src/chat-session-admission.js` | `control-gateway/test/chat-session-admission.test.js` (6 cases, 8 assertions) | On `main` and passing. Consolidated 2026-09-17: the test previously sat at `tests/chat-session-admission.test.js`, where its relative import resolved to a repo-root `src/` that does not exist, so it was an orphan that could never run; the runtime existed only on a branch. The test was relocated byte-identically (blob `2750a899`) and the orphan copy deleted. Do not create a third copy. |

### Bootstrap / authority bootstrap — inventory before you write another one

**Sessions keep concluding this does not exist and rebuilding it. It exists, on `main`, and it is tested.** Read this section before writing any bootstrap, boot, init, startup or authority-bootstrap controller.

**Correction, 2026-09-17.** An earlier revision of this section claimed three duplicate on-`main` bootstrap versions, all ungated, with the off-`main` controller-v2 pair as the only tested version. **Every one of those claims was false**, and they were written here without checking the tree. Verified facts follow; the false rows are recorded as corrected rather than silently replaced, because this document being wrong is the same disease as this document being silent.

On `main` the bootstrap is **one coherent two-layer implementation**, not duplicates:

| Layer | Path | Size | Reality |
|---|---|---:|---|
| Library (the substance) | `control-gateway/src/github-authority-bootstrap.js` | 169 lines | Create-only genesis authority write. **Not** in `.github/scripts/` — an earlier revision of this table said so and was wrong. |
| CI wrapper (entry point) | `.github/scripts/control-gateway-authority-bootstrap.js` | 67 lines | **Imports the library** (`../../control-gateway/src/github-authority-bootstrap.js`). A thin driver, not a second implementation. Earlier claim of "41 lines" was wrong. |
| Test | `control-gateway/test/github-control-adapter-repair.test.js` | 21 cases | **21/21 pass.** 17 are bootstrap cases with real negative proofs: invalid namespace, mismatched head, packet/publication digest mismatch, concurrent race, post-write mismatch, unauthorized writer App slug, invalid installation id. |
| Local gate | `.github/scripts/control-gateway-authority-bootstrap-qualify.js` | — | Added 2026-09-17. See "the gate that was actually missing" below. |

Driven in production by `.github/workflows/control-gateway-authority-bootstrap.yml` and `control-gateway-native-bootstrap-ingress.yml`; qualified in CI by `p04-content-addressed-authority-write-foundation-qualification.yml`, which reads both files, validates the P04 implementation pointer, and binds them as exact-SHA subjects.

**The gate that was actually missing.** The earlier claim "ungated — no qualifier covers it" was wrong: CI gated this path all along. The real gap was narrower and had gone unnoticed — `verify.sh` discovers qualifiers only from `.github/scripts/*qualify*`, while the bootstrap test lives under `control-gateway/test/` and was reachable **only** from CI workflows. The path was gated in CI and **ungated locally**, so no pre-push run could catch a bootstrap regression. `control-gateway-authority-bootstrap-qualify.js` closes that: it runs the existing test with a pinned TAP reporter, asserts a floor of 21 passes, and additionally asserts the wrapper still imports the library — because a wrapper that stopped importing it would leave every test green while the production path did nothing.

### Run completion polling

| Item | Path | Status |
|---|---|---|
| `ActionsRunPoller` | `system-master/execution-driver/src/main/java/org/systemmaster/core/ActionsRunPoller.java` | On `main` as of `36d0037c`. Decorator over any `ClaimLedger.Consumer.Dispatch`; `ClaimLedger` unmodified. |
| Qualification | `.../ActionsRunPollerTest.java` | **47 checks, 0 failures** (`ACTIONS-RUN-POLLER-1.0`). Locally gated — see the discovery rules below. |

Rebuilt from the seams, not recovered: an earlier version existed only in a scratch worktree and was lost. Do not look for it on a branch.

**Correlation is by identity, boundary-checked.** `workflow_dispatch` returns no run id, so the run is found by matching the claim id in the run title. Matching requires whole-token boundaries because plain `contains` would let claim `job-1` be satisfied by the run for `job-11` — terminalizing one claim on another's outcome. Mutation-proved: removing the check makes `job-11` satisfy `job-1`.

**Two bounded phases, two deliberately distinct refusal codes.** Each phase carries both an attempt ceiling and a wall-clock budget, because attempts cannot bound a phase whose polls block and a clock cannot bound one whose polls return instantly. All four bounds are mutation-proved.

| Code | Means |
|---|---|
| `DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW` | Actions accepted the dispatch, but no correlated run ever appeared. Suspect the workflow or the trigger. |
| `DISPATCH_POLL_BUDGET_EXHAUSTED` | The run was found and was still running when the budget ran out. The executor is slow or wedged, not missing. |

Collapsing those two into one code would make "nothing ever started" indistinguishable from "still going" in the evidence trail. Also refuses, each by its own code: `DISPATCH_RUN_QUERY_FAILURE:<Type>` (a broken query is specifically prevented from decaying into a not-found verdict, which would misreport a transport fault as a missing run), `DISPATCH_CORRELATION_AMBIGUOUS`, and `DISPATCH_RUN_CONCLUDED_<CONCLUSION>` for every non-success terminal state.

**Scope limit, stated because a green claim would otherwise imply more.** `DONE` means "the dispatched run completed" **only for a consumer wired with this poller**. Nothing in production is wired yet.

### What is gated where — the two discovery rules

Whether a new test actually protects anything depends on which of these it satisfies. Both are mechanical; neither involves registering the test anywhere.

1. **Script qualifiers** are discovered by `verify.sh` from `.github/scripts/*qualify*` only. A test living anywhere else — `control-gateway/test/`, for instance — is reachable from CI workflows but **invisible to a local pre-push run**. That gap is what hid the bootstrap path locally; `control-gateway-authority-bootstrap-qualify.js` exists to close it.
2. **Java qualifications** are auto-discovered by `verification/.../QualificationBridgeTest`, which walks compiled `target/classes/**/*Test.class` and invokes each `main(String[])`. So any Java qualification that compiles is gated by plain `verify.sh` automatically — this is why `ActionsRunPollerTest` moved the count from 35 to 36 with no registration step. The bridge holds a discovery floor (`MIN_EXPECTED_CLASSES`) so that if compilation ever stops producing these classes, the suite fails loudly instead of returning a green run of nothing.

### A distinct component, deliberately not merged

`FoundationAuthorityBootstrap.java` (142 lines, `system-master/foundation-spine/system-root/`) is **not** another version of the above and must not be merged into it. It bootstraps the **in-process Java authority registry** — `createRegistry()`, `bootstrap(journal)`, `expectedAuthorityIds()`, `PRODUCT_BINDING_ID` with 27 root children — whereas the JS pair performs a **content-addressed authority write to GitHub**. Different substrate, different failure modes. It is covered by `AuthorityRegistryQualificationTest` and `AuthorityRegistryPerformanceTest`, and compiles as part of the 561-class build. Registered here as a separate component so the name similarity stops being rediscovered as duplication.

### Off-`main` versions — dispositions decided

| Version | Where | Verified content | Disposition |
|---|---|---|---|
| controller-v2 pair: `github-control-state-bootstrap.js` + `live-c2-initialize.js` | `controller-v2/execution-001b-forensic-restart`, `controller-v2/foundation-002b` | 29-line src + 20-line test (4 cases `BCS-T001`-`T004`); 37-line src + 32-line test. Creates two sibling git refs `controller-journal/v1` / `controller-anchor/v1` with empty journal checkpoints. | **Deliberately abandoned.** A *subset* on a different, abandoned architecture — not a superset of main's version. 4 test cases against main's 17; 29 lines against main's 169. The earlier claim that this was the "best-tested" version was wrong. Recovering it would regress capability. |
| root-authority-registry module: `BootstrapManifest.java`, `RootAuthorityRegistryBootstrapCli.java`, `FileAuthorityRegistryStore.java`, `RegistrySnapshotCodec.java`, generator, `qualify.sh`, workflow, 2 tests | `foundation-root-authority-registry` (**sole custodian**) | A complete 9-class module carrying **registry persistence** — a capability `main` genuinely lacks, since `FoundationAuthorityBootstrap` builds an in-memory registry only. | **Recover — queued, not abandoned.** Real capability, but landing a new Maven module with 9 classes and 2 tests wired into the build is its own pass. **Do not delete this branch**; it is the only custodian. |

`governance/contracts/P04-FOUNDATION-CONTRACT-001.md` names `control-gateway/src/github-authority-bootstrap.js` as the P04 implementation. Treat the contract as **intent**; the evidence that the runtime satisfies it is the 21-case test and the CI qualification above, not the contract text.

### Known absent — do not infer these exist

Recorded so a session stops re-deriving the same absence:

- **No registry persistence on `main`.** `FoundationAuthorityBootstrap` builds an in-memory registry; the persistence-capable module is off-`main` on `foundation-root-authority-registry` (see dispositions above).
- **No durable claim ledger.** The ledger is in-memory; a claim abandoned by a crashed *runner* is not resumed by the next run.
- **Run polling exists but is not wired into production.** Corrected 2026-09-17: an earlier revision said `ActionsRunPoller` was branch-only, compiled, and untested. It is now on `main` (`36d0037c`) with 47 passing checks and five mutation proofs. What remains absent is the **wiring**: `ClaimDriverMain` still constructs a bare `ActionsDispatch`, so for scheduled runs `DONE` still attests acceptance only. Two preconditions blocked wiring; **the first is now closed** — `claim-work.yml` sets `run-name: Claim Work [<claim id>]`, so the run title carries the claim id, and `ClaimWorkCorrelationTest` reads that YAML and proves the rendered title correlates through the real matcher, so the workflow and the Java cannot drift apart silently. Still open: no production `Runs` implementation exists yet — the poller's query seam has test fakes only.
- **No scheduler beyond what `execution-claims` / `execution-driver` actually implement.** Governance records describing a scheduler are not evidence one runs.

### Correction: execution runtime status

Before `execution-claims` landed, **no scheduler runtime existed anywhere in this repository.** There was no `recover()`, no `tick()` loop, and no claim, consumer, executor, supervisor or worker class in any of the 80 Java sources on `main`. The execution vocabulary appeared only in governance records and CI scripts — `STALE_DELEGATION` in the repair broker, the second-shift enforcement scripts — describing behaviour that had never been implemented. Nothing ever failed because there was no code to fail.

This is recorded here because the absence was repeatedly mistaken for a wiring gap: earlier reports described `recover()` as "existing in five files but never called outside tests", which was not true of the tree. Treat P10/P11 as **implemented at the run level and not yet durable across runs**: the claim lifecycle, single-consumer exclusion, bounded readmission and crash-resume barrier are real and tested as of `execution-claims`; the periodic driver, its two ceilings, and the production GitHub Actions dispatch are real and tested as of `execution-driver`, scheduled by `.github/workflows/claim-driver.yml`. Two limits remain, and neither should be inferred away from a green claim: (1) the ledger is **in-memory**, so a claim's lifecycle completes within one run and receipts are published to the run summary rather than committed — a claim abandoned by a crashed *runner* is not resumed by the next run, only a claim abandoned by a crashed *consumer within* a run; (2) a `DONE` claim from the **scheduled driver** attests that Actions **accepted** the dispatch, not that the dispatched run succeeded, because `workflow_dispatch` returns no run id — completion proof is available (`ActionsRunPoller`) but not yet constructed by `ClaimDriverMain`. Do not read a governance record describing a scheduler as evidence that one runs.

## Completion and execution truth

`SYSTEM_MASTER` and all nine active peers are product-level incomplete. PROSE is historically complete and terminally retired. Repository execution readiness does not grant human, private-data, native-device, credential, production, publication, external-provider, or user-action authority.

Programming admission preserves earlier work-program evidence. Exact-SHA qualification and receipts remain bound to their original subjects; the authority transition does not relabel or broaden them.

## Current objective map

- Central objective: `FOUNDATION-1-0-CLOSURE-001` (CORE-administered; closes C00-C49 / P00-P15 dispositions without taking peer semantics).
- Highest discretionary objective: `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` (CORE-administered custody/provenance support for Programming; not Programming product ownership).
- Current Programming continuation: `PROGRAMMING-WORK-PROGRAM-CONTINUATION-001` under `SYSTEM_MASTER/PROGRAMMING`.

## Selected records — one coherent authority set

| Role | Selected record |
|---|---|
| Authority | `governance/CURRENT-AUTHORITY.json` → `CURRENT-AUTHORITY-005` |
| Topology | `governance/SYSTEM-TOPOLOGY-007.json` |
| Ratification | `governance/ADR-0006-PROGRAMMING-PEER-ADMISSION-WEBSITE-BUILDING.md` |
| Completion status | `governance/SYSTEM-COMPLETION-STATUS-002.json` |
| Obligation registry | `governance/WORK-OBLIGATION-REGISTRY-013.json` |
| Capability crosswalk | `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json` |

Any derived document that reports a different peer count, treats Programming as non-peer, promotes Website Building to a peer, assigns Prose work to Documents, or reopens PROSE is stale architecture and must not dispatch work.
