# BOOK-RECONSTRUCTION-B00-C1 — TARGETED RESEARCH 001

Status: **TARGETED RESEARCH COMPLETE / ADJUDICATION INPUT / NOT DESIGN-LOCK / NO BUILD AUTHORIZATION**

Owner: **SYSTEM_MASTER/BOOK**  
Controlling method: `BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001`  
Observed live owner head immediately before this write: `book-system/control-v1@2b29a8018b617d6efb47cad1458ee3a5242d4f0e`  
Predecessor: `BOOK-RECONSTRUCTION-B00-B1-GAP-DEPENDENCY-FAILURE-ANALYSIS-001.md`

## 1. Research scope

Only design-sensitive unknowns from B00-B1 were researched:

1. a rights/policy vocabulary suitable for Book-side **evidence/reference/currentness** semantics without manufacturing legal authority;
2. durable local transaction/crash-recovery semantics suitable for one canonical Book aggregate plus linked specialist receipts;
3. whether a mature machine-readable editorial/copy-edit style-profile standard should replace a compact Book-owned versioned profile.

Generic Book architecture, literary craft, prose evaluation, and native document parsing were intentionally not reopened.

Research date: **2026-09-12**.

## 2. RQ-B00-001 — rights / policy interoperability

### 2.1 W3C ODRL 2.2

Primary sources:

- W3C, **ODRL Information Model 2.2**: https://www.w3.org/TR/odrl-model/
- W3C, **ODRL Vocabulary & Expression 2.2**: https://www.w3.org/TR/odrl-vocab/

Relevant findings:

- ODRL is a W3C Recommendation for expressing policies over Assets using Permissions, Prohibitions and Duties, with Parties, Actions and Constraints.
- The model supports explicit policy identity and roles such as assigner/assignee.
- It supports profiles for community-specific semantics and requires processors to stop when a declared profile is not understood.
- The common vocabulary contains actions directly relevant to Book source/release use, including use, reproduce, distribute, print, transform, translate and related constraints/duties.

### 2.2 Design decision

**Decision: ADOPT-AS-REFERENCE, NOT AS LEGAL AUTHORITY.**

ODRL is useful for the optional machine-readable representation of a policy/permission/prohibition/duty **asserted by an identified authority/evidence source**. It must not be treated as proof that the asserting party had legal authority, that a license is authentic, or that a Book use is legally cleared.

The Book rights/custody record may therefore carry:

- `policy_expression_ref` / exact policy digest;
- optional ODRL policy/profile identifiers;
- identified assigner/evidence issuer;
- target asset/source identity;
- intended Book action/use scope;
- constraints/effective interval/currentness;
- evidence/custody source;
- validation result and Book acceptance disposition.

A syntactically valid ODRL expression never upgrades `UNKNOWN`, `UNVERIFIED`, or human/legal-review-required evidence to `CURRENT_AUTHORIZED` by itself.

### 2.3 SPDX License Expressions

Primary sources:

- SPDX Specification 3.0.1, **SPDX License Expressions**: https://spdx.github.io/spdx-spec/v3.0.1/annexes/spdx-license-expressions/
- Current SPDX development specification, **SPDX License Expressions**: https://spdx.github.io/spdx-spec/v3.1-dev/annexes/spdx-license-expressions/

Relevant findings:

- SPDX defines parseable license expressions using SPDX license identifiers, custom `LicenseRef-*` references, exceptions/additions, and `AND` / `OR` / `WITH` composition.
- Its motivating scope is primarily software/source/binary licensing, even though the expression syntax can identify declared license terms precisely.

**Decision: ADOPT-AS-OPTIONAL IDENTIFIER/EXPRESSION WHERE APPLICABLE, NOT GENERAL BOOK-RIGHTS MODEL.**

If a source's authoritative license evidence already uses a recognized SPDX expression, Book may preserve the exact expression as declared metadata. For general literary, research, media, private, commissioned, contract, or publication rights, SPDX is insufficient as the governing rights model. It must not replace evidence issuer, intended use, custody, temporal/currentness, revocation, privacy, or human/legal authority.

### 2.4 Rights conclusion

The reconstruction should use a **small Book-owned rights/custody evidence record** and allow external vocabularies as references:

- ODRL: optional interoperable policy expression/reference vocabulary;
- SPDX: optional license-expression identifier when the source/license actually fits SPDX;
- Book record: authoritative custody/currentness/acceptance envelope and fail-closed state machine;
- human/external legal authority: remains outside machine inference.

No custom ODRL profile is justified at B00 until concrete Book use cases exceed the core/common vocabulary. A future profile, if needed, must be separately versioned and understood fail-closed.

## 3. RQ-B00-002 — durable canonical aggregate / crash recovery

### 3.1 SQLite transaction semantics

Primary sources:

- SQLite, **Transaction**: https://www.sqlite.org/lang_transaction.html
- SQLite, **Atomic Commit In SQLite**: https://www.sqlite.org/atomiccommit.html
- SQLite, **Isolation In SQLite**: https://sqlite.org/isolation.html
- SQLite, **Write-Ahead Logging**: https://www.sqlite.org/wal.html
- SQLite, **WAL-mode File Format / Recovery**: https://www.sqlite.org/walformat.html

Relevant findings:

- SQLite changes occur inside transactions and explicit `BEGIN` / `COMMIT` / `ROLLBACK` are available.
- Atomic commit is designed so a transaction appears fully committed or not committed even across process/OS crash or power loss, subject to documented filesystem assumptions.
- In rollback-journal mode, recovery uses a hot journal; in WAL mode, committed changes are represented in the WAL and recovery reconstructs the WAL index using frame checksums.
- SQLite serializes writers. In WAL mode readers receive snapshot isolation.
- A stale read transaction attempting to become a writer can fail with `SQLITE_BUSY_SNAPSHOT`; a caller must end that snapshot and begin a new transaction rather than fork history.
- `BEGIN IMMEDIATE` acquires write intent at transaction start, preventing another writer from jumping ahead after the transaction has read current state.

### 3.2 Node runtime status

Primary source:

- Node.js current API, **SQLite (`node:sqlite`)**: https://nodejs.org/api/sqlite.html

Observed on 2026-09-12:

- `node:sqlite` exists in current Node and supports file-backed/in-memory databases, prepared statements and transaction-state inspection.
- The official Node documentation still marks SQLite as **Stability 1.2 — Release candidate**, not Stable.

### 3.3 Design decision

**Decision: ADOPT TRANSACTIONAL SQLITE SEMANTICS AS THE PREFERRED LOCAL DURABILITY MODEL; DO NOT HARD-COUPLE THE B00 CONTRACT TO THE CURRENT `node:sqlite` API YET.**

The canonical parent-store contract must require semantics, not a particular JavaScript binding:

1. one durable transaction for parent current state + parent mutation receipt/idempotency record + history/index changes that define the canonical effect;
2. optimistic exact parent identity precondition (`state_version`, `state_digest`, material subject refs);
3. one-writer serialization or equivalent CAS so competing writes cannot fork Book history;
4. integrity/digest validation on reopen;
5. deterministic exact replay by idempotency key/request fingerprint;
6. conflicting key reuse fails closed;
7. post-crash reopen/recovery must yield either the full committed transaction or the predecessor state;
8. callers must re-read/reconcile after commit or uncertainty rather than assume read-after-write freshness;
9. classified `BUSY`/snapshot/contention is transient only when the operation is idempotent and the parent identity is re-read before retry;
10. no stacked retry loops across store + controller + worker layers.

A SQLite adapter is the **preferred production/local adapter candidate** because those semantics are native to the database and crash-tested by SQLite. The architecture should nevertheless preserve a narrow parent-store port so exact qualification can compare deterministic adapters and so the project is not forced to treat a Node Release Candidate API as constitutional authority.

The existing Book workflow filesystem store remains coordination-only. Its atomic write pattern is useful predecessor evidence, but weakening its `canonical_effect_allowed=false` fence to turn it into parent storage is rejected.

### 3.4 Journal mode decision

**Decision: DO NOT constitutionalize WAL versus rollback-journal mode in B00.**

Both provide atomic transactions through different mechanisms. WAL adds reader/writer concurrency and snapshot behavior but also makes the `-wal` file part of persistent database state while active. The parent-store adapter must freeze and qualify its selected journal/synchronous settings per deployment environment. The canonical Book contract depends on transaction/atomicity/recovery semantics, not a specific journal mode.

## 4. RQ-B00-003 — machine-readable copy-edit / style-profile standard check

Primary authoritative bounded check:

- W3C, **Manual of Style**: https://www.w3.org/guide/manual-of-style/

The W3C material is a human editorial guide/best-practice document, not a cross-publisher machine-readable schema for governing Book copy-edit profiles. A bounded W3C/IETF standards search did not identify a mature interoperable standard that supplies the Book-specific combination needed here: profile versioning, terminology/spelling rules, protected-language references, explicit exceptions, author-governed overrides, invalidation/currentness, and provider-safe bounded projection.

**Decision: KEEP AN INTERNAL, VERSIONED BOOK STYLE-PROFILE CONTRACT.**

Do not introduce a standards dependency merely for standards appearance. The profile should remain intentionally small and serializable, and may reference human style authorities by stable metadata/edition identifiers. If a future actual provider requires a compatible external format, add an adapter/projection without transferring governing-profile authority away from Book.

This is a bounded research conclusion, not a universal assertion that no style tooling or proprietary style schemas exist.

## 5. Research adjudication matrix

| Question | Decision | What Book may adopt | What Book must reject |
|---|---|---|---|
| Rights-policy interoperability | **ADOPT-AS-REFERENCE** | ODRL policy/profile/action/constraint references bound to exact evidence and issuer | treating syntactic policy validity as legal clearance |
| License identifier expression | **OPTIONAL / APPLICABLE-SOURCES ONLY** | SPDX expression when authoritative source evidence already uses/fits it | using SPDX as a universal literary/media/private-rights model |
| Legal/private authority | **KEEP EXTERNAL/HUMAN** | exact evidence refs, authority identity, currentness, Book acceptance state | machine-manufactured clearance or permission |
| Canonical durability | **ADOPT SQLITE TRANSACTION SEMANTICS** | transactional/CAS/crash-recovery contract, SQLite adapter candidate | multi-file best-effort canonical commits or specialist-ledger distributed truth |
| Node built-in SQLite API | **DEFER HARD BINDING** | adapter behind parent-store port, qualify when runtime matrix admits it | making current Stability 1.2 API constitutional dependency without toolchain qualification |
| WAL mode | **ADAPTER/ENVIRONMENT DECISION** | configure and qualify per deployment | assuming WAL is universally required or copying DB without required WAL state |
| Editorial style profile | **KEEP INTERNAL VERSIONED CONTRACT** | compact Book-owned profile + external guide refs/adapters | inventing a false universal machine-readable style standard |

## 6. Resulting design constraints

1. Canonical parent durability shall be transaction-based, not a chain of independent file writes.
2. Parent effect + idempotency/commit receipt + canonical history required for that effect shall commit atomically inside the parent authority boundary.
3. Specialist ledgers remain separately owned process/evidence truth; cross-ledger integration is reconciliation-based and idempotent rather than distributed two-phase commit by default.
4. Rights/custody state stores evidence **about** authority and currentness; it never creates legal authority.
5. ODRL/SPDX values are typed external references and must preserve issuer/source/digest/currentness.
6. Unknown policy profile/vocabulary, expired/revoked evidence, unknown issuer, source mismatch, or intended-use mismatch fails closed.
7. The governing style profile is Book-owned, versioned and parent-referenced; editing providers receive projections only.
8. Storage binding remains behind a narrow port until the exact supported Node/native environment is qualified.

## 7. Targeted research standing

- RQ-B00-001: **CLOSED FOR DESIGN ADJUDICATION**.
- RQ-B00-002: **CLOSED FOR DESIGN ADJUDICATION**; exact adapter/toolchain qualification remains future evidence.
- RQ-B00-003: **CLOSED FOR DESIGN ADJUDICATION** under bounded standards search.
- Generic research reopening: **NOT JUSTIFIED**.
- ADJUDICATE: **ADMITTED**.
- DESIGN-LOCK: **NOT YET ADMITTED**.
- BUILD: **NOT ADMITTED**.

## 8. Exact next operation

**`BOOK-RECONSTRUCTION-B00-D1 — AUTHORITY/SCHEMA/STORE/RECONCILIATION ADJUDICATION + DESIGN-LOCK ENTRY CRITERIA`**

D1 must choose the exact truth-owner split, canonical parent durable transaction boundary, typed effect envelope, rights/custody object, governing style-profile object, specialist effect/reconcile contract, and qualification denominator classes. Only after contradictions are eliminated may the result advance to formal DESIGN-LOCK.

## 9. Evidence fences

This research creates no legal opinion, rights clearance, private-source permission, author decision, native fidelity, publication authorization, production installation, or A-01 evidence. External standards are design references only.