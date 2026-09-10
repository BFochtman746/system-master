# SYSTEM-MASTER-KNOWLEDGE-REUSE-CATALOG-DESIGN-001

Status: PROPOSED_NONAUTHORITATIVE_ARCHITECTURE_FOR_ADMISSION
Date: 2026-09-10
Owner: SYSTEM_MASTER product-root governance

## Objective

Make prior research, code, tests, qualifications, archived material and future-system plans discoverable and traceable so a request such as **“build the Programming System”** begins from a precomputed evidence packet instead of repeating historical archaeology.

This design does not create any future peer system. `governance/CURRENT-AUTHORITY.json` and its selected topology/ADR remain the only architecture authority.

## Forensic basis

Existing evidence already proves that System Master has a large reusable body of work rather than an empty greenfield:

- the recovered historical module queue contains 40 module families;
- the vault integrity rebase normalized 36 as research-closed, one absorbed, one deferred and two then-open research families;
- the Programming/Code family alone was recorded with 14 R64 and 350 Orivellum candidate files plus `programming-core` / `source-code-001` authority lineage;
- later Programming capability ledgers span foundation, build execution, test execution/coverage, mutation/static/dynamic analysis, security, performance, diagnosis/repair, validation/acceptance, release/deployment/operations/maintenance and documentation;
- old derived “current status” views were explicitly found stale, while the 40-row module queue was designated for rebasing into a new registry;
- conflicting archive sidecars already demonstrate why exact identity, quarantine and provenance are required.

The correct problem is therefore **recovery + normalization + traceability + targeted delta research**, not full rediscovery.

## External design pattern synthesis

The architecture intentionally borrows separated concerns from mature metadata/provenance patterns:

- software catalogs: discover systems/components/interfaces without making the catalog itself source authority;
- SLSA/in-toto: bind claims and provenance to exact production/verification processes and subjects;
- W3C PROV: distinguish entities, activities, agents and derivations;
- OpenLineage: preserve explicit processing-run identity and state transitions;
- SPDX/CycloneDX: describe software/components/dependencies/provenance where software BOM semantics fit;
- BagIt/OCFL-style archival principles: manifest exact payload identity, verify checksums, preserve immutable versions and keep archive custody independent from derived discovery metadata.

No one external schema is sufficient for System Master’s semantic research/control history. Use compatible concepts, not a forced single-standard conversion.

## Required separation of authority

### 1. Active architecture authority

`CURRENT-AUTHORITY -> selected topology/ADR`

Answers: What active systems exist? Who owns current semantic authority? What is retired? What is the active objective?

Catalogs and A-01 never override this layer.

### 2. System catalog

`governance/catalog/SYSTEM-MASTER-SYSTEM-CATALOG-001.json`

Answers: What active, retired, deferred and candidate future systems/families do we know about? Which historical module keys and reusable evidence families relate to each?

A candidate entry is discovery metadata only. Promotion to an active first-class system requires explicit user instruction and the normal topology admission transaction.

### 3. Immutable source/custody registry

Future: `governance/catalog/SYSTEM-MASTER-ARCHIVE-SOURCE-REGISTRY-001.json`

Each source item records a stable locator and, when available, exact digest/size/version/ref. Sources include Git commits/branches/tags, Library file IDs/versions, historical archives, qualification artifacts, manifests and imported source trees.

The registry never silently replaces source bytes with extracted summaries.

### 4. Asset/capability catalog

Future: `governance/catalog/SYSTEM-MASTER-ASSET-CATALOG-001.jsonl` or partitioned JSON.

One record per reusable asset or logical evidence bundle. Required fields:

- `asset_id`
- `source_locator` (`git` ref/SHA/path, Library file ID/version, archive object path, artifact ID)
- digest/size where available
- `evidence_class`: research/spec/control/code/test/fixture/qualification/receipt/build-packet/archive/data/model/etc.
- `lifecycle`: CURRENT/CANONICAL/HISTORICAL/CANDIDATE/QUARANTINED/SUPERSEDED
- `system_affinity[]` and `capability_ids[]`
- current owner or `OWNER_CANDIDATE`
- research/implementation/qualification standing kept as separate fields
- dependencies and consumers
- provenance edges
- reuse disposition: `REUSE_AS_IS`, `REUSE_WITH_REQUALIFICATION`, `REFERENCE_ONLY`, `MIGRATION_INPUT`, `DELTA_RESEARCH_REQUIRED`, `QUARANTINE`
- classification confidence/method and human override pointer
- ingest/process run ID.

### 5. Trace/provenance graph

Future: `governance/catalog/SYSTEM-MASTER-TRACE-GRAPH-001.jsonl`

Minimum edge types:

`DERIVED_FROM`, `IMPLEMENTS`, `SATISFIES`, `QUALIFIED_BY`, `DEPENDS_ON`, `CONSUMED_BY`, `SUPERSEDES`, `RETIRED_INTO`, `OWNED_BY`, `EVIDENCE_FOR`, `CONFLICTS_WITH`, `DUPLICATES`, `MIGRATION_INPUT_FOR`, `RESEARCH_SUPPORTS`.

Every edge is source-backed. Ambiguous semantic relations are recorded as candidate edges and do not become authority by inference.

### 6. A-01 deterministic processing / qualification plane

A-01 is an executor and verifier, not the knowledge base and not the system architect.

Appropriate A-01 jobs:

1. hash and manifest exact presented bytes;
2. verify archive/file completeness and duplicate/conflict identity;
3. execute deterministic extractors/indexers over admitted inputs;
4. validate catalog/graph schemas, references and invariants;
5. generate SBOM/provenance/attestation artifacts where applicable;
6. run exact-subject tests/qualifications;
7. emit append-only ingest/process receipts with input/output identity;
8. run consistency audits: missing owner, orphan evidence, stale references, conflicting digests, impossible PASS transfer, unbound requirements.

A-01 must never:

- decide a candidate is now a first-class system;
- silently reassign semantic ownership;
- rewrite historical taxonomy to match current names;
- infer missing private/human/author/native evidence;
- equate research complete with implementation complete;
- transfer PASS across changed subject bytes;
- discard conflicting source material merely to create a clean catalog.

### 7. Per-system reusable build packets

Future path: `governance/catalog/system-packets/<SYSTEM_OR_CANDIDATE>.json`

A packet is a generated, refreshable discovery view. It includes:

- system/candidate identity and lifecycle;
- architecture authority and owner standing;
- relevant historical module keys;
- exact reusable assets grouped by capability;
- completed research and its currency/delta triggers;
- reusable implementation/code/tests and qualification status;
- requirements and dependencies;
- contradictions/quarantine items;
- known missing evidence;
- standards/research drift checks required before implementation;
- first genuinely unclosed work package.

Packets are caches/views and may be regenerated. Source registries and current authority remain controlling.

### 8. Chat bootstrap integration

Every substantive system-build chat should read:

`CURRENT-AUTHORITY -> SYSTEM CATALOG -> requested system packet -> exact relevant sources -> current delta research`

Only if the packet is missing or evidence says it is incomplete should broad archive archaeology run again.

## Programming System example

On **“let’s build the Programming System”**:

1. CURRENT-AUTHORITY confirms Programming is not yet an active peer unless a later topology says otherwise.
2. SYSTEM-MASTER-SYSTEM-CATALOG resolves candidate `PROGRAMMING`.
3. `system-packets/PROGRAMMING.json` is loaded.
4. The packet exposes `MOD-CODE-001`, 14 R64 + 350 Orivellum candidate history, `programming-core`, `source-code-001`, CODE-QUAL lineage and the Programming atomic capability ledgers.
5. A-01 or hosted preprocessing verifies exact recoverable inputs and catalog integrity; unavailable archives remain explicit gaps rather than invented custody.
6. The research method runs only a **material current delta** across standards, best systems, failures and user needs; completed historical research is not replayed without a reopen trigger.
7. If the user still wants Programming as a first-class peer, perform one atomic system-admission transaction: topology/ADR, canonical control, obligations, repair inbox, Second Shift lane/worker, telemetry, morning/chat startup, and validator coverage.
8. Implementation begins at the first evidence-backed unclosed work package, not at “learn what Programming is.”

## Ingestion sequence

### Phase A — control-plane normalization

- current topology/expectation/reallocation consistency
- active/retired system catalog
- archive source registry schema
- asset/trace schemas
- A-01 catalog-ingest qualification contract

### Phase B — source census without mutation

Inventory Git refs/history, Library artifacts, archived vault material, qualification artifacts and known external provenance. Assign stable source IDs. No semantic promotion.

### Phase C — high-value system packet generation

Start with Programming because it has a large existing evidence corpus and the user has identified it as a future build target. Then process the other candidate families in priority order.

### Phase D — global cross-system graph

Resolve duplicates, cross-system dependencies, shared capabilities, migration inputs and quarantined conflicts. Preserve uncertainty.

### Phase E — continuous delta maintenance

New evidence enters through deterministic ingest. Current-source drift triggers a targeted delta review rather than a full historical restart.

## Admission gates

This design should be considered successful when:

- a new chat can name a system/candidate and obtain its packet without reconstructing history;
- every catalog claim traces to one or more exact source/evidence records;
- archive conflicts are visible rather than silently normalized away;
- active architecture cannot be changed by catalog/A-01 ingestion alone;
- A-01 receipts prove exactly what was processed and under which extractor/schema/control generation;
- a Programming build can begin with a bounded current-delta audit and first unclosed work package.
