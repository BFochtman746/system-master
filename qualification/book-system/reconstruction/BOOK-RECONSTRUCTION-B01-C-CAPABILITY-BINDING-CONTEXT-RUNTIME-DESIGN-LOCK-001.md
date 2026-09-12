# BOOK-RECONSTRUCTION-B01-C — CAPABILITY BINDING + CONTEXT/RUNTIME REBIND DESIGN LOCK 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Parent head: `6d4db17aba28ff0f7e74081f056532b602b235c4`
Standing: `DESIGN_LOCKED__BUILD_ADMITTED_IN_STAGES__QUALIFICATION_DENOMINATOR_FROZEN_64`
Canonical effect: NONE

## Locked architecture

B01 uses a **dual-identity anti-corruption boundary**:

- current execution identity: Book-owned `BOOK.*` capability;
- immutable provider provenance identity: exact historical/provider service + operation + subject/contract identity;
- no old `PROSE.*` ID may dispatch;
- no provider provenance may become current topology ownership;
- no adapter/provider/scheduler path may gain canonical Book mutation, author-decision, export-freeze or publication authority.

This design preserves B01-A's 24/24 rebind invariants and the B01-B adjudication. Destructive historical renaming and compatibility dispatch aliases are forbidden.

## BookCapabilityBindingV1

A binding is a content-addressed coordination object. It is not a provider credential, provider availability assertion, qualification receipt or canonical mutation token.

Required semantic fields:

```text
binding_schema_version = "1"
binding_id
current_capability_id
current_owner_path = "SYSTEM_MASTER/BOOK"
adapter_id
adapter_version
authority_domain
context_package_class
registered_idempotent
concurrency_policy_class
provider_provenance {
  historical_or_provider_service_id
  operation_id
  provider_class
  provider_subject_ref   // nullable; null means execution unavailable, never guessed
  service_registry_id
  service_registry_subject_or_digest
}
canonical_write_authority = false
lifecycle_transition_authority = false
export_freeze_authority = false
publication_authority = false
author_decision_authority = false
private_data_authority
binding_digest
```

### Digest law

`binding_digest = SHA-256(stable semantic JSON)` over every field above except `binding_digest` itself.

The digest **must include** current capability ID, adapter identity/version, authority domain, context class, idempotency class, concurrency class, all provider-provenance fields and all authority booleans.

The digest **must exclude** timestamps, scheduler attempt numbers, chat/webhook metadata, display labels, retry counters and other nonsemantic transport metadata.

Same `binding_id` with a different semantic digest is a hard `BINDING_ID_CONFLICT`.

## Frozen current capability map — 11/11

| Current capability | Provider service / operation provenance | Context | Idempotent | Concurrency |
|---|---|---|---:|---|
| `BOOK.LITERARY.ANALYZE_PASSAGE` | `PROSE_ANALYSIS_AND_REVISION/ANALYZE_PASSAGE_OR_UNIT` | `GENERATION_CONTEXT` | true | `READ_ONLY_PARALLEL_ELIGIBLE` |
| `BOOK.LITERARY.BUILD_NARRATIVE_STATE` | `PROSE_ANALYSIS_AND_REVISION/BUILD_NARRATIVE_STATE_PROJECTION` | `GENERATION_CONTEXT` | true | `READ_ONLY_PARALLEL_ELIGIBLE` |
| `BOOK.LITERARY.DIAGNOSE` | `PROSE_ANALYSIS_AND_REVISION/DIAGNOSE_LIMITATIONS_AND_OPPORTUNITIES` | `GENERATION_CONTEXT` | true | `READ_ONLY_PARALLEL_ELIGIBLE` |
| `BOOK.LITERARY.RETRIEVE_CRAFT_INTELLIGENCE` | `PROSE_ANALYSIS_AND_REVISION/RETRIEVE_CRAFT_INTELLIGENCE` | `GENERATION_CONTEXT` | true | `READ_ONLY_PARALLEL_ELIGIBLE` |
| `BOOK.LITERARY.GENERATE_REVISION_CANDIDATE` | `PROSE_ANALYSIS_AND_REVISION/GENERATE_BOUNDED_REVISION_CANDIDATE` | `GENERATION_CONTEXT` | false | `SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING` |
| `BOOK.LITERARY.COMPARE_ORIGINAL_CANDIDATE` | `PROSE_ANALYSIS_AND_REVISION/COMPARE_ORIGINAL_AND_CANDIDATE` | `EVALUATION_CONTEXT` | true | `READ_ONLY_PARALLEL_ELIGIBLE` |
| `BOOK.LITERARY.ASSESS_VOICE` | `PROSE_ANALYSIS_AND_REVISION/ASSESS_VOICE_EVOLUTION_OR_DEGRADATION` | `EVALUATION_CONTEXT` | true | `READ_ONLY_PARALLEL_ELIGIBLE` |
| `BOOK.LITERARY.ASSESS_HOMOGENIZATION` | `PROSE_ANALYSIS_AND_REVISION/ASSESS_HOMOGENIZATION_RISK` | `EVALUATION_CONTEXT` | true | `READ_ONLY_PARALLEL_ELIGIBLE` |
| `BOOK.EVALUATION.INDEPENDENT_BOOK_OR_UNIT` | `BOOK_EVALUATION/INDEPENDENT_BOOK_OR_UNIT_EVALUATION` | `EVALUATION_CONTEXT` | true | `ISOLATION_GATED` |
| `BOOK.EVALUATION.CONTRASTIVE_CANDIDATE` | `BOOK_EVALUATION/CONTRASTIVE_CANDIDATE_EVALUATION` | `EVALUATION_CONTEXT` | true | `ISOLATION_GATED` |
| `BOOK.EVALUATION.QUALIFICATION_EVIDENCE` | `BOOK_EVALUATION/QUALIFICATION_EVIDENCE` | `EVALUATION_CONTEXT` | true | `ISOLATION_GATED` |

The provider service names above are **provenance identity**, not active Prose owner identity.

## Permanent retired-ID deny set

At minimum, current execution must reject:

- any capability ID beginning `PROSE.`;
- any owner path equal to or nested under `SYSTEM_MASTER/BOOK/PROSE`;
- service family used directly as dispatch identity `PROSE_ANALYSIS_AND_REVISION`;
- old `BOOK_EVALUATION` service family used as a topology owner/dispatch identity without a current Book binding;
- any stale task whose current capability lacks an exact admitted `BookCapabilityBindingV1`.

Historical evidence may contain these values. The deny rule applies to **current executable identity**, not evidence parsing.

## Context Compiler rebind lock

The exact recovered Context Compiler runtime/schema semantics from subject `6a488b45497c3a60fb3a23bab640a6a7ca372246` are the donor substrate.

Build rules:

1. materialize donor runtime and package schema onto the current B01 lineage without semantic weakening;
2. preserve rejection of active `/PROSE` authority and Documents ownership of completed-Prose integration;
3. extend current service binding from only registry identity to the exact current `BookCapabilityBindingV1` identity/digest where required;
4. current context compilation must fail stale if the binding digest changes;
5. no historical 44/44 PASS transfers; the materialized current subject gets fresh B01 isolated qualification;
6. raw/private/blind/author-secret/chain-of-thought/canonical/publication/production credential fields remain forbidden from durable packages;
7. evaluator isolation remains structural only until genuinely isolated execution occurs; no fresh-blind claim is permitted from synthetic tests.

## Runtime compatibility locks

### Routing

Routing accepts current `BOOK.*` integration capability only when an exact valid binding exists. It exposes provider provenance as evidence/configuration, not owner authority. Old `PROSE.*` routes remain permanently non-callable.

### Planning

Execution-plan task identity uses current capability ID plus exact binding digest. A changed binding creates a changed task semantic identity and therefore a changed plan digest.

### Scheduling

Scheduler preserves its existing retired-Prose deny behavior. It may dispatch a `BOOK.*` integration task only after binding/context validation. No dispatch occurs from a capability name alone.

### Concurrency

Policy uses current capability IDs. `BOOK.LITERARY.GENERATE_REVISION_CANDIDATE` remains serial/non-idempotent. Evaluator capabilities remain `ISOLATION_GATED` until exact required evidence exists.

### Retry / idempotency / reconciliation

Logical operation identity includes current capability ID + binding digest + provider service/operation identity. Provider/adapter/binding changes are new operations, never retries of old ones. Non-idempotent unknown outcome requires reconciliation; automatic duplicate generation is forbidden.

### Failure / cancellation / recovery

Persist current capability/binding identity and immutable provider operation provenance. Restart re-reads durable state and reconciles; it does not infer read-after-write freshness or blindly repeat an unknown effect.

### Evidence

Receipts bind current Book capability, binding digest, adapter identity, provider service/operation identity, exact source/workflow/plan/task/operation identity and result digest. Evidence never self-admits canon or publication.

### Admission

Candidate handoff binds the current candidate-generation capability and binding digest plus immutable provider provenance receipt. Only existing Book admission can construct/commit canonical mutation. Handoff remains coordination-only.

## Durable state / blocker classes

Required durable coordination records:

- capability binding registry/records;
- compiled context package identity/digest;
- workflow + plan identity/digest;
- scheduler run/attempt state;
- operation identity + reconciliation state;
- checkpoints and evidence receipt chain;
- admission handoff envelope.

Blockers are explicit and non-overlapping:

- `BLOCKED_BINDING_MISSING`
- `BLOCKED_BINDING_STALE`
- `BLOCKED_ADAPTER_UNAVAILABLE`
- `BLOCKED_PROVIDER_SUBJECT_UNADMITTED`
- `BLOCKED_PROVIDER_UNAVAILABLE`
- `BLOCKED_CONTEXT_STALE`
- `BLOCKED_AUTHOR_DECISION`
- `BLOCKED_PRIVATE_AUTHORITY`
- `BLOCKED_EVALUATOR_ISOLATION`
- `BLOCKED_RIGHTS_OR_CUSTODY`
- `BLOCKED_RECONCILIATION`
- `BLOCKED_EXTERNAL_SETUP`
- `BLOCKED_A01_REQUIRED`

A blocker may not be converted into PASS by absence of evidence.

## Frozen isolated denominator — 64 cases

The B01 current-subject isolated qualification denominator is frozen **before build** at 64 cases:

- **I01-I24** — one executable assertion for each RB01-RB24 invariant from B01-A3;
- **M01-M11** — positive exact mapping validation for each of the 11 current Book integration capabilities;
- **A01-A20** — one fail-closed assertion for each of the 20 adversarial cases from B01-B;
- **X01-X09** — cross-component integration invariants:
  - X01 exact binding digest included in context identity;
  - X02 changed binding makes context stale;
  - X03 changed binding changes plan/operation identity;
  - X04 old Prose ID remains withheld after current Book mapping exists;
  - X05 non-idempotent unknown outcome remains reconcile-required after rebind;
  - X06 restart does not redispatch verified completed work;
  - X07 candidate handoff requires current candidate binding digest;
  - X08 provider/evaluator result cannot set canonical/publication authority;
  - X09 no missing provider subject is guessed into executable standing.

`24 + 11 + 20 + 9 = 64`.

The denominator may increase only if build discovers a previously unaccounted requirement. It may not shrink to obtain PASS. Any increase requires a design-lock addendum before qualification.

## Cumulative regression / calibration lock

Before B01 freeze, the exact candidate must also preserve:

1. **B00**: Q001-Q096 (96/96) and PRE01-PRE21 (21/21), or an exact current harness proving the same frozen B00 behavior;
2. **Context Compiler donor semantics**: all 44 historical cases re-executed against the current materialized/rebound runtime, with any expected differences explicitly design-locked rather than silently changed;
3. **Durable store**: current 14-case direct test passes unchanged or is superseded by a documented stronger denominator;
4. **Scheduler**: current direct scheduler test passes all existing assertions, including zero retired-Prose dispatches, plus B01 new-binding tests;
5. routing/plan/concurrency/retry/failure/cancel/evidence/admission contract semantics remain fail-closed and get direct current tests where changed.

Historical closure labels are not cumulative PASS. Cumulative means fresh execution on the exact B01 candidate subject/environment.

## Build order

Build is admitted only in dependency order:

1. **B01-D1** — materialize `BookCapabilityBindingV1` registry/runtime + isolated binding tests; no scheduler changes yet.
2. **B01-D2** — materialize recovered Context Compiler into current lineage and bind exact capability-binding digest.
3. **B01-D3** — rebind routing + plan + concurrency + retry to current IDs while old IDs remain denied.
4. **B01-D4** — rebind scheduler + failure + cancellation/resume + evidence + admission handoff.
5. **B01-E** — run frozen 64 isolated cases + cumulative regression/calibration on exact candidate.
6. **B01-F** — freeze only if unaccounted requirements=0 and required exact-subject evidence is valid.

Each build stage must re-read live owner head first and preserve a rollback-friendly commit boundary.

## Exactly one successor

`BOOK-RECONSTRUCTION-B01-D1 — BOOK CAPABILITY BINDING V1 RUNTIME + REGISTRY + ISOLATED BINDING QUALIFICATION`

D1 may not change scheduler dispatch eligibility. Its success criterion is a deterministic, content-addressed current Book binding layer whose provider subject can truthfully remain unavailable/null and whose old Prose execution IDs remain outside current executable identity.

No author/private/native/publication/production/external-provider/A-01 evidence is claimed by this design lock.
