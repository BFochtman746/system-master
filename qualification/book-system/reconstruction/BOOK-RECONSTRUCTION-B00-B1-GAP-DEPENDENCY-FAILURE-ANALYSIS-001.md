# BOOK-RECONSTRUCTION-B00-B1 — GAP / DEPENDENCY / FAILURE ANALYSIS 001

Status: **ANALYSIS COMPLETE FOR CURRENT CENSUS / TARGETED RESEARCH REQUIRED BEFORE ADJUDICATION / NO BUILD AUTHORIZATION**

Owner: **SYSTEM_MASTER/BOOK**  
Controlling method: `BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001`  
Observed predecessor head: `book-system/control-v1@b21ebd7da42e284346d4637be03170aa4189deeb`  
Input freeze: `BOOK-RECONSTRUCTION-B00-A4-LOSSLESS-READINESS-CENSUS-AND-B00A-FREEZE-001.md`

## 1. Analysis objective

B00-A established 30/30 accounted requirements and zero unclassified requirement rows. B00-B now asks what must change, in what dependency order, and what can fail if reconstruction simply promotes existing pieces without repair.

The principal conclusion is that B00 is **not a greenfield implementation problem**. Most specialist mechanics already exist. The central missing substrate is one reusable/durable canonical parent authority plus several explicit metadata contracts and a safe commit/reconcile boundary around existing specialist ledgers.

## 2. Gap classes

### G1 — Reusable canonical parent runtime — CRITICAL

Material canonical semantics remain in the qualifier/model rather than an admitted reusable runtime.

Missing reusable substrate includes:

- canonical aggregate validation;
- exact state digest/version identity;
- active pointer validation and mutation;
- typed parent effects;
- authority scope enforcement;
- transaction atomicity;
- parent mutation history/audit receipt;
- deterministic replay/idempotency;
- restart/reconcile behavior.

**Dependency:** all specialist runtime rebinds ultimately depend on this boundary.

### G2 — Canonical parent durable store — CRITICAL

The current workflow durable store is explicitly coordination-only and rejects canonical-effect fields. Its filesystem adapter performs atomic file replacement with fsync/rename/fsync-directory semantics, but it is not canonical Book state persistence.

Therefore B00 currently has no proven reusable durable parent-state store that can safely commit canonical effects and recover them after restart.

**Dependency:** G1 schema/transaction contract must precede or co-design G2; G2 must exist before isolated reconstruction qualification can prove restart/durability.

### G3 — Cross-ledger commit/reconcile semantics — CRITICAL

Existing specialist runtimes maintain their own ledgers:

- version/rollback;
- lifecycle;
- integration proposal;
- author decision queue;
- export freeze;
- workflow evidence/coordination.

Several specialist operations also construct or return successor parent state. A crash between specialist-ledger persistence and parent persistence could otherwise create split truth.

Required resolution:

- one canonical commit authority;
- deterministic typed effect request identity;
- specialist ledger pre/post identities;
- commit receipt linking parent effect to specialist evidence;
- replay/reconcile path for `commit succeeded / response lost`;
- explicit handling of `specialist durable / parent not committed` and `parent committed / specialist response not observed` windows;
- no stacked retry layers.

### G4 — Rights/licensing/custody reference/currentness authority — HIGH

Current runtime consumes rights/privacy standing but does not implement a complete Book-side versioned acceptance/currentness contract.

This is not a legal decision engine. The gap is the Book-owned representation and validation of authoritative evidence/reference/currentness/intended-use standing.

### G5 — Governing copy-edit/style profile authority — HIGH

Editorial stages exist, but a versioned governing style/copy-edit metadata object and current profile pointer were not recovered.

This is Book metadata authority, not ownership of the editing provider.

### G6 — Cross-B00 privacy/minimum-persistence invariant — HIGH

Workflow evidence already forbids raw manuscript/private payload fields. Equivalent minimum-necessary persistence must be proved across parent history, proposal, rights/custody, author decision and style-profile surfaces.

### G7 — External/native provider contract completeness — MEDIUM/HIGH

Native PDF/DOCX/OCR mechanics remain external. Book must preserve exact source identity/digest/tool-version/provenance/currentness and reject stale/mismatched results without claiming native fidelity.

### G8 — Publication authorization separation — HIGH

Export freeze runtime correctly records publication as not authorized by default. Final publication/delivery transition must require explicit author/external authority evidence and cannot be inferred from technical export success.

### G9 — Reconstruction qualification denominator — CRITICAL BEFORE BUILD/FREEZE

Historical tests are valuable predecessor evidence but cannot qualify reconstructed bytes. B00 needs a frozen isolated denominator plus cumulative regression against every reused specialist runtime.

## 3. Existing substrate to reuse rather than rewrite

| Substrate | Reuse decision | Repair/rebind needed |
|---|---|---|
| `version-and-rollback-core.js` | REUSE | stop treating snapshots as alternate live parent authority; bind through canonical parent commit port |
| `content-object-admission-core.js` | REUSE | route proposed parent effects through parent writer; preserve exact provenance/currentness guards |
| lifecycle runtime + compatibility/rebind adapters | REUSE | keep adapter knowledge; project through current parent schema; centralize project-status commit |
| `integration-proposal-runtime-v2-core.js` | REUSE | proposal ledger remains process truth; only admitted typed effect reaches parent |
| author-decision queue/current-subject/applicability | REUSE | queue remains workflow truth; final current decision effect reaches parent |
| `export-freeze-core.js` | REUSE | freeze validation/receipt remains specialized; parent release mutation centralized |
| workflow evidence/provenance | REUSE | preserve absolute `canonical_effect_allowed=false` |
| workflow durable store | REUSE FOR COORDINATION ONLY | do not weaken forbidden canonical-effect rule; parent state needs separate admitted store |
| existing-book semantic recovery | REUSE | keep native extraction external and exact-source-bound |

## 4. Dependency order

### D0 — Preserve frozen B00-A census

No implementation may erase/merge requirement rows or silently reclassify external/human boundaries.

### D1 — Targeted research on only design-sensitive unknowns

Research is justified for:

1. interoperable rights/license expression and policy vocabularies suitable as **references/evidence**, not automatic legal authority;
2. durable local transactional/CAS patterns suitable for one canonical aggregate plus linked specialist receipts, especially crash recovery and idempotent replay.

Research is **not** currently justified for generic Book architecture, literary craft, prose evaluation, or native document parsing because those do not change this B00 design decision.

### D2 — Adjudicate canonical schema/authority

Freeze:

- parent aggregate schema versioning/migration;
- typed effect vocabulary;
- parent commit receipt;
- durable history model;
- rights/custody object/reference model;
- style-profile object/reference model;
- exact canonical-vs-ledger truth ownership.

### D3 — Design-lock parent runtime + store + reconcile contract

No specialist rebind BUILD before this.

### D4 — Build canonical parent core/store first

Smallest reusable runtime extracted from qualifier semantics, not a copy of the qualifier file.

### D5 — Rebind specialist runtimes in dependency order

Recommended order:

1. version/rollback;
2. content admission;
3. lifecycle current-parent adapter/rebind;
4. author decision queue/applicability;
5. integration proposal admission;
6. rights/custody acceptance/currentness;
7. governing style-profile metadata;
8. export freeze/release;
9. workflow evidence/recovery integration.

### D6 — Isolated qualification

Parent core/store first, then each rebind incrementally.

### D7 — Cumulative regression/calibration

All B00 families plus B01 seam regressions, restart/race/failure injection and authority-boundary negatives.

### D8 — Freeze B00 only if all closure conditions hold

Unaccounted requirements = 0; exact reconstructed implementation qualified; cumulative denominator green; blocker/evidence boundaries preserved.

## 5. Failure-mode analysis

### F1 — Dual canonical writer

**Scenario:** specialized runtime commits parent state directly while parent core also accepts typed effect.  
**Consequence:** divergent current truth / lost updates.  
**Required control:** only canonical parent store may persist canonical state; specialized runtimes prepare effects and evidence only.

### F2 — Specialist-first partial commit

**Scenario:** specialist ledger is durably advanced; process dies before parent commit.  
**Consequence:** specialist says committed while parent has no effect.  
**Required control:** specialist state must distinguish PREPARED/PENDING_PARENT from COMMITTED, or use a transaction boundary where possible; reconcile from durable request/effect identity.

### F3 — Parent-first response loss

**Scenario:** parent commits; caller loses response and retries.  
**Consequence:** duplicate effects unless exactly replay-safe.  
**Required control:** immutable idempotency key + request fingerprint + stored commit receipt; exact replay returns prior receipt; conflicting reuse fails.

### F4 — Cross-ledger stale parent

**Scenario:** proposal/author/lifecycle/export result was prepared against parent N and submitted after parent N+1.  
**Consequence:** stale effect admitted.  
**Required control:** effect carries expected parent version/digest and material subject refs; fail closed and revalidate/reprepare.

### F5 — Snapshot promoted as live truth

**Scenario:** rollback/version snapshot is read as current canonical state.  
**Consequence:** duplicate owner and stale active pointers.  
**Required control:** snapshot explicitly historical; current state only from parent store.

### F6 — Rights flag injection

**Scenario:** caller supplies `CURRENT_AUTHORIZED` without trusted evidence issuer/reference/currentness.  
**Consequence:** synthetic legal authority.  
**Required control:** rights/custody record must bind authority/evidence reference and currentness policy; untrusted caller flags never create authority.

### F7 — Style-provider authority escalation

**Scenario:** editing provider chooses/changes governing style profile.  
**Consequence:** specialist service changes Book governance.  
**Required control:** provider receives exact bounded style-profile projection; findings/proposals only; Book parent owns current profile pointer.

### F8 — Native extraction identity drift

**Scenario:** normalized text came from different bytes/tool version/source than Book expects.  
**Consequence:** recovery/admission targets wrong content.  
**Required control:** exact source digest/locator/tool identity/currentness in provider receipt and Book acceptance.

### F9 — Publication inferred from technical PASS

**Scenario:** export/render proof passes and state advances to publication automatically.  
**Consequence:** unauthorized publication.  
**Required control:** publication remains separate explicit authority transition; technical export can at most freeze a release candidate.

### F10 — Canonical durable store torn/corrupt write

**Scenario:** crash during persistence or corrupted record on restart.  
**Consequence:** unknown parent truth.  
**Required control:** atomic durable write or transactional store, digest/integrity checks, predecessor/recovery record, fail-closed recovery.

### F11 — Read-after-write assumption

**Scenario:** caller assumes immediate read reflects its write across adapter/process/storage boundary.  
**Consequence:** incorrect follow-up effects.  
**Required control:** commit receipt is authoritative for the operation; subsequent work re-reads/reconciles current state.

### F12 — Privacy leakage into history

**Scenario:** raw manuscript/private source content copied into parent audit/history/rights record.  
**Consequence:** durable privacy exposure.  
**Required control:** history stores refs/digests/minimum metadata; raw private payload prohibition tested recursively.

## 6. Build-order adjudication before research

The dependency graph makes **canonical parent core/store/reconcile** the first implementation target. Rights/custody and style-profile schemas must be resolved before final parent schema design-lock, but their runtime implementation can follow initial parent core if the schema is migration-safe and the design lock explicitly versions the aggregate.

No scheduler/open-seam backlog is dependency-valid while this reconstruction remains open.

## 7. Targeted research questions

Only the following questions can materially change design:

### RQ-B00-001 — Rights/license vocabulary

Can a mature interoperable standard supply identifiers/terms for permissions, prohibitions, duties, assignee/assigner, asset, policy identity, temporal/spatial constraints and license expressions while Book retains fail-closed evidence/reference semantics rather than treating the vocabulary as automatic clearance?

### RQ-B00-002 — Durable canonical aggregate transaction/recovery

For a local-first Node runtime, what persistence pattern most safely provides atomic replace/transaction, optimistic concurrency/CAS, crash recovery, integrity verification and idempotent replay, while allowing specialized ledgers to reconcile without distributed two-phase commit?

### RQ-B00-003 — Style-profile interoperability

Is there a mature machine-readable standard for editorial/copy-edit style profiles that materially improves the proposed Book-specific governing metadata model? If not, keep a compact versioned internal profile and avoid inventing a false standard dependency.

## 8. B00-B1 standing

- ANALYZE: **COMPLETE for current frozen B00-A census**.
- TARGETED RESEARCH: **REQUIRED for RQ-B00-001 and RQ-B00-002; bounded check for RQ-B00-003**.
- ADJUDICATE: **NOT YET COMPLETE**.
- DESIGN-LOCK: **NOT ADMITTED**.
- BUILD: **NOT ADMITTED**.

## 9. Exact next operation

**`BOOK-RECONSTRUCTION-B00-C1 — TARGETED RESEARCH: RIGHTS/POLICY INTEROP + DURABLE CANONICAL AGGREGATE/CRASH-RECOVERY + STYLE-PROFILE STANDARD CHECK`**

Research output must cite primary/authoritative sources, distinguish standards from implementation choices, and conclude with explicit KEEP / ADOPT-AS-REFERENCE / REJECT decisions. It must not reopen generic research or transfer external standards into Book authority automatically.

## 10. Evidence fences

No author/private/legal/native/publication/A-01/production evidence is synthesized. This analysis changes no canonical Book state and authorizes no product implementation.
