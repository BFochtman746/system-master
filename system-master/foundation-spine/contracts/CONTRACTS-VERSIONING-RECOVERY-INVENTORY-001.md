# CORE Contracts & Versioning Recovery Inventory 001

## Purpose and authority

This record executes the RECOVER -> INVENTORY -> ANALYZE -> TARGETED RESEARCH -> ADJUDICATE stages for the Foundation/Spine **Contracts & Versioning** logical system. `SYSTEM-SPECIFICATION.md` remains architecture authority; this record is implementation/evidence convergence work.

Observed owner baseline before mutation: `system-master/control-v2@044f6f809060b94226a7f546a55f2736bdf9c73f`.

## Architecture boundary

Contracts & Versioning answers: **What exact schema / protocol / command / query / event / API / receipt contract is this, which immutable version/digest is in force, and is the requested producer/consumer relationship compatible?**

It owns versioned contract identities, schema/protocol artifacts, compatibility policy and decisions, contract digests, migration edges, deprecation metadata and fail-closed unknown/incompatible standing. It does **not** own peer business meaning, policy/authorization decisions, route selection, placement, runtime lease/fence truth, or specialist Book/Learning/Documents/Programming semantics.

## Recovered current and historical substrate

### F-WP-012 — strong reusable donor, not target architecture authority

Recovered requirements:

- F-RQ-054: explicit versioning; breaking major change requires explicit migration; unsupported versions are explicit incompatibility.
- F-RQ-055: explicit legacy crosswalk; ambiguous mappings quarantine rather than guess.
- F-RQ-056: migration is idempotent/resumable/content-digest verified and produces reconciliation evidence; identity/digest conflicts halt.
- F-RQ-057: portability preserves identity/version/evidence/event order and rejects secret material/invalid ordering.

Recovered implementation:

- `ContractRegistry`: create-once version tuples, schema digest, registry digest, current-version lookup and coarse compatibility standing.
- `LegacyCrosswalkService`: create-once legacy mapping with explicit ambiguous/unmapped quarantine.
- `MigrationService`: input-set digest, resumable checkpoint, replay/idempotency checks, digest-conflict halt and reconciliation report.
- `PortabilityService`: ordered history export, contract-version/evidence aggregation, digest and basic secret screening.
- `Fwp012QualificationTest`: 47 assertions/cases across these four services.

Historical F-WP-012 remains useful implementation provenance. Its A-01 workflow is historical environment evidence only; no historical PASS is transferred to a changed fresh-spine subject.

### F-WP-003 GovernanceContracts — boundary donor only

`GovernanceContracts.Snapshot` demonstrates the useful pattern of binding exact external standing/reference snapshots without taking their semantic authority. It is not itself a contract registry and must not become a second owner of version compatibility.

## Material defects / gaps found

1. **Mutation-before-validation defect in `ContractRegistry.register`.** A new version is inserted into the in-memory map before the rule `major > 1 requires migrationId` is checked. A rejected registration can therefore leave changed state. Fresh design must validate fully before durable mutation.
2. **Same-major is incorrectly treated as proof of compatibility.** Current code returns `COMPATIBLE` for any registered requested version in the same major. Version numbering is metadata; actual schema/protocol compatibility requires an explicit compatibility policy and deterministic validator decision.
3. **Compatibility direction is absent.** Backward, forward and full compatibility are not interchangeable; transitive versus latest-only checks are also distinct.
4. **Migration identity is under-specified.** `migrationId` is stored on a target version instead of an explicit immutable `from -> to` edge with exact artifact digest and applicability constraints.
5. **Registry authority is volatile.** F-WP-012 uses in-memory maps. No fresh append-durable authoritative registry/journal, registry revision, replay integrity or corruption behavior is bound.
6. **No semantic command idempotency.** The current registry has create-once version identity but no `commandId + requestHash` replay/conflict contract.
7. **No canonicalization identity.** A schema digest without exact schema format/canonicalization algorithm/version can be ambiguous across serializers or text normalization.
8. **No deprecation/sunset authority.** There is no explicit deprecation standing, replacement, effective/sunset boundary or prohibition on silently deleting a still-referenced contract.
9. **No exact producer/consumer decision receipt.** Compatibility decisions do not bind source/target version digests, validator identity/version, policy identity/revision, direction, transitivity and decision digest.
10. **Legacy ownership label is stale.** `LegacyCrosswalkService` hard-codes semantic owner `021F`. The fresh spine must bind explicit current owner references and quarantine unknown/stale owner mappings rather than preserving a historical label as runtime authority.
11. **Migration checkpoint is not durable authority.** The algorithm is reusable, but checkpoint persistence/locking/restart integrity is not established by F-WP-012.
12. **Portability is partially misallocated.** Generic contract-version references and safe export constraints are useful, but canonical change-history export belongs with Change/Migration/Release governance, not as core Contracts & Versioning truth.
13. **Fresh spine contracts are not comprehensively registered.** Current Identity/System Root interfaces exist as implementation records but the fresh registry has not yet bound all current command/query/event/API/receipt subjects to exact version/digest authority.
14. **No pre-mutation contract gate.** The architecture requires unknown/incompatible contracts to fail before mutation; the recovered registry exposes lookup/compatibility but does not provide one authoritative gate receipt consumed by mutation boundaries.

## Targeted research disposition

External research was used only where it changes the design:

- Semantic Versioning confirms that released version contents are immutable and that major/minor/patch numbers convey API-change intent; it does not prove wire/schema compatibility by itself.
- Contemporary schema-registry practice distinguishes BACKWARD, FORWARD, FULL and TRANSITIVE policies and validates compatibility before accepting schema evolution. Therefore fresh System Master design must store explicit compatibility policy/direction/transitivity and validator identity instead of inferring compatibility from equal major versions.

No external product is adopted as an authority dependency. The System Master contract is engine-neutral and can use format-specific validators through explicit interfaces.

## Lossless bounded invariant census

| ID | Requirement / invariant | Current component / donor | Durable state now | Interface / contract now | Tests / evidence now | Environment | Remaining blocker |
|---|---|---|---|---|---|---|---|
| CV-01 | Every admitted contract has one canonical qualified subject identity and kind | F-WP-012 `ContractVersion.contract` | volatile map only | `ContractVersion` | F-WP-012 cases | historical Java | fresh subject model + persistence |
| CV-02 | Every version binds immutable exact schema/protocol digest | `schemaDigest` | volatile | `ContractVersion` | F-WP-012 cases | historical Java | bind format + canonicalization identity |
| CV-03 | Same subject+version with different bytes is conflict | `putIfAbsent` equality check | volatile | `register` | F-WP-012 conflict case | historical Java | preserve with prevalidation + durable journal |
| CV-04 | Rejected registration must not mutate authority | **defect** | not guaranteed | `register` | no post-reject state test | historical Java | fresh transaction/prevalidation semantics |
| CV-05 | Unknown contract/version fails closed before mutation | coarse `UNSUPPORTED` | none | `compatibility` | unsupported test | historical Java | authoritative gate receipt + caller binding |
| CV-06 | Compatibility is explicit, directional and policy-bound | absent | none | absent | absent | none | fresh policy/decision model |
| CV-07 | Transitive compatibility is explicit when required | absent | none | absent | absent | none | fresh policy/decision model |
| CV-08 | Version numbering never substitutes for schema/protocol compatibility proof | violated by same-major rule | none | current coarse rule | existing same-major test | historical Java | replace inference with validator decision |
| CV-09 | Compatibility decision binds exact source/target bytes and validator/policy revision | absent | none | absent | absent | none | fresh immutable decision receipt |
| CV-10 | Breaking change has explicit immutable migration edge | target-version `migrationId` | volatile | `ContractVersion` | major migration requirement test | historical Java | explicit from->to edge + digest |
| CV-11 | Migration is resumable/idempotent/input-digest-bound | `MigrationService` | in-process store/checkpoint | `MigrationCheckpoint` | F-WP-012 migration cases | historical Java | durable checkpoint adapter |
| CV-12 | Migration identity/digest conflicts halt | `MigrationService` | in-process | `migrate` | conflict cases | historical Java | preserve in fresh durable adapter |
| CV-13 | Ambiguous legacy mapping quarantines | `LegacyCrosswalkService` | volatile | `LegacyBinding` | mapped/ambiguous/unmapped cases | historical Java | rebind owner labels + durable state |
| CV-14 | Legacy crosswalk cannot silently transfer semantic ownership | hard-coded `021F` fence | volatile | `LegacyBinding` | owner assertion test | historical Java | replace stale label with current owner registry reference |
| CV-15 | Registry writes are semantic-command idempotent | absent | none | absent | absent | none | command memo in durable journal |
| CV-16 | Registry revision is monotonic and replay reconstructs identical current state | absent | none | absent | absent | none | append-durable registry journal |
| CV-17 | Corrupt/truncated registry replay fails closed | absent | none | absent | absent | none | hash-chain/replay qualification |
| CV-18 | Registration acknowledgment follows durable append in reference adapter | absent | none | absent | absent | none | force-before-ack portable adapter |
| CV-19 | Canonicalization algorithm/version is part of schema identity | absent | none | absent | absent | none | fresh schema artifact model |
| CV-20 | Contract format is explicit (JSON Schema/Proto/custom/etc.) | absent | none | absent | absent | none | fresh schema artifact model |
| CV-21 | Deprecation/sunset/replacement is explicit and revisioned | absent | none | absent | absent | none | fresh lifecycle metadata |
| CV-22 | Deprecated != incompatible; callers receive exact standing | absent | none | absent | absent | absent | fresh resolution receipt |
| CV-23 | Contract authority owns structure/version, not business meaning | architecture only | none | owner boundary | SYSTEM-SPECIFICATION | architecture | enforce in APIs/tests |
| CV-24 | Contract decisions cannot grant identity/effect/placement/runtime authority | architecture only | none | owner boundary | SYSTEM-SPECIFICATION | architecture | enforce receipt shape/tests |
| CV-25 | Fresh System Root/Identity seam contracts can be registered without importing their semantics | current interfaces exist, registry binding absent | none | multiple Java records | current qualification proves those owners only | hosted portable | registry/admission integration |
| CV-26 | Historical PASS never transfers across changed version/digest/ownership subject | governance rule | evidence records | exact-subject evidence rule | current authority/worklist | governance | enforce evidence linkage in receipts |
| CV-27 | Export preserves contract identity/version references and event order | `PortabilityService` | derived manifest | `ExportManifest` | F-WP-012 cases | historical Java | allocate generic refs vs change-governance export truth |
| CV-28 | Contract metadata cannot persist bearer secrets | basic portability secret screen | none for registry | safe metadata validation | F-WP-012 secret cases | historical Java | bounded reference-only registry fields |
| CV-29 | Compatibility evaluator error/unknown is fail-closed, never guessed | absent | none | absent | absent | none | explicit UNKNOWN/ERROR standing |
| CV-30 | Concurrent writers cannot create divergent canonical version identity | synchronized process only | volatile | Java monitor | no cross-process test | historical Java | single-writer durable append + concurrency test |

**Census result: 30/30 bounded Contracts & Versioning invariants accounted; 0 unaccounted.** Accountability does not mean completion: the blocker column is authoritative for unfinished rows.

## Adjudication

### Reuse

- Preserve F-WP-012 create-once version identity, digest-conflict failure, crosswalk quarantine, resumable/digest-bound migration concepts and ordered safe export evidence.
- Preserve existing System Root / Identity owner authority; Contracts only registers their interface structure/version identities.
- Preserve historical tests as donor regression evidence, not fresh PASS.

### Repair / replace narrowly

- Replace same-major compatibility inference with explicit validator/policy decisions.
- Move all registration validation before canonical mutation.
- Replace target-version `migrationId` with immutable migration edges.
- Replace hard-coded historical semantic-owner labels with current owner references.
- Introduce append-durable registry/revision/idempotency/replay authority.

### Allocate elsewhere

- Business semantics stay with their semantic owner.
- Change-history canonical state/export orchestration stays with Change/Migration/Release governance.
- Authorization/effect/route/placement/runtime standing stay with their dedicated Foundation systems.

## Successor

Dependency-valid successor: `CORE-CONTRACTS-VERSIONING-DESIGN-LOCK-001` — freeze the fresh contract subject/version/schema artifact, compatibility policy/decision receipt, migration/deprecation, durable registry and pre-mutation gate contracts plus an isolated qualification denominator before runtime build.
