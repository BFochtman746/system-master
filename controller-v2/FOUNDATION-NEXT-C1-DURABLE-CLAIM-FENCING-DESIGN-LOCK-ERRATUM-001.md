# CONTROLLER FOUNDATION NEXT C1 — Durable Claim Renewal & Fencing Design Lock Erratum 001

Status: **DESIGN-LOCK ERRATUM / BUILD AUTHORIZED**

Parent design lock: `FOUNDATION-NEXT-C1-DURABLE-CLAIM-FENCING-DESIGN-LOCK-001.md`.

This erratum closes implementation ambiguities discovered by rereading the current C1-derived runtime after design lock and before build. It does not change ownership or authorize scheduler/worker execution.

## 1. Portable renewal horizon

Portable v1 locks the maximum requested renewal horizon to **300000 ms (5 minutes)** measured from the Controller-owned `observedAt` in the renewal request.

This is a safety/availability bound for the local Controller claim primitive, not a production worker SLA. A later deployment profile may narrow the value, but widening it requires a new qualified contract.

The semantic request remains explicit and replay-stable:

`renewLease({ leaseId, generation, operationId, desiredExpiresAt, observedAt })`.

`desiredExpiresAt - observedAt` must be `> 0` and `<= 300000 ms`.

## 2. Stale observation rule

A renewal that would mutate durable state must not extend authority from an observation older than the lease's durable `issued_at` or `last_heartbeat_at`.

Lost-response replay is checked first: if the exact current lease/generation is still ACTIVE and durable `expires_at >= desiredExpiresAt`, the desired state is already satisfied and the method returns the durable standing without rewriting state or minting an event. This permits replay after a later liveness observation while preventing stale observations from creating a new extension.

## 3. Semantic evidence events

A renewal that actually extends expiry appends exactly one `lease.renewed` event to the operation stream after the lease row update in the same SQLite transaction. The event contains only bounded nonsecret coordination evidence:

- lease id;
- operation id;
- resource id;
- generation;
- previous expiry;
- new expiry;
- Controller-owned observed-at timestamp.

A first successful revocation appends exactly one `lease.revoked` event to the operation stream containing:

- lease id;
- operation id;
- resource id;
- generation;
- bounded reason code;
- Controller-owned observed-at timestamp.

No raw operator text, chat/webhook metadata, credential, specialist payload, or provider response is permitted in either event.

The existing semantic-event verifier safely preserves unknown event types in the cryptographic stream even when a projection reducer does not interpret them. Therefore these events are evidence-bearing without falsely changing operation state.

## 4. Revocation idempotency

Portable v1 treats the durable revocation desired state as:

`(lease_id, operation_id, generation, reason_code)`.

If the lease is already REVOKED and the durable `lease.revoked` event matches that tuple, replay returns the same terminal standing without another event. A changed reason code or changed binding under the same revoked lease is an `IDEMPOTENCY_CONFLICT`.

RELEASED or EXPIRED is not silently reinterpreted as REVOKED.

## 5. Recovery boundary discovered before build

The current event reducer records `lease.granted` only as a resource-generation fact, and current `rebuildControllerStore` does **not** rebuild complete lease rows from the durable journal. Therefore this build must not claim that local-database loss can reconstruct current lease expiry/revocation state.

Portable v1 qualification for this unit may prove:

- same-database close/reopen preserves renewal/revocation;
- event-chain evidence preserves renewal/revocation records;
- local restart reconciliation still fences by durable row/generation;
- external-effect dispatch remains fenced by the current lease row/generation.

It may **not** promote event-journal-only lease reconstruction to PASS.

That missing capability is classified as a separate Controller-foundation recovery obligation:

`BLOCKED_FOUNDATION_SUCCESSOR — LEASE EVENT PROJECTION / FRESH-STORE REBUILD CONTRACT NOT YET DESIGN-LOCKED`.

The current build must preserve enough immutable event evidence to make that successor possible without inference.

## 6. Build authorization remains narrow

Authorized now:

- one provider-neutral `durable-claim-authority` module using current schema-v5 tables;
- explicit replay-stable renewal;
- explicit idempotent Controller-owned revocation;
- read-only durable lease standing;
- 40-case isolated denominator plus full inherited hosted matrix.

Not authorized now:

- scheduler selection;
- worker spawning;
- distributed consensus;
- network-filesystem lease authority;
- provider I/O;
- peer-owner mutations;
- production activation;
- A-01 or target-native evidence.
