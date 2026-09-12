# CONTROLLER-FOUNDATION-002C-C1 — Dedicated Journal Provisioning Contract

Status: BLOCKED ON EXTERNAL REPOSITORY CREATION
Scope: live remote identity + permission + seed + empty-journal preflight

## Canonical live target

- Journal repository: `BFochtman746/system-master-controller-journal`
- Subject repository: `BFochtman746/system-master`
- Visibility: private
- Archived: false
- Required default branch: `main`
- Seed history: exactly one root commit, with zero parents
- Seed tree: exactly one file named `README.md`
- `refs/heads/journal`: MUST NOT EXIST before C1 qualification
- System Master repository MUST NOT be used as journal storage

The README contents are non-authoritative infrastructure seed material. The repository name, numeric repository identity, root seed commit, default branch, visibility, and empty journal-ref state are qualification inputs.

## Authority boundary

Repository creation/provisioning is infrastructure setup only. Creating the repository or seed commit does not initialize the Controller journal and does not create authoritative Controller state.

The Controller live qualification owns creation of `refs/heads/journal` and all subsequent journal objects.

C1 itself is read-only. Its real GitHub surface is limited to repository/ref/commit/tree GET operations and cannot create blobs, trees, commits, or refs.

## Required principal capability

The Controller qualification principal must be able to read repository metadata and Git objects and must expose repository write capability for later C2 qualification. C1 verifies known absence of write capability and fails closed. It must not receive broader subject-repository mutation authority through this provisioning step.

## C1 fail-closed preconditions

C1 MUST fail without mutation if any of the following is true:

1. the configured journal repository is not exactly `BFochtman746/system-master-controller-journal`;
2. journal and subject repository identities collide;
3. the target is `BFochtman746/system-master`;
4. explicit destructive qualification opt-in is absent;
5. resolved repository identity differs from configured identity;
6. stable positive numeric repository identity is unavailable;
7. repository is archived;
8. repository is not private;
9. repository has no default branch / seed commit;
10. default branch is not exactly `main`;
11. seed commit is not the single root commit;
12. root tree does not contain exactly one file named `README.md`;
13. repository write capability is known to be absent;
14. `refs/heads/journal` already exists;
15. the qualification identity is absent.

## Successful C1 result

C1 success emits a machine-readable PASS receipt containing at minimum:

- qualification identity;
- canonical journal repository name;
- stable numeric journal repository ID;
- canonical subject repository name;
- default branch;
- exact root seed commit OID;
- `qualified_for_live_journal_mutation: true`.

C1 success means only:

`QUALIFIED_FOR_LIVE_JOURNAL_MUTATION = true`

It does NOT mean the journal is initialized, authoritative, protected, or production-ready.

The next operation after a successful C1 is `CONTROLLER-FOUNDATION-002C-C2 — LIVE JOURNAL INITIALIZATION + FIRST APPEND + READBACK + WITNESS SEAL`.
