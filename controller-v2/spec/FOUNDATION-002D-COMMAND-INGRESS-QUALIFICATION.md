# CONTROLLER-FOUNDATION-002D — Durable Command Inbox + Admission Poller

Status: QUALIFIED REFERENCE CONTRACT

Qualified branch: `controller-v2/foundation-002b`
Qualified implementation head: `caecab8c060383121d7f70b175fb6533bacf53c8`
Hosted denominator: 196/196 PASS on Node 22 and Node 24.

## Frozen ingress invariants

1. The durable command object is authority; notifications/webhooks are wake-up hints only.
2. Commands are immutable after creation. Correction requires a new command identity.
3. Repeated identical command delivery is idempotent and creates one logical transaction.
4. Reuse of a command ID with different semantic content is a hard conflict.
5. Processed commands are not deleted as part of ingestion.
6. Inbox enumeration order has no semantic meaning.
7. Full rescans are expected and safe.
8. Stored-content tampering is detected before ControllerKernel mutation.
9. A corrupt independent command does not erase or suppress another valid command.
10. Ingestion creates an OPEN transaction only. It never admits, plans, leases, dispatches, qualifies, or promotes work.
11. Returned inbox values are defensive copies, never mutable authority references.
12. Missed notification cannot lose work because the controller recovers by polling durable authority.

## Important scope boundary

This qualification covers the transport-neutral durable-inbox contract and controller poller. A real GitHub-backed command-inbox adapter remains dependent on the dedicated control-state repository and must be separately integration-qualified before production authority.
