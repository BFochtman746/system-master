# LRN-OWNERSHIP-FREEZE-001B-R2D — Current Implementation-Substrate Custody + 575-Baseline Reconciliation / Design-Delta Adjudication

Status: **PASS_EXACT_SUBSTRATE_RECOVERY / BOUNDED_BUILD_BASE_ADMITTED / HISTORICAL PASS NOT TRANSFERRED**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Canonical Learning head re-read before mutation: `learning/control-v1@e3196089f77dde376944a08eac78a697e57d1535`  
R2D base: `learning/ownership-freeze-001b-20260912@99350b72bf024e9d951d2028abdef8dbffaba249`

## 1. Purpose

R2D executes the post-design-lock admission step required by R2C: recover the exact preserved owner-separated Learning/Curriculum implementation substrate, verify its byte custody and current internal manifest, rerun the highest-authority portable owner/binding suites available in the recovered source, and adjudicate the delta between that source and the current R2B/R2C owner/persistence/route constitution.

This operation does not make the old Batch-07 line current, does not promote a historical PASS to changed bytes, and does not claim live PostgreSQL, Master Core production transport, native iPhone, human learning, psychometric, SME, certification, A-01 or production evidence.

## 2. Exact recovered implementation custody

Two exact Library artifacts were recovered and materialized for this unit:

| Artifact | Bytes | SHA-256 | Standing |
|---|---:|---|---|
| `LRN_CUR_PRODUCTION_BINDING_001_REBOUND_SOURCE.zip` | 765,104 | `28e3317e5494c9df7df2f8aefb7f83f7c69fbc9d0ababfb696700542c831edc3` | exact implementation source candidate |
| `LRN_CUR_PRODUCTION_BINDING_001.zip` | 789,246 | `14b24952b4cafa54d74e510b0602488c28eebfa74d7f9e1442899e4edf7d7d69` | exact delivery/evidence package |

Delivery-package internal `SHA256SUMS.txt`: **46/46 PASS, 0 failures, 0 missing**.

The nested source receipt declares source ZIP SHA-256 `28e3317e...edc3`, 379 ZIP members and 378 current source-manifest entries. The extracted current `SOURCE_TREE_MANIFEST.json` was independently checked against the recovered source bytes during this unit: **378/378 PASS, 0 failures, 0 missing**. The 379th extracted file is the source-tree manifest itself.

### 2.1 Important custody defect correctly quarantined

The recovered source also contains an older `SHA256SUMS.txt`. It is **not** a valid checksum authority for the rebound source: 239 entries match and 23 entries differ. The differing rows include changed `learning_lab/**` and IMPL-015 evidence files. This is not hidden or normalized away.

Adjudication:

- `SOURCE_TREE_MANIFEST.json` + exact source ZIP hash are the current rebound-source byte authority because they verify 378/378 current files and are themselves bound by the delivery source receipt;
- the older source `SHA256SUMS.txt` is retained as predecessor/historical checksum evidence only;
- no later qualification may cite that older checksum file as proof of current rebound-source identity;
- the mismatch is a metadata/custody hygiene defect, not a reason to discard the exact current bytes whose current manifest verifies losslessly.

## 3. Fresh portable revalidation performed in R2D

Fresh execution against the recovered exact source produced:

- production-binding suite: **15/15 PASS**;
- authority REBIND-001 suite: **20/20 PASS**;
- owner-extraction REBIND-002 suite: **34/34 PASS**;
- Learning/Curriculum IMPL-016 owner-separated seam: **25/25 PASS**;
- combined freshly executed owner/binding/seam denominator in this R2D pass: **94/94 PASS**;
- Python compile: **128/128 PASS**.

A fresh attempt to run the historical 481-test compatibility/behavior floor as one monolithic command exceeded the bounded execution window for that command. Therefore **R2D does not claim a fresh 481/481 or fresh 575/575**. The prior 575/575 receipt remains exact historical evidence for the recovered source, while current admission relies on exact byte custody plus the freshly rerun 94 authority/binding tests and compile result. The full behavior floor remains required again after current code changes.

## 4. Recovered substrate facts

The admitted source contains these relevant implementation surfaces:

- `authority_boundary/` — owner-scoped repository and Learning/Curriculum semantic-owner fences;
- `learning_core/` and `learning_runtime/` — learner-state/mastery/adaptation behavior;
- `curriculum_core/` and `curriculum_runtime/` — program/instruction/curriculum behavior;
- `shared_ports/` — transport-neutral owner-crossing codecs/ports;
- `production_binding/postgres_domain_repository.py` — separate `learning_domain` / `curriculum_domain` PostgreSQL adapter with versioning/idempotency/outbox building blocks;
- `production_binding/master_core.py` — transport-neutral route registry/router with no direct domain repository access;
- `production_binding/shared_authority.py` — fail-closed shared-authority adapter;
- `production_binding/MASTER_CORE_ROUTE_MANIFEST_001.json` — 112-interface registry;
- `migrations/001_lrn_cur_domain_store.up.sql` / `.down.sql` — domain schema realization;
- `compatibility_legacy/` and `learning_lab/` — preserved compatibility/behavior-oracle lineage, not current canonical production authority.

The recovered production-binding source itself truthfully reports that the exact 63 inbound production handlers are not materialized and that all existing service mutations are not yet rebound through the atomic PostgreSQL mutation/receipt/outbox unit.

## 5. Design-delta adjudication against current R2B/R2C

### 5.1 `REUSE_UNCHANGED` as semantic behavior substrate

Subject to fresh qualification after integration, the following architecture/behavior is compatible with current ownership and may be reused rather than rewritten:

1. distinct Learning and Curriculum semantic-owner boundaries;
2. owner-scoped repository rejection of foreign semantic kinds;
3. Learning/Curriculum read crossing through typed ports rather than raw foreign-store access;
4. prohibition on domain-owned generic durable Job truth;
5. immutable-reference pattern at the Learning/Curriculum remediation seam;
6. owner-separated diagnostic/remediation/adaptive-entry behavior;
7. transport-neutral route registry/router structure that cannot directly access a domain repository;
8. deterministic event identity and idempotent outbox insertion concept;
9. canonical JSON/body-digest integrity pattern;
10. compatibility code quarantined from canonical owner packages.

### 5.2 `REUSE_WITH_CURRENT_CONTRACT_REBIND`

These source surfaces are structurally useful but carry historical shared-authority identifiers and must be rebound before current admission:

1. `production_binding/MASTER_CORE_ROUTE_MANIFEST_001.json` — denominator and Learning/Curriculum ownership are reusable, but the 14 shared interfaces still use historical composite IDs such as `FOUNDATION-003 + PLATFORM-002`, `021J + 021K`, `RIGHTS-001 + PLATFORM-008`, and similar identifiers rather than current logical Foundation/Core service owners.
2. `production_binding/shared_authority.py` — fail-closed behavior is reusable; `CANONICAL_SHARED_BINDINGS` must be regenerated from current owner/service contracts rather than historical IDs.
3. `production_binding/master_core.py` — router structure is reusable after it consumes the current regenerated route registry and current shared contract identifiers.
4. `production_binding/postgres_domain_repository.py` — persistence mechanics are reusable, but the historical `DATA-001` name must be treated as the predecessor physical-provider identity; current code must bind through the current Canonical Data & Persistence service contract without allowing the storage provider to become semantic owner.
5. migration/readiness/evidence naming — retain schema semantics while rebinding current provider/contract identities and current qualification claims.

### 5.3 `REPAIR`

The following gaps are real current build work:

1. **Shared-owner route remap:** the 14 shared interfaces must be rebound exactly as R2B/R2C froze them: Durable Execution Runtime (`I021,I022,I031`), Canonical Data & Persistence (`I045`), Transport & Delivery (`I046,I108`), Rights/Licensing/Attribution (`I050,I101`), Capability Registry & Routing (`I052`), Recovery & Reconciliation (`I075,I085`), AI Safety & Model Risk (`I105`), Security/Privacy/Secrets/Crypto (`I106`), Effect/Action Authority (`I109`).
2. **63 inbound handlers:** historical source has 0/63 exact production transport handlers. No manifest row may be counted as a handler.
3. **Atomic mutation rebind:** every state-changing Learning/Curriculum handler that requires canonical mutation must use the owner-state + operation receipt + outbox atomic boundary from R2C; the historical source explicitly says not every existing service mutation is rebound.
4. **Typed current errors:** historical persistence exceptions such as generic `ValueError('VERSION_CONFLICT')` and `IDEMPOTENCY_DIGEST_MISMATCH` must be translated/bound to the current frozen typed contract at the semantic boundary instead of leaking adapter strings as the public contract.
5. **Concurrency/restart proof:** current code states that SERIALIZABLE/locking behavior remains a target PostgreSQL qualification concern. It must stay unclaimed until an exact target executes it.
6. **Current route/provider contract mismatch:** shared owner identity returned by dependencies must be checked against current logical contract identity/version, not historical composite labels.
7. **Current trace/calibration remap:** stale historical ID-only golden/qualification references must be mapped to active 113/112/28 semantics before they count in a changed-subject cumulative qualification.
8. **Checksum hygiene:** obsolete rebound-source `SHA256SUMS.txt` must not be emitted as current authority in the next source package; a regenerated current manifest/checksum set is required.

### 5.4 `DO_NOT_ADMIT` as canonical production authority

1. `compatibility_legacy/**` — regression/compatibility only;
2. `learning_lab/**` as a mixed legacy canonical owner — behavior oracle/regression only; it cannot regain canonical Learning+Curriculum write authority;
3. local/shared-authority emulations as evidence of production shared services;
4. historical composite Core IDs as current architecture truth;
5. any route or store that silently creates `MOD-KNOWLEDGE-001` / Knowledge-competency-equivalence authority;
6. historical 481/575 PASS labels as qualification of changed current bytes.

## 6. `LRN-069` residual check

The recovered production-binding code and route manifest contain **no explicit `LRN-069`, `LRN-EXT-002`, `MOD-KNOWLEDGE-001`, or `KNOWLEDGE-COMPETENCY-ALIGNMENT-001` implementation reference**. This is favorable but not proof that the architectural residual disappeared.

Current rule remains unchanged:

- no canonical Knowledge-equivalence route/store may be added;
- Curriculum may own its local skill/criterion truth;
- source domains own their source competency truth;
- equivalence remains feature-gated until current architecture explicitly admits an owner and contract.

## 7. Current admission result

R2D establishes an exact, bounded implementation base suitable for current repair/build work:

- source ZIP identity: **PASS**;
- current source-tree manifest: **378/378 PASS**;
- delivery manifest: **46/46 PASS**;
- source predecessor checksum file current-authority standing: **QUARANTINED_STALE (23 mismatches)**;
- owner/binding/seam portable revalidation: **94/94 PASS**;
- Python compile: **128/128 PASS**;
- current Learning/Curriculum semantic split compatibility: **PASS**;
- exact current shared-owner contract identity: **REPAIR REQUIRED**;
- exact inbound handlers: **0/63 current historical base; BUILD REQUIRED**;
- live PostgreSQL target evidence: **NOT EXECUTED**;
- current full 481/575 changed-subject regression: **NOT YET CLAIMED**;
- human/native/psychometric/SME/certification/A-01/production evidence: **NOT CLAIMED**.

The source is therefore admitted as a **bounded repair base**, not as current production-complete code.

## 8. Build sequencing decision

Do not jump directly to all 63 handlers. First repair the current authority seam so later handlers cannot be built onto obsolete shared-owner identities.

### Exact next operation

`LRN-OWNERSHIP-FREEZE-001B-R3A — CURRENT SHARED-OWNER CONTRACT/ROUTE REBIND + KNOWLEDGE FENCE + CUSTODY-MANIFEST REPAIR`

R3A BUILD must:

1. materialize the exact admitted `28e3317e...edc3` source into an isolated current build lineage without changing canonical `learning/control-v1`;
2. regenerate the 112-route manifest from the exact 001C semantic signatures plus R2B current owner bindings;
3. replace historical shared-owner composite IDs in the adapter with current logical Foundation/Core contract identifiers;
4. preserve all 98 Learning/Curriculum-owned interface bindings unchanged unless a current semantic defect is proven;
5. preserve and machine-check the `LRN-069` no-route/no-store fence;
6. generate a current complete checksum/source-tree manifest, explicitly superseding the stale predecessor `SHA256SUMS.txt` as current authority;
7. add owner-mismatch, unknown-provider, historical-owner-ID rejection, cross-domain writer-bypass and unresolved-Knowledge-route rejection tests;
8. run isolated route/shared-authority qualification plus the owner-separated 94-test seam floor, then a bounded cumulative behavior regression before any handler materialization starts.

Only after R3A freezes may `R3B` begin the 63-handler materialization in dependency-safe slices.