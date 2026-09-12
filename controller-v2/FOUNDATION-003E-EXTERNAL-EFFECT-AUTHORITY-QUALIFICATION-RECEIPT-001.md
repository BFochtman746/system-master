# CONTROLLER-FOUNDATION-003E — EXTERNAL EFFECT AUTHORITY QUALIFICATION RECEIPT 001

Status: **HOSTED PORTABLE PASS / CUMULATIVE REGRESSION PASS / PRODUCTION ACTIVATION STILL BLOCKED**

## Exact subject

- branch: `controller-v2/foundation-003-forensic-recovery`
- exact tested subject: `c34a78793de4342be05dfbd143030541af967b61`
- base lineage: frozen C1 `a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d` -> qualified 002D rebind `2ad38d6c431e76748dc21db2b1d23b0851cc1f83` -> 003A backup hardening -> 003C/003D/003E
- historical `controller-v2/foundation-003@ec2fcbf188acfad20dd640cf14c2dbb5bf79c0dd` was archaeology only and is not an implementation ancestor.

## Hosted qualification

Workflow: `Controller v2 Foundation`

Run: `34677688775`

Exact-head checkout was verified independently by both jobs.

### Node 22

- runtime: `v22.23.2`
- hosted environment: Ubuntu 24.04.5 / GitHub-hosted runner
- tests: **233/233 PASS**
- failures: **0**

### Node 24

- runtime: `v24.20.0`
- hosted environment: Ubuntu 24.04.5 / GitHub-hosted runner
- tests: **233/233 PASS**
- failures: **0**

The cumulative denominator includes all predecessor Controller tests plus the new 32-case External Effect Authority qualification set `EE-T001..EE-T032`.

## 003E isolated boundary proven by hosted tests

The 32 new cases prove, within the portable Node/SQLite environment:

1. append-only schema-v4 migration;
2. PREPARED external-effect creation backed by semantic events;
3. raw provider request payload is not persisted;
4. provider/idempotency-key semantic duplicate convergence;
5. changed request/target/version/operation under one semantic key fails closed;
6. transaction/operation ownership mismatch fails closed;
7. dispatch authority requires a current RUNNING operation and live current fenced lease;
8. expired, released, wrong-operation and stale-generation leases are rejected;
9. dispatch authorization creates exactly one immutable attempt;
10. Controller moves the effect to `UNKNOWN` before the caller may cross the physical send boundary;
11. portable v1 never grants a second physical dispatch attempt for the same semantic effect;
12. `UNKNOWN -> RECONCILING` is explicit and idempotent;
13. success requires bounded observation evidence;
14. permanent failure requires bounded evidence plus classified error code;
15. unresolved provider observation returns to `UNKNOWN` without creating redispatch authority;
16. cancellation is allowed only before dispatch authorization;
17. semantic event replay reconstructs effect + dispatch-attempt truth exactly;
18. durable-journal rebuild restores uncertain effect truth without resurrecting a live lease;
19. recovery reports uncertain effects as requiring external observation and never auto-redispatches them;
20. the provider-neutral semantic authority contains no provider/network SDK, `fetch`, network request, sleep, or retry loop.

## Cumulative regression/calibration

The same exact subject passed all pre-existing Controller Foundation behavior on both runtimes, including:

- C1 activation-closure and authority-shape checks;
- 002D immutable command ingress, lost-wakeup recovery, semantic idempotency and bounded retry behavior;
- durable journal/outbox publication and global integrity verification;
- GitHub journal/anchor race, ambiguity and rollback checks;
- worker lease fencing and typed result authority;
- promotion observe-before-reapply behavior;
- disaster rebuild and orphaned-operation recovery;
- 003A immutable backup publication and post-loss usability;
- migration, SubjectRef and RFC-8785 canonicalization behavior.

During qualification repair, three predecessor tests were found to contain stale hard-coded schema-version-3 expectations after the intentional append-only v4 migration. They were rebound to schema v4 without weakening production semantics. The final exact subject is the only subject qualified by this receipt.

## Evidence/non-claim boundary

This receipt proves **hosted portable semantics only**. It does not prove or claim:

- A-01 qualification;
- native operating-system crash/power-loss behavior;
- real external-provider idempotency or provider-side mutation outcome;
- real production GitHub App principal, credential or effective ruleset installation;
- production Controller activation;
- authorization of a dangerous external effect;
- CORE, LEARNING, BOOK, DOCUMENTS or Programming domain behavior.

C1 production activation remains `BLOCKED_EXTERNAL_SETUP`. Existing 002D production ingress principal/ruleset installation evidence remains unresolved and is not promoted by this PASS.

## Freeze standing

`CONTROLLER-FOUNDATION-003E-EXTERNAL-EFFECT-AUTHORITY-BUILD-001` is **FROZEN_HOSTED_PORTABLE** at exact subject `c34a78793de4342be05dfbd143030541af967b61` for its stated boundary.

Any executable change to schema-v4 effect authority, effect events/reducer/rebuild, fencing, single-dispatch law, evidence requirements, or related predecessor code requires fresh exact-subject cumulative qualification.

## Exact dependency-valid successor

`CONTROLLER-FOUNDATION-003F-RESTART-TAXONOMY-CLOSURE-001` — losslessly enumerate every Controller semantic state at process restart / local-store loss / ambiguous external boundary, prove which state owner decides recovery, eliminate any duplicate retry/reconciliation authority, and bind the remaining projection identity/cursor and target-native backup durability residuals before advancing beyond Foundation-003.
