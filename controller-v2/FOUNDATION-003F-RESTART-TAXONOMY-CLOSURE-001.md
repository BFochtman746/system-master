# CONTROLLER-FOUNDATION-003F — RESTART TAXONOMY CLOSURE 001

Status: **RECOVER / INVENTORY / ANALYZE COMPLETE — ONE MATERIAL DURABILITY-BARRIER DEFECT FOUND; 003E REOPENED NARROWLY BEFORE FURTHER FOUNDATION-003 PROGRESSION**

This census was executed immediately after the hosted-portable 003E PASS to test whether every current semantic state has one lossless restart owner and whether any local-only state could authorize an irreversible external effect after authoritative-store loss.

No CORE/LEARNING/BOOK/DOCUMENTS owner control is changed by this artifact.

## 1. Restart classes

The Controller has three materially different restart/failure boundaries:

1. **process restart with local SQLite intact** — local committed rows, leases, events and outbox rows may remain;
2. **local SQLite loss with durable journal intact** — only durably published semantic events may reconstruct authority; live leases are intentionally not resurrected;
3. **ambiguous external boundary** — a physical provider mutation may have occurred while acknowledgement or later local state is missing.

These classes must not be collapsed. A behavior safe for class 1 may be unsafe for class 2 or 3.

## 2. Lossless restart ownership matrix

| Semantic concern | Durable/current owner | Process restart | Local-store loss | Ambiguous external boundary | Standing |
|---|---|---|---|---|---|
| immutable command discovery | 002D Git command-ref ingress | full/ref scan rediscovers | full/ref scan rediscovers | not an external effect | CLOSED |
| command semantic idempotency | 002B command fingerprint + command/transaction uniqueness | duplicate converges | durable transaction event rebuild or ingress ref rediscovery reaccepts | n/a | CLOSED |
| transaction state | semantic journal + reducer | SQLite/event state | rebuild from verified durable events | n/a | CLOSED |
| operation state | semantic journal + reducer | SQLite/event state | rebuild from verified durable events | n/a | CLOSED |
| live worker lease | SQLite + resource generation | revalidated against expiry/generation | **never recreated**; orphan RUNNING/VERIFYING becomes STALE | late worker fenced | CLOSED |
| outbox publication | 002C outbox/publisher | PENDING rows remain retryable | only already durable events exist after total local loss | lost journal acknowledgement reconciles by immutable event identity | CLOSED for journal publication |
| qualification | semantic events | resumed/read from state | rebuild from durable events | external qualification execution is separate evidence boundary | CLOSED at current portable boundary |
| promotion | promotion state + durable authorization seal | observe before apply/reapply | authorization event rebuilds only when durably published | existing promotion logic observes before reapply | CLOSED for existing promotion path |
| command-ingress transient retry | 002D ingress reconciler | bounded retry per invocation | ref rediscovery starts fresh bounded reconcile | no semantic command mutation from transport notification | CLOSED |
| generic external effect intent | 003E external-effect authority | PREPARED/UNKNOWN/RECONCILING state remains | effect state/attempt rebuilds from **durably published** events | observation required, no generic redispatch | PARTIAL — see defect below |
| generic external effect dispatch authorization | 003E dispatch event + attempt | local state survives | **DEFECT if physical apply occurs before dispatch event is durable** | provider may have committed while journal lacks effect/attempt truth | **REOPEN REQUIRED** |
| projection freshness | regenerated `kernel.projection()` with time-based freshness | regenerate | regenerate | n/a | PARTIAL — durable projection cursor/identity remains a later observability concern, not semantic truth |
| immutable backup | 003A storage maintenance | independently verified backup available | backup may seed local restoration but durable journal remains semantic authority | n/a | PORTABLE CLOSED; target-native sudden-power-loss remains external/native evidence |

## 3. Material defect discovered after 003E PASS

003E correctly records `PREPARED -> UNKNOWN` and an immutable dispatch-attempt event **before** the caller can perform a provider mutation. However, the current API returns the dispatch descriptor as soon as the local SQLite transaction commits.

That is sufficient for a normal process crash with SQLite intact, but it is insufficient for total local-store loss:

1. Controller locally commits `external-effect.dispatch-authorized` and the outbox row;
2. the event has not yet been sealed into the 002C durable journal;
3. caller performs the external provider mutation;
4. provider commits;
5. local SQLite is lost before outbox publication;
6. disaster rebuild from the authoritative durable journal contains no effect dispatch event/attempt;
7. immutable command/operation replay could later produce a path that does not know an external mutation may already exist.

This violates the required lossless `intent -> implementation -> durable state -> interface -> tests -> evidence -> environment -> blocker` chain and the 002C durability law already applied to promotion authorization.

The previous hosted PASS remains valid for the **exact tested semantics**, but 003E is no longer eligible for final Foundation-003 freeze because the denominator did not include this local-store-loss-before-publication adversary.

## 4. Adjudication

The fix is not a retry engine and not a second journal.

The existing 002C outbox/durable-journal mechanism remains the sole durability owner. External Effect Authority must add a **durability permit barrier** between local dispatch authorization and physical provider apply.

Locked recovery principle for the repair:

> No irreversible external provider call may begin merely because `external-effect.dispatch-authorized` committed locally. The exact dispatch-authorization semantic event must first be confirmed `SEALED` by the existing 002C durable publication mechanism.

The physical adapter still owns provider I/O. The semantic authority still owns effect intent/attempt identity/fencing. 002C still owns durable event publication. No ownership duplication is introduced.

## 5. Narrow repair requirements

A 003E repair must provide a pure semantic check such as `getExternalEffectDispatchPermit(...)` / `assertExternalEffectDispatchDurable(...)` that:

1. requires the effect to remain `UNKNOWN` after exactly one dispatch authorization;
2. resolves the exact `external-effect.dispatch-authorized` event for that effect/attempt;
3. requires its existing outbox row to be `SEALED`;
4. revalidates that the supplied lease/operation/generation still matches the immutable attempt and is still authorized at permit time, or explicitly design-locks why permit identity is independent of a now-released lease;
5. returns a bounded immutable permit only after the durability barrier is satisfied;
6. never performs provider I/O itself;
7. never seals its own event and never bypasses the existing publisher;
8. after total local-store loss, only a durably reconstructed dispatch attempt can become observable/reconcilable; an unsealed local authorization is not recovered as authority;
9. requires a new adversarial test: provider apply is forbidden while dispatch event is PENDING;
10. requires a new adversarial test: after seal, permit can be issued exactly for the existing attempt;
11. requires durable-rebuild test proving the sealed attempt survives while no live lease is resurrected;
12. preserves one-physical-attempt portable-v1 law.

## 6. Remaining restart residuals after this repair

Once the durability barrier is repaired and cumulatively requalified, remaining Foundation-003 work is narrower:

- projection identity/cursor/freshness contract so observational consumers can prove what semantic checkpoint a projection represents;
- target-native sudden-power-loss / filesystem durability evidence for backup and local SQLite behavior, which cannot be synthesized on hosted Ubuntu;
- production external setup from C1/002D, still an external installation blocker rather than a portable code defect.

## 7. Exact successor

`CONTROLLER-FOUNDATION-003E-R1-DISPATCH-DURABILITY-BARRIER-REPAIR-001` — repair the just-discovered local-commit/durable-publication gap, expand the exact qualification denominator, rerun isolated External Effect Authority tests and the complete Controller cumulative suite on supported hosted runtimes, then re-enter 003F restart closure.
