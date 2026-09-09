# SMR021 Persistence + Concurrency Research Delta 001

Date: 2026-09-09
Owner lane: `SYSTEM_MASTER/CORE`
Status: **RESEARCH_AHEAD CLOSED / PRESERVE CURRENT DESIGN + STRENGTHEN CONCURRENT EVIDENCE**
Parent readiness: `SMR021-ADMISSION-BINDING-TOMORROW-READINESS-001.md`

## Question closed

Does current PostgreSQL behavior justify changing the recovered R025 idempotency/attention-concurrency design before the exact dependency-current source is recovered, or should the design be preserved and validated more strongly under real concurrency?

## Sources and provenance

Accessed 2026-09-09.

1. PostgreSQL 18 — INSERT / `ON CONFLICT`
   - https://www.postgresql.org/docs/18/sql-insert.html
   - Current documentation states that unique indexes can arbitrate conflicts and `ON CONFLICT DO UPDATE` guarantees an atomic INSERT-or-UPDATE outcome under concurrency; `DO NOTHING` is an explicit alternative to raising the unique violation.

2. PostgreSQL 18 — Transaction Isolation
   - https://www.postgresql.org/docs/18/transaction-iso.html
   - Relevant behavior: in Read Committed, concurrent conflicts may affect `ON CONFLICT` outcomes even where the conflicting row was not visible in the earlier command snapshot; each command obtains the visibility appropriate to Read Committed semantics.

3. PostgreSQL 18 — Constraints / Unique Constraints
   - https://www.postgresql.org/docs/18/ddl-constraints.html
   - Relevant principle: multicolumn unique constraints enforce uniqueness of the specified tuple across rows.

4. PostgreSQL 18 — Unique Indexes
   - https://www.postgresql.org/docs/18/indexes-unique.html
   - Relevant principle: a unique index rejects equal indexed tuples and is the enforcement mechanism underlying PostgreSQL unique constraints/primary keys.

5. IETF HTTPAPI — `draft-ietf-httpapi-idempotency-key-header-07`
   - https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
   - Current status as of this research: **expired Internet-Draft**, not an active RFC/standard. It is background evidence only and must not be used as normative authority for redesign.

## Historical recovered implementation evidence

The immutable historical v2.0.24 carrier contains `JdbcUserExperienceStore` behavior that already has the key semantic protections:

### Command idempotency

- starts an explicit transaction;
- checks existing command identity and `(work_id, idempotency_key)` compatibility;
- rejects `command_id` reuse with different intent;
- rejects idempotency-key reuse with different intent;
- inserts with `ON CONFLICT DO NOTHING`;
- if insertion loses a race, re-reads the competing row and requires compatible `sameIntent` before returning it;
- otherwise fails instead of interpreting an unexplained conflict as success.

Historical database schema separately has a unique index on `(work_id, idempotency_key)`.

### Attention dedupe

- uses a unique open-attention dedupe identity per work;
- on conflict, re-reads and requires matching semantic metadata;
- conflicting metadata under the same dedupe identity fails.

### Attention transition concurrency

Historical transition SQL uses a compare-and-set shape:

`UPDATE ... SET status=?, updated_at=? WHERE attention_id=? AND status=? AND updated_at=?`

and requires exactly one updated row; otherwise it throws a concurrent-modification failure.

## Dispositions

### 1. Database-enforced unique idempotency identity

Disposition: **KEEP**

Do not replace the database unique `(work_id, idempotency_key)` invariant with application-only check-then-insert logic.

The database constraint is the concurrency authority for duplicate identity. Application checks are semantic compatibility checks around that atomic database boundary.

### 2. Same key + different intent must fail

Disposition: **KEEP / STRENGTHEN CONCURRENT TESTING**

`ON CONFLICT DO NOTHING` must never by itself mean "idempotent replay succeeded." After a conflict, the implementation must establish that the existing record represents the same intent under the current canonical `sameIntent` definition.

Candidate concurrent cases:

1. `SAME_KEY_SAME_INTENT_RACE_ONE_DURABLE_RECORD`
2. `SAME_KEY_DIFFERENT_INTENT_RACE_ONE_SUCCESS_ONE_CONFLICT`
3. `SAME_COMMAND_ID_DIFFERENT_INTENT_REJECT`
4. `DIFFERENT_WORK_SAME_IDEMPOTENCY_KEY_INDEPENDENT` where current contract scopes idempotency by work.

### 3. Pre-check is not sufficient concurrency authority

Disposition: **KEEP DATABASE RACE PATH / DO NOT SIMPLIFY**

The initial `findCompatible(...)` is an optimization/early semantic check, not a substitute for the unique constraint and post-conflict re-read. A concurrent writer can win after the pre-check.

Do not refactor the dependency-current store into `SELECT -> INSERT` without preserving database conflict arbitration and the race re-read.

### 4. Attention dedupe semantic conflict

Disposition: **KEEP / STRENGTHEN CONCURRENT TESTING**

Concurrent creation of the same open attention should converge only when semantic metadata matches. Same dedupe identity with divergent severity/kind/title/action/evidence must not silently coalesce.

Candidate cases:

5. `ATTENTION_SAME_DEDUPE_SAME_METADATA_RACE_CONVERGES`
6. `ATTENTION_SAME_DEDUPE_DIFFERENT_METADATA_RACE_CONFLICTS`
7. `ATTENTION_DEDUPE_IS_WORK_SCOPED`

### 5. Optimistic attention transition

Disposition: **KEEP / VERIFY CURRENT EXACTNESS**

The historical `status + updated_at` compare-and-set pattern is a valid optimistic-concurrency shape when `updated_at` round-trips with the exact precision and semantics expected by the current database/driver contract.

After exact SMR020 recovery, verify the dependency-current schema/JDBC timestamp precision before relying on it. If exact round-trip is demonstrated, preserve it. If precision coercion is reproduced as a real ambiguity, prefer an existing/current explicit version or revision identity if available; do not invent a new counter merely because it is conventional.

Candidate cases:

8. `ATTENTION_TWO_WRITERS_SAME_EXPECTED_VERSION_ONLY_ONE_TRANSITIONS`
9. `ATTENTION_STALE_UPDATED_AT_REJECT`
10. `ATTENTION_TIMESTAMP_ROUNDTRIP_EXACT_FOR_CAS` where the current store still uses timestamp CAS.

### 6. Transaction outcome and side-effect boundaries

Disposition: **KEEP / ADD FAILURE-ATOMICITY EVIDENCE**

A failed conflicting command or attention operation must not leave partial durable state. This aligns with the already-sealed authorization requirement that rejected admission attempts do not persist intent.

Candidate cases:

11. `IDEMPOTENCY_CONFLICT_NO_PARTIAL_ROW`
12. `ATTENTION_METADATA_CONFLICT_NO_PARTIAL_ROW`
13. `FAILED_CAS_NO_SECOND_STATE_MUTATION`

### 7. Do not import generic event sourcing or distributed locks

Disposition: **DO_NOT_ADD**

No evidence currently justifies replacing the bounded relational uniqueness/CAS model with event sourcing, a distributed lock manager, Redis lock service, generic workflow engine or another platform.

The current problem is evidence strength and exact-current-source verification, not lack of an architectural pattern.

### 8. IETF Idempotency-Key draft

Disposition: **DO_NOT_TREAT_AS NORMATIVE**

The latest surfaced HTTPAPI Idempotency-Key document is expired as of 2026-04-18. System Master may retain its own repository-defined idempotency contract. Do not add an HTTP header or alter internal idempotency semantics solely because the expired draft exists.

## Integration with SMR021 qualification

When exact dependency-current source is recovered, add a **bounded live/ephemeral PostgreSQL concurrency gate** if the current qualification environment can execute it without claiming target-production PostgreSQL evidence.

Minimum 13-case persistence/concurrency matrix is listed above.

Evidence must record:

- PostgreSQL version actually executed;
- schema/migration identity;
- exact candidate subject;
- transaction isolation actually used;
- worker/thread/process concurrency setup;
- final row counts and identities;
- exact conflict classification;
- proof that failed races did not create partial state.

An ephemeral PostgreSQL PASS proves only the tested PostgreSQL/runtime boundary. It does not automatically prove production deployment configuration, HA behavior, failover, network partition handling or managed-service settings.

## Closed research result

**No persistence architecture redesign is justified before exact-current-source inspection.**

Preserve the existing semantic model:

`database uniqueness -> conflict arbitration -> semantic same-intent verification -> fail on divergent reuse`

and:

`optimistic exact-state CAS -> exactly one successful transition -> stale writer rejects`.

The useful delta is stronger concurrent integration evidence, particularly same-key/different-intent racing and exact timestamp/version round-trip for attention CAS.

## Next dependency-valid action

No additional broad persistence/concurrency research is required before source recovery.

On exact SMR020 custody release, map the recovered current store/schema first. If the same invariants exist, preserve them and add the 13-case bounded concurrency gate. Change persistence design only for a reproduced current-lineage defect.
