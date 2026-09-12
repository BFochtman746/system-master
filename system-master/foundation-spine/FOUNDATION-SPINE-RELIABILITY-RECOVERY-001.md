# FOUNDATION-SPINE-RELIABILITY-RECOVERY-001

Status: CANONICAL RECOVERY MODEL

Recovery is a coordination authority, not a universal shadow database.

## Recovery classes

### 1. Work continuity
Decides whether a Work/Plan generation is still valid after interruption and whether to resume, replan, pause for user input or terminate. Uses FS-04/05/06 truth.

### 2. Executor failure recovery
Fences/drains a failed or stale executor, preserves valid runtime state, and permits safe reassignment through FS-09/10. A dead worker's continued execution must be harmless.

### 3. Transport recovery
Replays durable messages through outbox/inbox/dedup semantics. Duplicate delivery is expected and must be safe. Delivery recovery cannot reinterpret domain meaning.

### 4. Unknown external effect reconciliation
When an external mutation may have committed but acknowledgement is uncertain, the effect enters UNKNOWN/RECONCILING. FS-15 queries/reconciles external state or uses idempotent retry rules. It never assumes failure and blindly repeats an irreversible action.

### 5. Resource recovery
Resource reservations/credits are reclaimed after the prior execution owner is safely fenced or its state is reconciled. Capacity cannot be double-spent during uncertainty.

### 6. State/data reconciliation
Repairs cross-system disagreement using owner-specific versions, receipts and authoritative transactions. FS-20 does not overwrite owner truth merely to make records agree.

### 7. Disaster/data recovery
Uses backup, point-in-time recovery, restore verification and re-entry gates for canonical storage. Restore is followed by integrity, migration, evidence and replay checks before normal mutation resumes.

## Checkpoint law

A checkpoint is valid only when bound to exact Work/Goal/Plan/Step/Job/Attempt identity and the necessary input/contract/model/tool/artifact versions. A checkpoint from a superseded goal, incompatible plan, stale schema or unsafe effect boundary cannot be resumed automatically.

## Recovery evidence

Each RecoveryEpisode must record trigger, uncertainty class, affected identities, fence/drain state, chosen recovery policy, artifacts/checkpoints used, external reconciliation results, resource disposition, superseded identities and resulting standing.

## Required adversarial campaigns

Qualification must include worker kill, process crash, host reboot, database restart, duplicate/delayed messages, network loss, provider outage, stale worker, expired grant, unknown external commit, corrupted checkpoint/artifact/evidence, full/near-full storage, resource exhaustion and extended endurance runs. Recovery is not closed by happy-path unit tests alone.