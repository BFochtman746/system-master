# CONTROLLER V2 — EXECUTION-001B DESIGN REPAIR R1 001

Status: **FROZEN DESIGN REPAIR / SUPERSEDES TWO NARROW PARTS OF EXECUTION-001B DESIGN LOCK**
Predecessor design lock: `EXECUTION-001B-WORKER-BINDING-DISPATCH-DESIGN-LOCK-001.md`
Working lineage before repair: `controller-v2/foundation-006-c1-rebind@964a7aee1a36cb030d85cf693218083d7b50199d`
Build standing: **AUTHORIZED ONLY WITH THIS REPAIR APPLIED**

## 1. Trigger

A post-lock reread of the exact current claim-recovery implementation exposed two requirements that must be incorporated before any EXECUTION-001B bytes are built.

1. Fresh-store claim recovery preserves immutable claim history and the resource fencing-generation floor but does not make historical claims live execution authority. Therefore a recovered dispatch-intent history must not require a live `leases` row to exist merely to preserve historical evidence.
2. Foundation-003 does not permit network work immediately after `authorizeExternalEffectDispatch()`. That call first records UNKNOWN plus a dispatch-authorization event. The physical send is allowed only after the authorization event is durably sealed and `getExternalEffectDispatchPermit()` proves the durability barrier plus the still-current lease/fence.

The original design direction remains valid; these are lossless recovery/durability corrections.

## 2. Repair A — dispatch intent lease reference is historical identity, not a foreign key

Section 4.4 of the predecessor lock is superseded only for the `lease_id` column.

Correct v7 table:

```text
dispatch_intents(
  dispatch_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
  operation_id TEXT NOT NULL REFERENCES operations(operation_id),
  contract_id TEXT NOT NULL REFERENCES execution_contracts(contract_id),
  worker_binding_id TEXT NOT NULL REFERENCES worker_bindings(binding_id),
  lease_id TEXT NOT NULL UNIQUE,
  resource_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation > 0),
  request_digest TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

`lease_id` deliberately has **no foreign key to the mutable/live lease projection**.

Authority law:

- at initial intent creation, Controller must reread and validate the exact live lease row, worker binding, resource and current fencing generation;
- after durable event admission, the intent's lease ID/generation are immutable historical evidence;
- fresh-store recovery may reconstruct the dispatch intent even when no live lease row is restored;
- a historical dispatch intent never recreates claim authority;
- any future physical dispatch authorization still requires a **current live lease** through the frozen claim/effect authority.

This preserves history without violating FREC's zero-live-claim recovery rule.

## 3. Repair B — durable-before-network permit is mandatory

Section 11 of the predecessor lock is superseded by this exact physical-send sequence:

1. prepare the dispatch external effect while operation is READY;
2. reread CURRENT worker binding + required capabilities + live lease/fence;
3. activate the exact leased operation through frozen `startLeasedOperation()`;
4. reread binding + lease/fence;
5. call Foundation-003 `authorizeExternalEffectDispatch()`; this records one immutable attempt, moves the effect to UNKNOWN and emits `external-effect.dispatch-authorized` with outbox durability still pending;
6. publish/seal the exact dispatch-authorization event through the frozen durable journal/outbox barrier;
7. immediately before physical network/process send, EXECUTION-001B wrapper rereads worker binding standing and then calls frozen `getExternalEffectDispatchPermit()`;
8. **only a SEALED permit permits physical send**;
9. reconstruct the canonical dispatch envelope from immutable execution-contract/binding/intent rows and verify its SHA-256 equals the effect `request_digest` before handing bytes to the transport adapter;
10. the adapter may then perform at most that one authorized physical attempt.

No cached permit or earlier wakeup is reusable authority after restart or fence change.

If binding expires/revokes after local dispatch authorization but before the durability barrier/permit, the wrapper denies physical send. The effect remains UNKNOWN because local authorization was durably attempted; reconciliation must observe the external target rather than rewriting history or blindly reauthorizing.

## 4. Test-denominator repair

The predecessor WDI-001..060 denominator remains **60 cases** with these strengthened interpretations:

- `WDI-005`: fresh-store recovery must reconstruct dispatch intent without requiring a live lease-row foreign key.
- `WDI-044`: reconstructed envelope digest must equal the stored effect request digest.
- `WDI-047`: effect authorization alone is insufficient for physical send; current binding/fence + SEALED durability permit are required.
- `WDI-048`: expiry/revocation before SEALED permit prevents physical send even if the local effect is already UNKNOWN.
- `WDI-049`: UNKNOWN is recorded before physical transport work **and the authorization event must be sealed before send**.
- `WDI-050`: lost acknowledgement preserves exactly one authorized physical-attempt identity; no second send.
- `WDI-056`: fresh-store recovery reconstructs intent/history with zero live claim authority and no lease-row FK requirement.
- `WDI-057`: recovered UNKNOWN effect requires observation/reconciliation and can never regain send authority from historical intent alone.
- `WDI-060`: race test must include outbox-seal/permit ordering in addition to duplicate wakeups/concurrent reconcilers.

No denominator shrinkage is authorized.

## 5. Build constraint

`CONTROLLER-EXECUTION-001B-WORKER-BINDING-DISPATCH-IMPLEMENTATION-001` may proceed only if implementation uses:

- repaired no-FK historical `lease_id` in `dispatch_intents`;
- current live lease validation at intent creation and effect authorization;
- Foundation-003 effect authority rather than a second dispatch-effect state machine;
- SEALED `getExternalEffectDispatchPermit()` durability barrier before physical send;
- current worker-binding revalidation immediately before permit;
- deterministic envelope reconstruction/digest verification before transport.

No physical worker/provider execution is authorized by portable tests. Production identity/delegation/provider/native/A-01 standing remains `BLOCKED_EXTERNAL_SETUP` / unclaimed.
