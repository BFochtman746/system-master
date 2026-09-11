# SYSTEM-MASTER-GITHUB-RELIABILITY-CONTROL-PLANE-001

Status: PROPOSED_FOR_ADMISSION
Effective target: 2026-09-10
Scope: shared GitHub transport, write authorization, repository-writer fencing, durable dispatch, and Second Shift integration for all System Master components.

## Problem statement

System Master has multiple concurrent chat working surfaces and multiple active owner lanes. Current chat contracts define ownership, but GitHub access can still permit independent chats or workers to mutate shared repository state without a single technical admission point. That creates stale-writer, conflicting-objective, duplicate-retry, and canonical-ref race risk. Second Shift already defines continuous successor selection, but the current generic workflow is enforcement/watchdog oriented rather than a durable successor dispatcher.

## Permanent architecture

All state-changing GitHub work follows:

USER AUTHORITY -> OBJECTIVE AUTHORIZATION -> OWNER-LANE LEASE -> CHAT/WORK LEASE -> DURABLE OPERATION LEDGER -> GLOBAL REPOSITORY-WRITER FENCE -> CANDIDATE BRANCH -> QUALIFICATION -> CANONICAL ADMISSION -> RECEIPT.

Second Shift decides what eligible unattended-safe work should run. The GitHub reliability control plane decides when and how GitHub reads, writes, dispatches, retries and admissions occur. Git transports ordinary source bytes. GitHub Actions execute bounded work. A-01 remains separately serialized for native qualification.

## Multi-chat authorization law

1. A chat is a working surface, never repository authority by itself.
2. A chat may research, inspect, test, implement and commit only within the scope of an active work lease.
3. Routine implementation uses an isolated candidate branch. Direct canonical mutation by a chat is forbidden.
4. A work lease binds work_session_id, owner_lane, objective_id, allowed_paths, candidate_branch, base_sha, owner_control_head, fence_epoch, allowed_effects, forbidden_effects, issued_at and expires_at.
5. A chat cannot mint, widen or renew its own authorization.
6. Changing the central objective, owner topology, system boundaries, canonical authority, another lane's current work, or bypassing a failed gate requires explicit user-authorized governance admission.
7. Owner chats may autonomously advance an already-authorized objective and dependency-valid successors that remain inside the same admitted objective family.
8. MASTER_ROOT may orchestrate and reconcile but may not silently take a peer owner's canonical-writer authority.

## Two-lock mutation law

Every mutation-capable operation requires both:

- an owner-lane lease proving the operation belongs to the currently valid owner/objective; and
- a global repository-writer fence proving the operation is the only valid canonical writer for the target repository/ref transition.

The repository-writer fence uses a monotonically increasing epoch. Once epoch N+1 has been issued, epoch N is permanently stale for canonical mutation even if the old lease later expires or a delayed worker resumes.

## Canonical mutation protocol

1. Read live canonical head.
2. Validate current authority, topology, owner, objective and lease.
3. Claim the next valid repository-writer fence epoch.
4. Bind expected_base_sha to the observed live head.
5. Construct the complete candidate commit locally using native Git for source bytes.
6. Verify required file identities, manifests, tests and policy checks.
7. Admit by fast-forward-only compare-and-set. Ordinary automation never force-updates a canonical ref.
8. Re-read the resulting canonical ref and issue a durable before_sha/after_sha receipt.
9. If the canonical head changed before admission, classify STALE_BASE, preserve the transaction, release the writer, reread authority, reconcile/rebase and retry only under a fresh fence epoch.

## Native source transport law

- Ordinary source, tests, manifests and normal repository files: native Git clone/fetch/write/commit/push.
- Workflow evidence and large transient outputs: immutable GitHub Actions artifacts with digest verification.
- Cache: performance only, never correctness or custody authority.
- Small control messages: JSON/webhook/workflow_dispatch/repository_dispatch.
- User/chat file handoff: file-native staging -> digest/size verification -> trusted worker -> native Git.
- Base64/chunk/text-carrier schemes are forbidden as the normal source-import path.

## Durable operation law

Every GitHub-affecting logical operation has one durable identity and state machine. Required semantics are database uniqueness -> conflict arbitration -> semantic same-intent verification -> fail on divergent reuse. Replays of the same intent are idempotent; reuse of an idempotency key for a different intent fails closed.

## Traffic-governor law

1. Webhooks/events first, conditional reads second, periodic polling only as reconciliation.
2. State-changing API/Git operations are centrally serialized per target resource where required.
3. One logical Git transaction normally produces one complete commit and one push.
4. Retry exists at the control-plane layer only, with bounded attempts, exponential backoff, jitter, Retry-After compliance and circuit breaking.
5. Low-priority maintenance sheds/defer first under pressure; current interactive/canonical repair and admission work outrank speculative work.

## Second Shift integration

1. Existing SECOND-SHIFT-REGISTRY-001 owner discovery remains authoritative.
2. Existing enforcement/watchdog remains independent safety control.
3. A durable dispatcher performs pre-shift reconciliation, claims READY work, dispatches workers, consumes terminal events, binds successors and continues while the shift is open.
4. Completion, BLOCKED or STALE is never shift termination. The controller immediately selects the next dependency-valid unattended-safe successor or records all-eight-rungs exhaustion.
5. Lost events, worker crashes and delayed schedules recover from durable ledgers/checkpoints through watchdog reconciliation.
6. 06:45 is final refill for bounded/checkpointable work; 07:00 closes new normal assignment and produces exact morning handoff state.
7. New first-class systems require explicit topology/registry admission. Headless product-root portfolios do not create peer lanes unless architecture authority says they are first-class systems.

## Permission classes

AUTONOMOUS: research, read-only inspection, tests, documentation, implementation and candidate-branch commits inside the active lease.

CONTROLLER_ADMITTED: owner-state reconciliation, exact-SHA qualification, candidate promotion, routine dependency-valid continuation and durable successor binding inside already-authorized scope.

USER_REQUIRED: central-objective replacement, topology/ownership change, cross-owner canonical-state change, abandonment/supersession of material current work, force mutation, failed-gate bypass, or permanent governance/security-policy change.

## Acceptance boundary

Do not declare this objective complete until tests prove: parallel chats remain productive but isolated; stale writers are fenced; divergent idempotency reuse fails; canonical compare-and-set rejects stale bases; duplicate terminal events do not duplicate work; controller restart resumes durable operations; rate-limit responses create bounded global backoff rather than storms; Second Shift continues successor work through the full window; missed events recover via watchdog; A-01 remains singleton; Document R4 is imported through native Git and freshly qualified on its exact immutable Git SHA; and ordinary forced canonical mutations are zero.

## Migration order

1. Admit this architecture and machine-readable schemas.
2. Add work-lease and operation-ledger validation.
3. Implement repository-writer fencing and fast-forward-only admission.
4. Implement native-Git worker path and traffic governor.
5. Implement event-first Second Shift continuous dispatcher while retaining watchdogs.
6. Use DOCUMENTS CR001-R4 as acceptance case 1.
7. Migrate CORE, LEARNING, BOOK and remaining portfolios.
8. When GitHub plan capabilities permit, add native protected-branch/ruleset enforcement so GitHub itself rejects bypass attempts.
