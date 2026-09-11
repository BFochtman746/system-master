# CONTROLLER-FOUNDATION-002C-C1 — Dedicated Journal Provisioning Contract

Status: BLOCKED ON EXTERNAL REPOSITORY CREATION
Scope: live remote identity + permission + seed + empty-journal preflight

## Canonical live target

- Journal repository: `BFochtman746/system-master-controller-journal`
- Subject repository: `BFochtman746/system-master`
- Visibility: private
- Archived: false
- Seed requirement: exactly one harmless initial commit on the default branch (for example a README)
- Required default branch: `main`
- `refs/heads/journal`: MUST NOT EXIST before C1 qualification
- System Master repository MUST NOT be used as journal storage

## Authority boundary

Repository creation/provisioning is infrastructure setup only. Creating the repository or seed commit does not initialize the Controller journal and does not create authoritative Controller state.

The Controller live qualification owns creation of `refs/heads/journal` and all subsequent journal objects.

## Required principal capability

The Controller qualification principal must be able to read repository metadata and Git objects and write repository Git objects/refs. It must not receive broader subject-repository mutation authority through this provisioning step.

## C1 fail-closed preconditions

C1 MUST fail without mutation if any of the following is true:

1. the configured journal repository is not exactly `BFochtman746/system-master-controller-journal`;
2. journal and subject repository identities collide;
3. the target is `BFochtman746/system-master`;
4. explicit destructive qualification opt-in is absent;
5. resolved repository identity differs from configured identity;
6. repository is archived;
7. repository has no default branch / seed commit;
8. repository write capability is known to be absent;
9. `refs/heads/journal` already exists;
10. the qualification identity is absent.

## Successful C1 result

C1 success means only:

`QUALIFIED_FOR_LIVE_JOURNAL_MUTATION = true`

It does NOT mean the journal is initialized, authoritative, protected, or production-ready.

The next operation after a successful C1 is `CONTROLLER-FOUNDATION-002C-C2 — LIVE JOURNAL INITIALIZATION + FIRST APPEND + READBACK + WITNESS SEAL`.
