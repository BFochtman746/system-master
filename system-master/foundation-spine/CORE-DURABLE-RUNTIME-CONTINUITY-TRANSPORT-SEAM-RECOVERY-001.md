# CORE Durable Runtime Continuity Transport Seam Recovery 001

Status: RECOVER / INVENTORY / ANALYZE / ADJUDICATE COMPLETE; CONSUMER-SIDE SEMANTIC LOCK PARTIAL; PROVIDER DESIGN LOCK BLOCKED  
Transport implementation build: NOT AUTHORIZED  
Fresh Transport qualification: NOT EXECUTED

Exact live Foundation owner reread immediately before mutation:

- `system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`
- isolated predecessor: `second-shift/core-durable-runtime-continuity-recovery-001-20260912@856e1076611a3bfa16a178e950df0d0807a8a023`

## 1. Constitutional owner boundary

`SYSTEM-SPECIFICATION.md` defines Transport & Delivery as the owner of durable command/event delivery mechanics: outbox/inbox, delivery attempts, deduplication, declared ordering scopes, replay, acknowledgement and dead-letter/quarantine. Duplicate delivery is expected and must be safe. Transport owns carriage, not event business meaning or workflow completion.

For continuity this means:

- a wakeup, message acknowledgement or transport receipt is never durable Job/Attempt/Effect/Evidence truth;
- Durable Runtime must re-read its own durable state after every wakeup/reconnect before deciding what to do;
- delivery may repeat, disappear temporarily or arrive reordered within the limits of the declared ordering contract without corrupting semantic state;
- semantic idempotency belongs at the business/runtime boundary in addition to Transport dedupe.

Owner collision after adjudication: **0 for the consumer-side rule**.

## 2. Exact repository recovery result

The exact live `foundation-spine` tree contains the constitutional Transport owner definition but no dedicated freshly frozen Transport provider/service subtree comparable to System Root, Identity, Contracts or Keel.

Recovered continuity donor behavior exists:

- G-WP-009 `DurableSignalRecoveryAdapter` consumes an external `SignalAuthority`, checks the current attempt/fence before consumption, records a digest-bound local consumption binding, uses an OS file lock, checksum-verified replay and `FileChannel.force(true)`, and returns `ALREADY_CONSUMED` idempotently for an already consumed signal.
- the adapter's durable journal is useful runtime-consumption substrate, but its `SignalAuthority` is an abstract historical authority and cannot be promoted into the current Transport owner without source/contract recovery.
- G-WP-012 evidence publication and the newly frozen P7 continuity evidence outbox establish replay/backfill needs, but their historical local storage is not a current Transport provider.
- F-WP-007/F-WP-010 establish durable intent/observation/reconciliation and explicit cross-owner refs, but they do not provide the current generic Transport inbox/outbox provider contract.
- PLATFORM-011 governs external connector/communication transport and provider receipts. Its reconciliation explicitly keeps remote responses non-authoritative and does not broaden effect authority, but it is not the generic internal Transport & Delivery authority for all System Master commands/events.

Result: **generic Transport source/provider custody is not recovered on the current live Foundation subject**.

## 3. Recovered reusable mechanics

The following mechanics are owner-correct continuity/transport substrate and should be preserved when the current Transport provider is recovered:

- durable delivery identity distinct from semantic/business idempotency identity;
- duplicate delivery expected;
- explicit consumed/acknowledged/replayed/quarantined standing;
- exact payload/content digest binding;
- declared source/order sequence where ordering is required;
- stale Attempt/fence rejection before runtime consumption;
- replay from durable state rather than in-memory notification queues;
- checksum/integrity validation before applying recovered delivery state;
- append/flush durability before reporting a locally authoritative runtime-consumption binding;
- lost acknowledgement reconciled by read/query and idempotent redelivery rather than blind semantic re-execution;
- dead-letter/quarantine is a delivery standing, not a business failure/completion standing.

Historical implementation standing remains `ADAPT / QUALIFIER_ONLY / PROVENANCE_ONLY` until bound to the current Transport owner.

## 4. Consumer-side semantic envelope

The following information is the minimum continuity side needs from a future current Transport contract. Names are design identifiers, not claims that an API already exists.

### T1 — DeliveryEnvelopeRef

- immutable delivery/message id;
- exact contract subject/version/digest;
- message kind/route/topic/queue identity as declared by Transport;
- producer/source authority;
- payload/content digest + content ref;
- semantic correlation refs including Work/Job/Attempt where allowed;
- ordering scope + sequence only where the producer contract declares ordering;
- created/accepted time metadata;
- transport dedupe identity.

### T2 — DeliveryStandingRef

- exact T1 binding;
- standing such as `PENDING | DELIVERED | ACKNOWLEDGED | REPLAYABLE | QUARANTINED | DEAD_LETTER | UNKNOWN` or current equivalent;
- delivery-attempt sequence/count;
- observed time;
- transport receipt digest/version;
- quarantine/dead-letter reason when applicable.

T2 is carriage truth only.

### T3 — InboxConsumptionRef

- exact T1 binding;
- consumer identity;
- semantic-consumer idempotency identity/digest;
- consumed/reconciled standing;
- current Attempt/fence ref when consumption is attempt-bound;
- receipt digest/version/time.

T3 cannot certify Job completion or an external effect.

### T4 — ReplayCursorRef

- exact consumer/subscription/inbox identity;
- declared ordering scope;
- durable cursor/watermark;
- gap/unknown/quarantine standing;
- version/digest.

A cursor is a transport projection; it cannot replace the consumer's canonical runtime state.

## 5. Wakeup and reconciliation lock

For runtime/evidence wakeups:

1. receive T1 or a non-authoritative wakeup containing a T1 reference;
2. validate contract/digest and consumer eligibility;
3. re-read current durable Runtime aggregate before claiming semantic work;
4. if the referenced work is already terminal/consumed/reconciled, acknowledge/reconcile without semantic re-execution;
5. if current Attempt/fence is stale, do not execute and record/reconcile stale consumption according to Transport contract;
6. perform semantic mutation only through the Runtime persistence transaction/idempotency rules already frozen;
7. acknowledge/record T3 only after the durable semantic result or idempotent existing result is known;
8. lost acknowledgement permits redelivery; redelivery must discover the same semantic result;
9. dead-letter/quarantine blocks delivery progress but does not invent Job/Effect/Evidence failure standing;
10. restart/offline rediscovery scans authoritative Runtime/outbox/inbox state rather than waiting for a remembered wakeup.

## 6. Ordering lock

Transport may guarantee ordering only within an explicitly declared ordering scope. Continuity may not assume global FIFO.

- messages outside the same declared ordering scope may reorder;
- consumer semantics must use exact aggregate version/fence/idempotency checks;
- sequence gaps become explicit gap/unknown state and trigger replay/reconciliation;
- a newer delivery does not silently authorize skipping an earlier required semantic transition;
- ordering metadata is not a substitute for Work/Plan/Job version truth.

## 7. Retry / redelivery lock

Transport redelivery and Runtime retry are separate layers and must not stack blindly.

- Transport may redeliver a message according to its own bounded policy;
- Runtime must not add a second retry loop around the same delivery operation unless failures are classified and the boundary is explicitly owned;
- semantic work retries are driven by Runtime state and idempotency, not by the count of message deliveries;
- transient Transport/provider failures use bounded backoff/jitter where the Transport contract allows it;
- corrupt contract/payload, stale fence, semantic conflict and authorization denial are not transient delivery retries.

## 8. Evidence outbox interaction

The continuity Evidence seam requires durable V1 evidence intents. Transport is responsible only for carrying those intents to Evidence and carrying the acceptance/receipt response if the architecture uses messaging.

Required fence:

- Runtime TX state + V1 outbox intent is authoritative before delivery;
- Transport delivery can be lost/duplicated/replayed;
- Evidence acceptance V2 remains Evidence-owned;
- a Transport ACK cannot substitute for V2;
- replay after provider outage reuses the same semantic V1 identity/digest;
- dead-letter/quarantine remains visible and blocks evidence-delivery closure without erasing the underlying Runtime semantic event.

## 9. Qualification denominator — consumer seam minimum

Once an exact current Transport provider contract is recovered, the Runtime adapter must satisfy at least this **36-case minimum** in addition to prior denominators. This is a test obligation, not PASS evidence.

- duplicate delivery + semantic dedupe / same digest: **6**
- same delivery/dedupe identity + conflicting semantic digest: **4**
- lost acknowledgement / redelivery / reconcile-existing-result: **4**
- restart/offline rediscovery with lost wakeup: **4**
- stale Attempt/fence delivery rejection: **4**
- ordering-scope reorder/gap/replay behavior: **4**
- corrupt payload/contract/quarantine/dead-letter behavior: **4**
- Evidence-outbox carriage where ACK does not equal Evidence acceptance: **4**
- retry-layer separation / transient-only bounded retry: **2**

Total: **36 cases**.

Existing non-shrinkable obligations remain 80 owner-local persistence + 48 Effect seam + 40 Evidence seam + the 42 recovered G-WP-008..015 requirement rows and current/cross-owner regression. Overlap must be cross-referenced, not inflated into a fake independent PASS count.

## 10. Blockers

- `BLOCKED_TRANSPORT_PROVIDER_SOURCE_CUSTODY` — no exact current generic Transport provider/source subtree was recovered on the live Foundation subject.
- `BLOCKED_TRANSPORT_REDISCOVERY_CONTRACT_NOT_BOUND` — exact inbox/outbox/dedupe/order/replay/ack/dead-letter service contract not frozen.
- `BLOCKED_RECOVERY_SOURCE_AUTHORITY` — Work/Project and Orchestration exact refs remain unresolved for whole-chain delivery correlation.
- `BLOCKED_ROUTING_PLACEMENT_INTERFACE_NOT_BOUND` — attempt/fence/consumer assignment integration remains partially unresolved.
- `BLOCKED_EVIDENCE_ASSURANCE_INTERFACE_NOT_BOUND` — generic evidence acceptance provider remains unresolved even though the consumer seam is frozen.
- `BLOCKED_FRESH_QUALIFICATION_NOT_RUN` — no current Transport adapter implementation exists on this reconstruction branch.
- `BLOCKED_NATIVE_A01_PRODUCTION_EVIDENCE_NOT_EXECUTED` — explicitly unclaimed.

## 11. Materially blocked unit result

Transport provider design lock and build are **materially blocked by source/provider custody**, not by uncertainty about ownership. The safe result is to preserve the consumer-side semantics and stop before inventing a provider implementation.

Targeted external research is not justified for this blocker: this is repository authority/source custody, and public messaging literature cannot identify the System Master current Transport implementation.

## 12. One dependency-valid successor

**`CORE-DURABLE-RUNTIME-CONTINUITY-SECURITY-SEAM-REBIND-001`**

While Transport source custody remains blocked, continue independent Foundation-owned work by recovering the Security / Privacy / Secrets / Cryptography seam consumed by continuity, using current Identity/Delegation plus F-WP security/secret-reference substrate and PLATFORM-011 secret-broker/provider boundaries as evidence. Freeze only consumer semantics: authorization/purpose/data/security decision refs, opaque secret capabilities, revocation/expiry, no-secret persistence, cryptographic verification requirements and fail-closed UNKNOWN behavior. Do not create a competing Identity, Effect, Transport or specialist policy owner. Bind an additive qualification denominator and leave external secret/provider/native/A-01 standing unclaimed.

## 13. Evidence fence

This unit claims Transport archaeology, ownership adjudication and consumer-side semantic/test obligations only. It claims no current generic Transport provider implementation, no current Transport PASS, no historical PASS transfer, no A-01/native/production result, no real provider/network standing, no human evidence and no specialist-system correctness.