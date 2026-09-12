# BOOK-RECONSTRUCTION-B01-A3 — RETIRED-IDENTITY DEPENDENCY LEDGER / REBIND REQUIREMENT CENSUS 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Parent head: `e0a1e24997fd241fa5b5e1cefb32e2364f1e16b5`
Standing: `B01-A_ARCHAEOLOGY_LOSSLESS_FOR_BOUNDED_EXECUTION_FOUNDATION_SCOPE__REBIND_REQUIREMENTS_24_OF_24_ACCOUNTED__NO_PASS_TRANSFER`
Canonical effect: NONE

## Bounded source surface

This census covers the exact B01 execution-foundation surface admitted by B00 freeze: capability/service contracts, Context Compiler, capability routing, workflow state, execution planning, scheduler, durable persistence/recovery, concurrency, retry/idempotency/reconciliation, failure semantics, cancellation/resume, execution evidence/provenance, and Book admission handoff.

Current reachable runtime source was enumerated from `system-master/book-system/` at the live owner and includes the workflow runtime files named below. The only current direct runtime test files in that directory for this execution-foundation slice are:

- `book-workflow-durable-store.test.js` blob `7fdc040938c142125ad811579c41af724cab766a` — 14 bounded local cases;
- `book-workflow-scheduler-runtime.test.js` blob `23812ee310a3bd9b8f6410510f0a745efceb6ee6` — bounded scheduler/restart/authority-fence checks.

Other current execution-foundation semantics are represented by their exact source plus the historical packet contract/closure corpus under `qualification/book-system/book-prose-integration/orchestrator/`. Those closure records are requirements/provenance only for B01 reconstruction. Historical PASS never transfers to changed B01 bytes.

The Context Compiler is recovered from exact historical qualified subject `6a488b45497c3a60fb3a23bab640a6a7ca372246` with runtime/schema/qualifier blobs recorded in A2 and historical hosted 44/44 evidence classified `PROVENANCE_ONLY__NO_PASS_TRANSFER`.

## Retired-identity reference classes

Every in-scope occurrence is classified under one of four meanings:

- `HISTORICAL_PROVENANCE_IDENTITY` — may remain immutable to identify completed historical provider/evidence subjects.
- `PROVIDER_IMPLEMENTATION_IDENTITY` — may remain in evidence or adapter configuration but grants no owner lane or canonical authority.
- `BOOK_INTEGRATION_IDENTITY_REQUIRES_REBIND` — current orchestration/routing identity must become Book-owned before dispatch is legal.
- `INVALID_ACTIVE_OWNER_RESIDUE` — must never be interpreted as current topology ownership or a resurrected Prose lane.

### Path-level dependency ledger

| Path / object | Exact stale identity dependency | Classification | Required reconstruction treatment |
|---|---|---|---|
| `BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002.json` | `PROSE_ANALYSIS_AND_REVISION`, `PROSE_SYSTEM`, `SYSTEM_MASTER/BOOK/PROSE`, old `BOOK_EVALUATION` Prose classification | `HISTORICAL_PROVENANCE_IDENTITY + INVALID_ACTIVE_OWNER_RESIDUE` | Preserve exact historical contract as evidence; do not dispatch it as an active owner. A new Book-owned integration projection/adapter contract may reference preserved provider operations without changing provider evidence truth. |
| `book-capability-routing-interface.js` + routing contract | `PROSE.*` capabilities and `/PROSE` owner paths | `BOOK_INTEGRATION_IDENTITY_REQUIRES_REBIND` | Replace current dispatch identity with Book-owned adapter capability identity; preserve exact underlying provider service/operation identity separately as provenance. |
| recovered Context Compiler | explicitly rejects active `SYSTEM_MASTER/BOOK/PROSE`; uses Book integration owner/consumer roles | `REUSABLE_RUNTIME_NOT_REACHABLE` | Rebind exact recovered runtime/schema/test behavior into current B01 lineage; do not weaken the retired-Prose rejection. |
| `book-workflow-execution-plan.js` | specialist task validity resolves through stale routing | `TRANSITIVE_REBIND_REQUIRED` | Keep task/DAG/authority semantics; consume only current Book-owned routing identities after rebind. |
| `book-workflow-scheduler-runtime.js` | intentionally withholds `PROSE.*`, `/PROSE`, `PROSE_ANALYSIS_AND_REVISION`, `BOOK_EVALUATION` | `CURRENT_FAIL_CLOSED_GUARD` | Preserve the guard. New Book-owned adapter capabilities become separately eligible only after current contract qualification; old identities remain withheld permanently. |
| `book-workflow-concurrency-rules.js` + contract | capability policy includes `PROSE.*`; generation special case | `BOOK_INTEGRATION_IDENTITY_REQUIRES_REBIND` | Preserve policy class and non-idempotent serialization; bind to current Book adapter capability, not retired Prose owner. |
| `book-workflow-retry-idempotency-rules.js` + contract | `PROSE.GENERATE_REVISION_CANDIDATE`, service `PROSE_ANALYSIS_AND_REVISION`, historical Registry-v2 subject | `BOOK_INTEGRATION_IDENTITY_REQUIRES_REBIND + HISTORICAL_PROVENANCE_IDENTITY` | Preserve operation identity, service-operation idempotency truth and reconcile-before-regenerate law. Current execution contract must bind current adapter identity and exact admitted provider contract version separately. |
| `book-workflow-failure-semantics.js` | provider classification resolves through routing/retry | `TRANSITIVE_REBIND_REQUIRED` | Preserve failure taxonomy/evidence; use rebound current capability identity. |
| `book-workflow-cancellation-resume.js` | interrupted provider identity/resume logic resolves through routing/retry | `TRANSITIVE_REBIND_REQUIRED` | Preserve exact operation identity and reconciliation state across pause/restart; use rebound current capability identity. |
| `book-workflow-evidence-provenance.js` | provider/capability receipt identity transitively resolves through routing/retry | `TRANSITIVE_REBIND_REQUIRED` | Record both current Book adapter identity and immutable underlying provider implementation/evidence identity; neither may imply canonical authority. |
| `book-workflow-book-admission-handoff.js` + contract | candidate provenance hard-coded to `PROSE.GENERATE_REVISION_CANDIDATE`; old law says `/PROSE` remains literary specialist | `BOOK_INTEGRATION_IDENTITY_REQUIRES_REBIND + INVALID_ACTIVE_OWNER_RESIDUE` | Preserve candidate digest/output/evidence/author refs and fixed Book admission target; candidate producer must be a current Book-owned integration capability with provider provenance nested as evidence. Old `/PROSE` law is historical only. |
| `book-workflow-state-model.js` | no direct retired owner dependency | `CURRENT_REUSABLE` | Preserve unchanged unless exact B01 qualification finds a required compatibility adaptation. |
| `book-workflow-durable-store.js` | no direct retired owner dependency | `CURRENT_REUSABLE` | Preserve coordination-only persistence, CAS/version fencing, restart recovery, append-only evidence; no native/production durability inference. |

## Lossless rebind invariant ledger — 24 / 24 accounted

Each row is a requirement that must survive any B01 current-owner rebinding. `Test/evidence` identifies current direct tests where present and otherwise the exact contract/closure corpus that supplies the reconstruction requirement; closure PASS is provenance only until fresh B01 qualification.

| ID | Requirement / invariant | Current implementation / durable state | Interface / contract | Test / evidence source | Environment standing | Blocker / disposition |
|---|---|---|---|---|---|---|
| RB01 | Current execution ownership for preserved literary capability is `SYSTEM_MASTER/BOOK`, never an active Prose lane | scheduler retirement guard; recovered Context Compiler | CURRENT-AUTHORITY-003 + Context Compiler contract | scheduler test retirement fence; historical Context Compiler 44-case receipt | portable/history only | `DESIGN_REBIND_REQUIRED` |
| RB02 | Historical Prose/provider identity remains immutable provenance and is not silently rewritten | evidence/provenance receipts, service registry identity | Registry v2 + evidence contract | exact historical contract/closure corpus | historical exact-subject | `PRESERVE` |
| RB03 | Old `PROSE.*` capability IDs remain non-dispatchable after retirement | scheduler withheld-task state | routing + scheduler policy | current scheduler test explicitly expects retired Prose dispatch count zero | current source test, not hosted B01 qualification | `PRESERVE_FAIL_CLOSED` |
| RB04 | Book-owned adapter identity and underlying provider/service/operation identity are distinct fields | not yet first-class in current routing | new B01 adapter/rebind contract required | A2 recovery + Registry v2 envelope identity rules | not yet qualified | `DESIGN_REQUIRED` |
| RB05 | Context compilation binds exact manuscript source identity | recovered compiler package | Context Compiler schema | historical 44-case exact-subject evidence | provenance only | `REBIND_RUNTIME` |
| RB06 | Context compilation binds exact Book state version/digest | recovered compiler package | Context Compiler schema | historical stale-Book-state cases | provenance only | `REBIND_RUNTIME` |
| RB07 | Context compilation binds exact Story Bible snapshot/version/digest | recovered compiler package | Context Compiler schema | historical stale-Story-Bible cases | provenance only | `REBIND_RUNTIME` |
| RB08 | Context compilation binds exact service/capability contract identity and fails stale | recovered compiler package | Context Compiler schema | historical service-registry stale case | provenance only | `REBIND_RUNTIME` |
| RB09 | Unresolved required author decisions block execution; automation never invents them | workflow authority waits + compiler author binding | Context Compiler + admission handoff | historical compiler author-required test; handoff contract author-ref law | synthetic/provenance | `PRESERVE` |
| RB10 | Durable context excludes raw manuscript/candidate bytes, blind/private labels, secrets, chain-of-thought and mutation/publication credentials | recovered compiler durable package | Context Compiler schema | historical forbidden-field cases | synthetic/provenance | `PRESERVE` |
| RB11 | Generation, evaluation and admission contexts remain isolated roles; evaluator cannot reuse generation context | recovered compiler | Context Compiler schema | historical evaluator-isolation cases; concurrency isolation gate | synthetic/provenance | `PRESERVE_AND_REQUALIFY` |
| RB12 | Specialist/provider path has zero canonical Book write/lifecycle/export-freeze/publication authority | plan, scheduler, service envelopes | Registry v2 + authority contract | scheduler canonical-effect fence; historical contracts | current local + provenance | `PRESERVE` |
| RB13 | Book admission remains sole terminal canonical mutation boundary | terminal `BOOK_ADMISSION_HANDOFF`; `content-object-admission` target | admission-handoff contract | handoff contract qualification requirements + current scheduler dispatch fence | provenance/current local | `PRESERVE` |
| RB14 | Admission handoff itself performs no canonical mutation and cannot call/emulate admission | handoff envelope | admission-handoff contract | `NO_ADMISSION_EXECUTION_OR_COMMIT_API`, canonical-effect false requirements | provenance only | `PRESERVE_AND_REQUALIFY` |
| RB15 | Candidate admission requires exact candidate digest/output provenance plus validated evidence and explicit author-decision refs where applicable | handoff durable envelope | admission-handoff contract | candidate/evidence/author qualification requirements | provenance only | `REBIND_PRODUCER_IDENTITY_ONLY` |
| RB16 | Operation identity is semantic: workflow/source/plan/task/capability/service/operation/input/context; timestamps/retry counters do not define it | retry decision state | retry/idempotency contract | retry contract qualification requirements | provenance only | `PRESERVE_AND_REQUALIFY` |
| RB17 | Idempotent same logical operation may replay only with exact unchanged authoritative inputs | retry decision + scheduler attempts | retry/idempotency contract | current scheduler same-key transient replay; retry contract | current local + provenance | `PRESERVE` |
| RB18 | Non-idempotent unknown outcome never auto-replays; reconcile by request/operation identity before new attempt | retry reconciliation state; cancellation checkpoint | retry/idempotency contract | non-idempotent special-case requirements; cancellation contract | provenance only | `PRESERVE_POLICY_REBIND_ID` |
| RB19 | Confirmed existing result is reused/reviewed; confirmed no-effect may permit a new operation; unresolved/contradictory reconciliation fails closed | retry decision classes | retry/idempotency contract | exact reconciliation qualification requirements | provenance only | `PRESERVE` |
| RB20 | Non-idempotent candidate generation remains serial even after ownership rebind | concurrency decision state | concurrency contract | `NONIDEMPOTENT_PROSE_GENERATION_SERIAL` historical requirement, semantically candidate-generation seriality | provenance only | `REBIND_ID_PRESERVE_CLASS` |
| RB21 | Evaluator execution remains isolation-gated; no fresh-blind claim from shared/synthetic context | concurrency isolation gate + Context Compiler role | concurrency + Context Compiler | historical synthetic/nonblind receipt explicitly denies fresh-blind proof | provenance only | `PRESERVE_BLOCKER` |
| RB22 | Workflow coordination survives restart without replaying verified completed work; stale concurrent writes fail closed | durable store + scheduler run/checkpoint/receipts | workflow/durable/scheduler semantics | durable store 14 cases; scheduler pause/resume test | local portable only | `PRESERVE_AND_FRESH_QUALIFY` |
| RB23 | Failure/cancel/resume/evidence records preserve exact workflow/plan/source/operation/provider identities and never store raw/canonical effect state | failure, cancellation, evidence modules + durable receipts | failure/cancellation/evidence contracts | packet closure corpus + durable raw/canonical persistence tests | local/provenance | `PRESERVE_AND_REQUALIFY` |
| RB24 | Changed B01 executable/contract bytes get fresh isolated and cumulative qualification; historical hosted/A-01/native/private/publication/production evidence never transfers | reconstruction evidence ledger | B00 freeze + current authority | exact-subject evidence rules | current governance | `MANDATORY` |

### Accounting

- B01-A execution-foundation categories admitted by B00: **13 / 13 path-accounted**.
- Retired/current identity path classes above: **13 / 13 path-accounted**.
- Rebind invariants: **24 / 24 accounted**.
- Rebind requirements with no implementation or design disposition: **0**.
- Unaccounted B01-A archaeology requirements within this bounded execution-foundation scope: **0**.
- Fresh B01 isolated qualification executed: **0** — correctly not yet due because build has not begun.
- Historical PASS transferred: **0**.

This `0` means the archaeology/inventory phase is lossless for the bounded B01-A scope. It does **not** mean B01 is implemented, qualified or frozen.

## B01-A freeze decision

`B01-A RECOVER + INVENTORY = COMPLETE` for the bounded execution-foundation scope.

The recovered substrate is not discarded. The design problem is now precisely bounded: create current Book-owned integration identity and reachability around the recovered Context Compiler and workflow machinery while preserving provider provenance and all 24 invariants, permanently withholding retired Prose execution identities.

No external research is needed before B01-B analysis merely to determine current internal ownership: the decisive facts are repository/governance authority, and outside sources cannot change that ownership. Targeted research remains available later if a concrete protocol/recovery/concurrency choice is underdetermined and external evidence can materially change design.

## Exactly one successor

`BOOK-RECONSTRUCTION-B01-B — EXECUTION FOUNDATION ANALYSIS + REBIND OPTION ADJUDICATION`

B01-B must compare at least:

1. destructive rename/rewrite of historical identities — presumptively reject because it destroys provenance;
2. compatibility alias that allows old `PROSE.*` IDs to dispatch — presumptively reject because it can recreate active Prose execution authority;
3. explicit Book-owned integration capability + adapter identity with immutable nested provider provenance — preferred candidate, but must be adversarially analyzed before design lock.

B01-B may not implement. It must produce an authority-safe option decision, blocker analysis, and a proposed interface/durable-state/test denominator before `DESIGN-LOCK` is admitted.

No author, private-source, native, publication, external-provider, production or A-01 standing is inferred by this freeze.
