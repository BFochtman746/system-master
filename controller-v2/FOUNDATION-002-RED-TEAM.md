# CONTROLLER-FOUNDATION-002 — Red-Team Record

Status: HOSTED FOUNDATION TESTS PASS / PRODUCTION INTEGRATION NOT YET AUTHORIZED

This record captures how the Foundation-002 design was attacked before it is allowed to become the basis of Second Shift 2.0.

## 1. Threat model

Foundation-002 must remain correct under:

- duplicate command submission,
- concurrent controller connections,
- retry after lost responses,
- worker pause/resume after lease expiry,
- controller process crash before or after commit,
- GitHub delivery redelivery,
- stale database restore,
- altered applied migrations,
- illegal direct state transitions,
- changed controller or policy subjects,
- GitHub API outage or conflict,
- runner loss,
- stale cross-chat projections.

A fully compromised controller host or operating-system administrator remains outside the database-only trust boundary. That risk is addressed later through host isolation, least privilege, backups, independent GitHub enforcement, and auditable controller identity.

## 2. Failures found during design and testing

### R-001 — Subject role was incorrectly modeled as immutable object identity

Initial prototype classified Git objects as SOURCE/CANDIDATE/CONTROLLER/POLICY. That is wrong: the same immutable commit can be a candidate in one transaction and the base of a later transaction.

**Repair:** subject identity is now only repository + hash algorithm + digest. Roles are transaction references.

### R-002 — Command fingerprint originally omitted bound subjects

Payload equality alone is insufficient: the same instruction against a different base SHA, controller version, or policy version is a different semantic command.

**Repair:** command fingerprint includes caller, command type, payload, base subject, controller subject, and policy subject.

**Residual:** the current prototype fingerprints stable internal subject IDs. The ingress layer must canonicalize those IDs from immutable repository/hash identities and preserve them during recovery/rebuild.

### R-003 — Lease expiry could strand an attempt as active

An expired lease originally changed only the lease row. The associated attempt could remain CLAIMED/RUNNING and block safe retry.

**Repair:** expiry atomically abandons the associated active attempt before admitting a successor lease.

### R-004 — Fencing token without a fenced resource is not protection

A worker holding direct GitHub write credentials could ignore the controller fence and write after its lease expired.

**Permanent rule:** workers receive no authority to mutate canonical/shared refs. Any GitHub mutation that can affect canonical state must pass through a controller/promotion gateway that checks the current lease, authority epoch, fencing token, expected subject/base, and target ref. A worker may at most write to an isolated attempt-specific location whose result is later accepted by the gateway.

### R-005 — Fencing token can regress after restoring an old backup

A restored database can contain an older `current_token` than the remote system has previously observed.

**Repair:** lease authority is the pair `(authority_epoch, fencing_token)`, not the fencing number alone. Recovery begins a new epoch higher than the remote high-water and revokes every restored live lease. Pre-recovery leases are invalid in the new epoch.

### R-006 — Event sequence can regress after old backup restore

An older database may have a lower local AUTOINCREMENT event sequence than a previously published remote projection.

**Repair:** externally comparable authority position is `(authority_epoch, event_seq)`. Recovery advances to an epoch greater than the remote high-water before publishing new state.

### R-007 — Direct inserts could bypass state-machine entry points

CHECK constraints constrained values but originally allowed a caller with direct SQL access to insert a transaction already SUCCEEDED, a qualification already QUALIFIED, or a promotion already ELIGIBLE.

**Repair:** forward migrations enforce initial states for transactions, execution attempts, leases, inbox deliveries, qualifications, promotions, and outbox rows.

### R-008 — Mutable identity columns could rewrite history

Several rows had immutable conceptual identity but lacked database triggers preventing fields such as lease token, qualification subject, promotion target, or attempt parent from being rewritten.

**Repair:** forward migration `0005_identity_hardening.sql` makes these identities immutable and makes resource fencing counters strictly +1 and non-deletable.

### R-009 — Candidate binding could occur too early

A candidate digest is a produced result and must not be attached to a transaction before execution.

**Repair:** candidate binding is one-way and permitted only while the logical transaction is EXECUTING.

### R-010 — Outbox acknowledgement could silently no-op

A duplicate/incorrect local acknowledgement could previously update zero rows without surfacing a fault.

**Repair:** `mark_outbox_published` requires exactly one PENDING row to transition or raises a controller error.

### R-011 — Branch development inside the legacy repository triggers legacy control machinery

Opening the clean Foundation-002 pull request triggered the legacy A-01 workflows in addition to Controller 2.0 CI.

**Repair for bootstrap:** the PR was closed after obtaining hosted test evidence; branch-push CI remains read-only.

**Permanent repair:** move Controller 2.0 code/policy/state to a dedicated controller repository. The System Master subject repository must not host the controller's own authority plane.

## 3. Storage and transaction invariants

- Canonical runtime state is SQLite on a local filesystem owned by the controller service.
- WAL is not placed on a network filesystem or cloud-synchronized working directory.
- `foreign_keys=ON`, `journal_mode=WAL`, `synchronous=FULL`, `trusted_schema=OFF`, `mmap_size=0`, and integrity checking are required at startup.
- State-changing operations use `BEGIN IMMEDIATE`.
- Applied migrations are append-only and checksum locked.
- Controller events are append-only.
- A publishable event and its outbox row are committed in the same transaction as the state mutation performed by the ControllerStore API.
- External delivery is at-least-once and consumers must deduplicate.
- Incoming GitHub deliveries are deduplicated by source + delivery identity + payload fingerprint.
- Database backups use SQLite's online backup API and are integrity checked.

## 4. Fencing invariants

A mutation-capable work package must eventually carry:

- transaction_id,
- attempt_id,
- lease_id,
- resource_key,
- authority_epoch,
- fencing_token,
- immutable base/candidate identity,
- controller version,
- policy version,
- allowed operation set.

The resource gateway accepts a mutation only when all of these still agree with canonical controller state.

Lease expiry alone is not the authorization boundary. The resource gateway is.

## 5. Recovery invariants

When recovery uses a backup or otherwise cannot prove continuity with the last published state:

1. Read the remote authority high-water `(epoch, event_seq)`.
2. Open and integrity-check the recovered database.
3. Begin a recovery transaction.
4. Abandon active execution attempts bound to restored live leases.
5. Revoke restored live leases.
6. Advance local authority epoch to `max(local_epoch, remote_epoch) + 1`.
7. Emit `AUTHORITY_EPOCH_ADVANCED` in the new epoch.
8. Publish a new projection only through a compare/high-water check.
9. Never resume a pre-recovery worker lease.

The publisher/high-water comparison itself is a Foundation-003 responsibility and is not yet implemented.

## 6. Clock behavior

Lease expiry currently uses controller-host wall time because expiry must survive process restart. Clock movement backward can delay takeover; movement forward can expire work early. Neither may authorize a stale worker once the fenced resource validates `(authority_epoch, fencing_token)`.

Foundation-003/worker health must add clock-health observation and fail closed on material clock anomalies. Fencing—not wall-clock precision—is the final stale-writer defense.

## 7. GitHub boundary

The future gateway must use non-force ref updates for ordinary advancement and treat GitHub conflicts as reconciliation events, never as permission to overwrite. GitHub's ref API supports `force=false` to require fast-forward behavior.

Canonical branch protection/rulesets are an independent enforcement layer and remain required before Controller 2.0 promotion.

Workers must not possess a token capable of bypassing controller fencing on canonical refs.

## 8. Self-hosted runner boundary

The current `system-master` repository is public. Persistent self-hosted runners must not execute untrusted public-repository PR code. Controller Foundation CI therefore uses GitHub-hosted runners. Future self-hosted Second Shift execution requires explicit isolation and an authorization path that cannot expose canonical write credentials to subject code.

## 9. Hosted qualification evidence

Draft PR #52 was used once to execute the clean foundation against a GitHub-generated merge context.

- Python 3.13: 35 tests PASS.
- Python 3.14: 35 tests PASS.
- GitHub-hosted Ubuntu 24.04.
- `GITHUB_TOKEN`: Contents read, Metadata read.
- Checkout credentials were configured with `persist-credentials: false`.
- `actions/checkout` and `actions/setup-python` were pinned to full commit SHAs.
- PR #52 was then closed unmerged because it also activated legacy A-01 workflows.

This proves the current foundation prototype executes successfully in two hosted Python runtimes. It does **not** prove the complete Controller 2.0 is production ready.

## 10. Residual risks intentionally deferred

Foundation-002 does not yet implement:

- authenticated command ingress,
- GitHub App identity/token minting,
- remote state projection/high-water compare,
- fenced GitHub mutation gateway,
- webhook signature verification,
- publisher retry/backoff/dead-letter behavior,
- controller host filesystem ACL/service identity,
- clock-health enforcement,
- isolated Second Shift worker runtime,
- qualification service methods,
- promotion gateway,
- repository ruleset creation,
- durable off-host backup schedule,
- full disaster-recovery rehearsal.

Those are not hidden gaps. They are successor work and may not be claimed complete by Foundation-002.

## 11. Foundation-002 disposition

**FOUNDATION LOGIC: PASS FOR PROTOTYPE BASELINE**

**PRODUCTION AUTHORITY: NOT GRANTED**

**LEGACY CONTROLLER REPLACEMENT: NOT GRANTED**

The foundation is acceptable as the dependency for Foundation-003 because its runtime invariants have hosted test evidence and its remaining external-boundary obligations are explicitly enumerated rather than inferred.
