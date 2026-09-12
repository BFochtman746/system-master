# CONTROLLER V2 — EXECUTION-001B DESIGN REPAIR R2 001

Status: **FROZEN DESIGN REPAIR / REMOVES CONTENT-IDENTITY CYCLE BEFORE BUILD**
Predecessors:
- `EXECUTION-001B-WORKER-BINDING-DISPATCH-DESIGN-LOCK-001.md`
- `EXECUTION-001B-WORKER-BINDING-DISPATCH-DESIGN-REPAIR-R1-001.md`
Working lineage before repair: `controller-v2/foundation-006-c1-rebind@a365cad2fcd91953693a87d4ee49105653fcad88`

## 1. Trigger

Pre-build formalization exposed a circular identity definition in the original lock: it defined `dispatch_id` partly from the dispatch-envelope digest while also requiring the physical dispatch envelope to carry `dispatch_id`. That makes the two hashes mutually recursive.

No implementation was created under the circular definition.

## 2. Correct identity construction

The repaired v1 construction is two-stage and deterministic.

### Stage A — semantic dispatch identity

```text
dispatch_id = sha256({
  protocol: 'controller.worker-dispatch/v1',
  transaction_id,
  operation_id,
  contract_id,
  worker_binding_id,
  lease_id,
  resource_id,
  generation
})
```

`dispatch_id` does **not** contain `request_digest`.

### Stage B — physical dispatch envelope

```text
envelope = {
  protocol: 'controller.worker-dispatch-envelope/v1',
  dispatch_id,
  transaction_id,
  operation_id,
  contract_id,
  worker_binding_id,
  lease_id,
  resource_id,
  generation
}

request_digest = sha256(envelope)
```

The immutable `dispatch_intents.request_digest` stores exactly this Stage-B digest.

Foundation-003 `prepareExternalEffect()` receives exactly this canonical envelope as its request. Its independently calculated `external_effects.request_digest` must equal `dispatch_intents.request_digest` before any effect authorization or physical-send permit is accepted.

## 3. Replay and conflict law

- exact Stage-A semantic identity replay produces the same `dispatch_id`;
- any change to operation/contract/binding/lease/resource/generation produces a different dispatch ID;
- reconstructed Stage-B envelope must always hash to the persisted request digest;
- a row/event where `dispatch_id` or `request_digest` disagrees with the canonical reconstruction is corrupt and fails closed;
- no caller-provided dispatch ID or request digest becomes authority.

## 4. Test interpretation repair

The WDI denominator remains 60 cases. Strengthened interpretations:

- `WDI-030` exact replay verifies both deterministic Stage-A dispatch ID and Stage-B request digest.
- `WDI-040` same lease cannot be rebound to a different Stage-A identity.
- `WDI-042` replacement lease/generation necessarily changes Stage-A dispatch ID.
- `WDI-044` Foundation-003 effect request digest must exactly equal the independently reconstructed Stage-B envelope digest.
- `WDI-006` recovery validates both identity stages and rejects either mismatch.

Build remains authorized only with R1 + R2 applied. No production/native/A-01 evidence is implied.
