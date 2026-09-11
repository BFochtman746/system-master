# SMR021 DATA-001 Portable Acceptance 003

Standing: **DATA-001 PORTABLE CONTRACT ACCEPTED / LIVE POSTGRESQL PENDING / NO PASS TRANSFER**

This candidate extends the canonical R025 `core_user_interaction_command` and `core_attention_item` persistence surfaces. It does not create parallel command or attention authorities.

Exact local Candidate 003 evidence:
- 447 runnable files; 435 Java files.
- strict Java 21 `--release 21 -Xlint:all -Werror`: PASS.
- 23/23 portable suites: PASS.
- DATA persistence contract: 173 checks PASS.
- ordinary migration artifact parity: 28 checks PASS.
- deterministic fresh archive extraction and per-file SHA-256 manifest verification: PASS.
- qualified ZIP SHA-256: `f1e7ffa6c8c62918ef9e8612126d819a70652db253104c8d6fec6e7b368858a6`.
- Git custody transport tar.xz SHA-256: `02ef249ca7c8a549e3a9a3d21a671f32b3d15432272b218f53c1844176150197`.
- runnable SHA-256 manifest digest: `89c31fafd3134f6faf3496e6eddc3307f204b8d67cf5382e5c7d03fadeb042cd`.

DATA-001 accepts the portable contract shape and semantics for this candidate: immutable admission record, R025 command-to-admission linkage, explicit legacy demotion to `MIGRATED_UNQUALIFIED`, monotonic current-admission selection, evidence-preserving stale/same-version conflict handling, command idempotency, attention dedupe/CAS, and permanently false effect/A-01/native/production authority flags.

The live PostgreSQL 18.6 + pgJDBC 42.7.13 gate remains mandatory before SMR021 Closure-003 may close. Hosted PASS, if obtained, proves only that exact PostgreSQL/runtime boundary. A-01, Apple/native/device, human/private, promotion/publication and production authority remain false and separate.

Git-native runnable custody is not yet complete because the currently exposed GitHub connector can create text/Git objects but has no local binary-file ingestion parameter for the 189,936-byte tar.xz transport. The hash-only manifest is not treated as custody PASS. No source-custody or hosted PASS is fabricated.
