# CORE Contracts & Versioning — Recovery / Inventory 001

Status: **RECOVERED / INVENTORIED / ANALYZED — DESIGN LOCK NEXT**  
Owner branch base: `system-master/control-v2@044f6f809060b94226a7f546a55f2736bdf9c73f`  
Bounded operation: `CORE-CONTRACTS-VERSIONING-RECOVERY-INVENTORY-001`

## Authority and scope

This inventory is subordinate to `foundation-spine/SYSTEM-SPECIFICATION.md` and preserves its constitutional laws and canonical Work Chain. Contracts & Versioning owns the exact schema/protocol/contract version governing an exchange: versioned command/API/event/state/receipt schemas, semantic compatibility rules, contract digests, migration compatibility and deprecation metadata. Unknown or incompatible contracts must fail before mutation. It does **not** own business meaning, specialist semantics, policy, routing, placement, job truth or effect permission.

Historical F-WP material is reusable evidence/substrate, not target architecture authority.

## Recovered current/historical substrate

### F-WP-012

Recovered paths:

- `system-master/f-wp-012/control/REQUIREMENTS.json`
- `system-master/f-wp-012/control/BASELINE-BINDING.json`
- `system-master/f-wp-012/control/SOURCE-SLICE-MANIFEST.json`
- `system-master/f-wp-012/src/main/java/org/systemmaster/core/ContractRegistry.java`
- `system-master/f-wp-012/src/main/java/org/systemmaster/core/LegacyCrosswalkService.java`
- `system-master/f-wp-012/src/main/java/org/systemmaster/core/MigrationService.java`
- `system-master/f-wp-012/src/main/java/org/systemmaster/core/PortabilityService.java`
- `system-master/f-wp-012/src/test/java/org/systemmaster/core/Fwp012QualificationTest.java`

The preserved F-WP-012 source-slice seal fixes a denominator of 4 requirements and 47 tests and explicitly does not authorize production. Its four requirements are useful substrate:

1. explicit logical contract versions; breaking major versions require migration; unsupported versions are explicit;
2. legacy reuse requires an explicit crosswalk and ambiguous mapping quarantine;
3. migration is idempotent/resumable/content-digest verified with conflict halt and reconciliation report;
4. portability preserves identity/version/evidence/event order and rejects secrets/invalid ordering.

### Existing useful mechanics

`ContractRegistry` already provides:

- immutable-looking `ContractVersion(contract, major, minor, schemaDigest, migrationId)` values;
- version identity conflict detection;
- explicit unsupported standing;
- a registry digest over sorted registrations;
- a migration-required outcome across majors.

`MigrationService` already provides:

- checkpointed/resumable migration;
- input-set digest binding;
- replay/idempotency behavior;
- identity/digest conflict halt;
- reconciliation report digest.

`PortabilityService` already provides:

- ordered event export;
- contract-version and evidence-reference preservation;
- export digest;
- basic secret-pattern rejection.

These mechanics should be **reused/rebound**, not rewritten without cause.

## Material gaps against the fresh Foundation specification

The current F-WP-012 contract registry is substantial but insufficient as the current Contracts & Versioning authority:

- **No durable canonical registry state.** Registrations live in an in-memory map; restart/replay authority is absent.
- **No registry revision / optimistic command base / idempotent registration command.** There is no durable mutation identity or current-pointer history.
- **No explicit contract kind or owner binding.** Command/query/API/event/state/receipt and owning logical system are not first-class keys.
- **No schema format/profile identity.** A digest is caller-supplied, but canonical schema bytes/reference, format and canonicalization profile are not bound.
- **Same-major is automatically treated as compatible.** This is unsafe: compatibility is directional and format/semantic-rule dependent.
- **No transitive compatibility semantics.** Compatibility against only one requested/current pair is not enough for retained historical data or long-lived consumers.
- **Migration is modeled as one `migrationId` on a version rather than an explicit source-version -> target-version edge.** This cannot represent multiple supported source revisions, chained migration or migration proof.
- **No deprecation/sunset/retirement metadata.** The fresh specification explicitly requires deprecation metadata.
- **No compatibility evaluator identity/evidence.** A compatibility result is not bound to exact evaluator/ruleset/version/evidence.
- **No pre-mutation contract resolution receipt.** Downstream commands/APIs/events cannot prove which exact contract revision/digest was accepted before mutation.
- **No canonical Work Chain binding.** Contract versions are not yet carried through Work/Plan/Route/Grant/Assignment/Job/Attempt/Invocation/Effect/Evidence exchanges.
- **No routing seam.** Routing must consume contract compatibility without Contracts becoming the router.
- **No effect seam.** Effect Authority must reject stale/incompatible effect contracts without Contracts granting effect permission.
- **No contract-usage reachability / deprecation safety proof.** A version cannot be safely sunset merely because a newer version exists.
- **No explicit fail-closed ambiguous evaluator state.** UNKNOWN/UNVERIFIED structural compatibility must not silently become COMPATIBLE.

## Targeted research that materially changes the design

Research was limited to compatibility/evolution behavior because the current same-major shortcut could incorrectly authorize mutation.

1. Confluent Schema Registry distinguishes `BACKWARD`, `FORWARD`, `FULL` and transitive forms. Direction and whether compatibility is checked against one predecessor or all retained predecessors are materially different. Therefore a single Boolean/same-major rule is insufficient.
2. Protocol Buffers treats field numbers as wire identity and warns that field numbers in use must not be changed or reused. Therefore compatibility must be format-aware; SemVer labels alone cannot prove wire compatibility.

Design consequence: compatibility standing must be an explicit, evidence-bound, directional decision produced by a format/semantic compatibility evaluator and persisted by Contracts & Versioning. Version numbers are identifiers and policy inputs, not proof of compatibility.

Research references:

- `https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html`
- `https://protobuf.dev/programming-guides/proto3/`

## Bounded lossless invariant census

| ID | Requirement / invariant | Existing component | Durable state now | Interface/contract now | Tests/evidence now | Current blocker / required repair |
|---|---|---|---|---|---|---|
| CVI-01 | Every exchange contract has stable owner + kind + name identity. | Partial `ContractVersion.contract` | none | string contract name | F-WP-012 | Add canonical `ContractKey(ownerSystemId, kind, name)`; no specialist ownership transfer. |
| CVI-02 | Every registered revision is immutable and digest-bound. | `ContractVersion` | none | major/minor + digest | F-WP-012 | Persist create-once revision records and canonical schema reference/digest. |
| CVI-03 | Schema format and canonicalization profile are explicit. | absent | none | absent | none | Add `schemaFormat`, `canonicalizationProfile`, schema artifact/ref digest. |
| CVI-04 | Registry state survives restart and corruption fails closed. | absent | none | absent | none | Build append-durable/replayable registry adapter; native/production durability remains separate evidence. |
| CVI-05 | Registration is idempotent and changed payload under same command/version conflicts. | version conflict only | none | `register` | F-WP-012 | Add command id + request digest + optimistic registry revision. |
| CVI-06 | Compatibility is directional. | partial | none | `compatibility` | F-WP-012 | Replace same-major shortcut with explicit BACKWARD/FORWARD/FULL decision. |
| CVI-07 | Compatibility can be transitive across retained history. | absent | none | absent | none | Add transitive decision scope and exact compared-version set digest. |
| CVI-08 | Compatibility is format/ruleset aware. | absent | none | absent | none | Compatibility evaluator adapter + evaluator/ruleset version/digest. |
| CVI-09 | Semantic compatibility cannot be inferred from SemVer alone. | violated by shortcut | none | same-major shortcut | F-WP-012 | Remove automatic compatibility authority; require evidence-bound decision or explicit exact-version match. |
| CVI-10 | Unknown/incompatible contract fails before mutation. | partial explicit UNSUPPORTED | none | compatibility result | F-WP-012 | Add fail-closed resolution receipt required by mutation boundaries. |
| CVI-11 | Breaking migration is an explicit source->target edge. | partial `migrationId` | none | one id on version | F-WP-012 | Add immutable migration edge with source/target digests and migration artifact/ruleset digest. |
| CVI-12 | Migration execution is idempotent/resumable/digest checked. | `MigrationService` | in-memory import store + checkpoint value | migrate/checkpoint/report | F-WP-012 | Rebind mechanics behind durable migration state; separate legacy data migration from contract-version migration authority. |
| CVI-13 | Deprecation, sunset and retirement are explicit revisioned facts. | absent | none | absent | none | Add lifecycle standing, successor, notice/sunset constraints and evidence. |
| CVI-14 | Current/recommended version pointer cannot silently change. | `current()` computes max | none | computed latest | F-WP-012 | Replace max-version inference with explicit revisioned current pointer and adoption decision. |
| CVI-15 | Compatibility decisions are immutable/evidence-bound. | absent | none | absent | none | Add `CompatibilityDecision` with subject digests, direction, evaluator identity, evidence and decision digest. |
| CVI-16 | Every consequential exchange can obtain an exact contract-binding receipt. | absent | none | absent | none | Add pre-mutation `ContractBindingReceipt` with registry revision/version/schema digest/compatibility standing. |
| CVI-17 | Work Chain descendants carry applicable exact contract identity. | absent | external owners | absent | none | Define references only; Contracts does not own Work/Plan/Job truth. |
| CVI-18 | Routing consumes compatibility but Contracts does not route. | absent | none | external seam | none | Provide compatibility/binding query interface only. |
| CVI-19 | Effect Authority consumes exact contract standing but Contracts does not grant effects. | absent | none | external seam | none | Binding receipt is necessary but never sufficient for external mutation. |
| CVI-20 | Portability preserves version/evidence/order and excludes secret material. | `PortabilityService` | none | export manifest | F-WP-012 | Rebind to current contract IDs and durable source history; strengthen secret handling at owner boundary. |
| CVI-21 | Version retirement is blocked while required reachable consumers/data remain. | absent | none | absent | none | Add usage/reachability input receipt; do not let telemetry alone certify safe retirement. |
| CVI-22 | Registration/adoption requires owner-valid authority. | absent | none | absent | none | Define Identity/authority receipt seam; Contracts cannot self-admit arbitrary specialist schemas. |
| CVI-23 | Contract registry changes produce durable evidence. | registry digest only | none | `registryDigest` | F-WP-012 | Add immutable registration/adoption/deprecation receipts and exact-subject evidence. |
| CVI-24 | Architecture/implementation/qualification/production standing remain separate. | historical production=false | manifest/control | qualification sentinel | F-WP-012 | Preserve historical PASS only as provenance; fresh bytes require fresh qualification. |

**Bounded denominator: 24 invariants. Unaccounted: 0.**

## Adjudication

### Reuse

- F-WP-012 stable version-identity conflict behavior.
- registry digest concept, but over richer canonical records.
- checkpointed/idempotent migration mechanics.
- portability ordering/evidence preservation mechanics.
- explicit unsupported outcome and fail-fast conflicts.

### Repair

- replace same-major automatic compatibility with evidence-bound directional compatibility;
- make contract identity owner/kind/name explicit;
- make registry state durable/revisioned/idempotent;
- replace inferred highest version with explicit current/adopted pointer;
- make migration edges source/target explicit;
- add deprecation/sunset/retirement and pre-mutation binding receipts.

### Do not absorb

- business/domain meaning from Book, Learning, Documents, Programming or any specialist owner;
- policy/rights/privacy/safety decisions;
- route selection;
- resource admission;
- executor placement;
- job/attempt lifecycle;
- Effect Authority commit permission;
- Evidence Authority claim adjudication.

## Qualification obligations to freeze before build

Design-lock must define at least:

- exact contract-key/version/schema-digest identity cases;
- duplicate/idempotent registration and changed-payload conflicts;
- backward/forward/full and transitive compatibility cases;
- UNKNOWN/UNVERIFIED evaluator fail-closed behavior;
- Protobuf-like field-number incompatibility fixture and JSON/open-vs-closed structural fixture without claiming those fixtures as universal parsers;
- explicit migration-edge resolution/chaining/cycle rejection;
- deprecation/sunset/retirement reachability blocking;
- exact pre-mutation binding receipt validation;
- restart/replay/corruption/truncation behavior of portable durable registry;
- current-pointer optimistic revision and stale-writer rejection;
- Work Chain reference propagation without shadow Work truth;
- Routing/Effect owner-boundary tests;
- cumulative System Root + Identity O-WP-001 + O-WP-002 + Delegation regression.

## Exact dependency-valid successor

`CORE-CONTRACTS-VERSIONING-DESIGN-LOCK-001 — DURABLE CONTRACT KEY/REVISION + DIRECTIONAL/TRANSITIVE COMPATIBILITY + EXPLICIT MIGRATION EDGE + LIFECYCLE + PRE-MUTATION BINDING RECEIPT + QUALIFICATION DENOMINATOR`

No A-01/native/production standing is created by this inventory.
