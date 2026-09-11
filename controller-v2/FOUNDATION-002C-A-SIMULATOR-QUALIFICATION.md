# CONTROLLER-FOUNDATION-002C-A — Git Data Adapter Simulator Qualification

Status: **SIMULATOR CONTRACT QUALIFIED / NON-AUTHORITATIVE / REAL REMOTE NOT YET QUALIFIED**

Parent contracts:
- `CONTROLLER-FOUNDATION-002B` — frozen deterministic transaction kernel
- `CONTROLLER-FOUNDATION-002C` research + threat model — frozen for implementation design

Qualified simulator code subject: `84ac0cada8e2d7c4bfcbc7ee47ca6aeb27b88dc8`
Hosted qualification run: `34654333196`
Incubator branch: `controller-v2/foundation-002b`

## Meaning of this seal

002C-A proves the Git-data journal adapter contract against a deterministic fault-injecting Git data simulator. It does **not** claim that a real GitHub repository, GitHub App credential, rate-limit behavior, branch/ruleset configuration, repository identity, or network/API failure semantics have been qualified.

No journal runtime data is permitted to be written to `BFochtman746/system-master`. The System Master repository remains the subject under development, not the controller's durability authority.

## Qualified denominator

The exact qualified subject executes **149/149 PASS** on both hosted Node.js 22 and Node.js 24. This includes the frozen 002B denominator plus the complete 60-case 002C-A Git-data simulator harness `GJ-T001` through `GJ-T060`.

The 60-case journal harness proves, in simulation:

- explicit deterministic initialization and missing-ref fail-closed behavior
- dedicated repository identity and subject/journal separation
- immutable segment + checkpoint publication in one Git tree/commit
- exactly-one-parent linear history
- ref update with `force:false` and expected-old-head CAS semantics
- duplicate/idempotent append handling
- event-ID/digest conflict rejection
- semantic event digest, schema and stream successor validation
- global journal position/digest continuity
- lost acknowledgement observation before retry
- ambiguous publication fail-closed behavior
- two-writer race convergence without force update
- local witness extension/rollback/fork checks
- missing/corrupted segment detection
- protocol descriptor immutability
- checkpoint parent/size/head/stream/segment validation
- fault injection before/after blob, tree, commit and ref-update boundaries
- named retry-exhaustion behavior
- bounded event-count and segment-byte limits before remote object creation
- safe-integer journal-position overflow protection
- already-durable prefix reconciliation with suffix-only append
- idempotence of old batches after later independent appends
- identical concurrent append convergence
- rejection of unexpected journal-tree files
- rejection of unknown semantic-event top-level fields

## Defects found by the expanded denominator

The first 60-case run failed seven cases. The failures identified real omissions rather than test noise:

1. final non-fast-forward conflict leaked the raw transport error instead of the named retry-exhaustion error;
2. configured event-count batch limits were not wired into the adapter;
3. configured segment byte limits were not wired into the adapter;
4. journal-position overflow surfaced through a lower-level digest validator rather than a named append invariant;
5. retry of a partially committed batch revalidated already-durable events against the new stream head and falsely reported a stream gap;
6. unexpected files in the authoritative journal tree were accepted;
7. unknown semantic-event top-level fields were accepted.

The first hardening repair then exposed an implementation mistake in strict validation: replayed durable entries legitimately contain the three journal-envelope fields `journal_position`, `prev_journal_digest`, and `journal_digest`. The validator was corrected to distinguish required semantic fields, permitted durability-envelope fields, and forbidden unknown fields.

The final remaining failure was error-taxonomy precision: unknown event fields were rejected correctly but under the generic code `JOURNAL_EVENT_INVALID`. The adapter now emits the frozen `JOURNAL_EVENT_UNKNOWN_FIELD` code.

No failing test was removed, relaxed, skipped, or rewritten to make the implementation pass.

## Frozen simulator invariants added by 002C-A

1. A configured batch event limit is checked before remote Git object creation.
2. A configured segment byte limit is checked before remote Git object creation.
3. Journal position may never exceed JavaScript's safe-integer range; overflow fails before digest construction.
4. A partially durable retry may skip only exact already-durable event identities/digests and append only the remaining suffix.
5. Any existing event ID with a different semantic digest is a hard conflict.
6. Non-fast-forward contention is bounded; exhaustion returns `JOURNAL_CONFLICT_RETRY_EXHAUSTED` and never force-updates a ref.
7. The authoritative journal tree admits only the immutable protocol descriptor, checkpoint, and valid segment namespace.
8. Semantic events have a closed top-level field set. Journal replay additionally permits only the three frozen durability-envelope fields.
9. The semantic event digest is always recomputed over the semantic core, never over the durability envelope.
10. The simulator qualification does not substitute for destructive real-GitHub integration qualification.

## Remaining boundary before 002C can become authoritative

`CONTROLLER-FOUNDATION-002C-B — DEDICATED JOURNAL REPOSITORY + REAL GITHUB GIT-DATA ADAPTER + CREDENTIAL/RATE-LIMIT/NETWORK/REF-PROTECTION DESTRUCTIVE QUALIFICATION`

002C-B must use a repository separate from `BFochtman746/system-master`. It must validate real GitHub API behavior, installation-token lifecycle, repository identity, permissions, ref CAS behavior, ambiguous network outcomes, rate limits/backoff, protection/ruleset configuration available to the account, recovery from the real remote journal, and explicit journal deletion/rollback/fork failure handling.

The simulator remains non-authoritative until 002C-B passes.
