# CONTROLLER-FOUNDATION-002D-C1-REBIND — Durable Command Inbox + Chat-to-Controller Ingress

Status: **DESIGN LOCK / PORTABLE BUILD AUTHORIZED / PRODUCTION ACTIVATION BLOCKED_EXTERNAL_SETUP**

Authoritative base: `controller-v2/foundation-002c-c1@a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d`
Frozen 002C qualified subject: `8b0f9517570fa29f3f09bc7f1db38c34fcbe84fa`
Historical 002D archaeology only: `controller-v2/foundation-002d@9436cf761888542c0a801089615271a9fff4ab66`

## 1. Reconstruction standing

The historical 002D branch does not descend from C1 and therefore cannot be used as an implementation base. Its requirements, research and alternative analysis are retained as archaeological evidence only. This rebind starts from the qualified C1 lineage and preserves 002B, 002C and C1 without rewrite.

Method gates completed by this artifact:

1. RECOVER — C1, frozen 002B/002C contracts, historical 002D research, GitHub current documentation, and current 002B kernel API recovered.
2. INVENTORY — command transport, semantic transaction, durable authority/event evidence, local observation projection and future identity/policy authorities separated.
3. ANALYZE — stale lineage, mutable-transport, wakeup-authority, retry stacking, read-after-write and identity-confusion failure modes classified.
4. TARGETED RESEARCH — GitHub current ruleset/ref/webhook behavior and distributed idempotency/retry guidance checked.
5. ADJUDICATE — one immutable Git ref per command remains the selected v1 transport representation; shared mutable inbox branch, Issues/comments and wakeup-only event mechanisms remain rejected as command authority.
6. DESIGN-LOCK — this document freezes the portable ingress boundary below.
7. BUILD — authorized only against this C1-derived branch.
8. ISOLATED QUALIFICATION — required before freeze.
9. CUMULATIVE REGRESSION — 002B + 002C + C1 + 002D required before 002D freeze.

## 2. Truth-owner map

No ingress component may create a second truth source.

| Concept | Truth owner | Rule |
|---|---|---|
| Candidate-intent transport record | protected immutable Git tag/ref/blob in the activated control-state repository | Create once; no update/delete; object IDs bind exact bytes. |
| Command semantic identity / idempotency / transaction | frozen 002B `ControllerKernel` | `command_id` + semantic fingerprint is authoritative; same ID/different contents is a hard conflict. |
| Durable Controller authority/event evidence | frozen 002C/C1 journal + activation standing | 002D may publish evidence only through the activated authority boundary. |
| Discovery cursor / observed-ref cache / scanner state | local rebuildable projection | Loss must not lose or duplicate semantic commands; full protected-ref rescan reconstructs it. |
| Logical issuer identity / delegated authority | future admitted identity/delegation authority | Git author/tagger text and command JSON assertions never authenticate the logical issuer. |
| Execution/admission permission | later policy/approval/admission layer | Transport acceptance is not execution authorization. High-impact commands remain gated later. |

## 3. State separation

The following states are distinct and may not be collapsed:

`TRANSPORT_DISCOVERED -> STRUCTURALLY_VALIDATED -> SEMANTICALLY_ACCEPTED`

or

`TRANSPORT_DISCOVERED -> REJECTED`

or

`TRANSPORT_DISCOVERED|STRUCTURALLY_VALIDATED -> DEFERRED_TRANSIENT -> retry`

`SEMANTICALLY_ACCEPTED` means 002B returned a transaction identity. It does **not** mean admitted, active, approved, authorized for an external effect or completed.

A wakeup/webhook/dispatch event never enters this state machine as authority. It can only trigger a rescan of protected refs.

## 4. Immutable command representation

V1 namespace:

`refs/tags/controller-inbox/v1/<command-id>`

`<command-id>` must be exactly the UUIDv7 `CommandEnvelope.command_id` accepted by frozen 002B.

Each command consists of:

1. canonical UTF-8 JSON blob containing the exact 002B command envelope;
2. annotated Git tag object targeting that blob with object type `blob`;
3. immutable tag ref targeting that annotated tag object.

Git author, committer, tagger and message metadata are non-authoritative transport metadata.

The scanner binds and records exact ref name, tag object OID, blob OID, command ID, semantic fingerprint, observed control-state repository numeric ID and observed protection standing.

## 5. Authority preconditions

Portable logic may be tested without production activation, but production ingress is fail-closed unless all are true:

- a valid C1 activation receipt exists and binds the frozen 002C subject;
- the inbox repository equals C1 `authority.control_state_repository` and numeric repository ID;
- ingress namespace is protected by effective rules applying to the exact tag namespace;
- creation is restricted to an explicitly observed ingress principal;
- update and deletion are denied for previously created command refs, with no always-bypass actor capable of rewriting historical command refs;
- journal and anchor authority remain separate and unchanged;
- the observed ingress principal identity is mechanically established rather than inferred from command bytes or Git metadata.

If effective rule/protection data is unavailable or ambiguous, production standing is `BLOCKED_AUTHORITY_EVIDENCE`, not warning-only acceptance.

## 6. Validation order

For each discovered candidate, validate in this order before 002B mutation:

1. exact repository identity matches activated C1 control-state repository;
2. exact ref namespace and UUIDv7 command ID;
3. ref resolves to an annotated tag object;
4. tag target type is exactly `blob`;
5. tag target OID and blob bytes are read by immutable object identity;
6. blob is valid UTF-8 JSON and within the configured bounded byte limit;
7. parsed object passes frozen 002B `validateCommand` strict schema validation;
8. command ID in JSON equals the command ID in the ref;
9. supplied fingerprint, when present, equals frozen 002B `commandFingerprint`;
10. required production protection/authority standing is current;
11. only then invoke `ControllerKernel.acceptCommand`.

No stale `expected_subject` is silently retargeted. The semantic transaction preserves the exact expected subject supplied by the command for later admission/currentness checks.

## 7. Idempotency and crash recovery

002B already provides the semantic duplicate guard: same `command_id` and same semantic contents returns the existing transaction; same ID with different semantic contents raises `IDEMPOTENCY_CONFLICT`.

002D must therefore never invent another semantic idempotency scheme. Scanner/projection idempotency is transport-local only.

Crash windows are reconciled as follows:

- crash before `acceptCommand`: protected ref remains discoverable and is retried;
- crash after 002B commit but before local observation persistence: rescan invokes `acceptCommand` again and receives the existing transaction;
- local observation database loss: full protected-ref rescan reconstructs observations without duplicating 002B transactions;
- unknown response from GitHub object/ref read: re-read immutable identity before classifying semantic failure;
- notification/wakeup loss: periodic/startup scan discovers the command independently.

No correctness property depends on read-after-write freshness of a mutable projection.

## 8. Retry ownership

Retries are owned by the outer ingress reconciliation loop only.

Retry only classified transient transport conditions such as timeouts, 429/rate-limit responses and retryable server failures. Use finite attempts, exponential backoff with jitter, respect provider retry guidance/headers when available, and preserve a `DEFERRED_TRANSIENT` standing after the invocation budget is exhausted.

Do not retry structural/schema/authority/idempotency conflicts. Do not add a second automatic retry loop around 002B semantic mutation. The same immutable command ref and 002B idempotency key make replay safe.

## 9. Rejection taxonomy

Rejected ingress must not create a product transaction. It produces bounded evidence containing no raw secret-bearing diagnostics.

Initial stable reason classes:

- `REF_NAMESPACE_INVALID`
- `COMMAND_ID_INVALID`
- `TAG_OBJECT_INVALID`
- `TAG_TARGET_NOT_BLOB`
- `COMMAND_TOO_LARGE`
- `COMMAND_UTF8_INVALID`
- `COMMAND_JSON_INVALID`
- `COMMAND_SCHEMA_INVALID`
- `COMMAND_ID_MISMATCH`
- `COMMAND_FINGERPRINT_MISMATCH`
- `INGRESS_AUTHORITY_INVALID`
- `IDEMPOTENCY_CONFLICT`

Transport outages/rate limiting are deferred, not rejected.

## 10. Correction, supersession and ordering

A submitted command is immutable. Correction or supersession is a new command with a new UUIDv7; any semantic relationship is expressed in later admitted command semantics, never by rewriting the original ref.

No global order is inferred from Git ref enumeration, commit/tag timestamps or UUIDv7 ordering. Concurrent commands remain distinct intents. Conflict resolution belongs to preconditions, current subject identity, policy, dependency and admission semantics.

## 11. Wakeup boundary

Webhook, `repository_dispatch`, workflow dispatch or another notification can contain a command/ref hint only. The controller must re-read the protected immutable ref and exact objects before ingestion.

GitHub currently documents that failed webhook deliveries are not automatically redelivered. Polling/reconciliation of the durable inbox is therefore mandatory rather than a fallback optimization.

## 12. Portable implementation contract

The 002D portable module must expose injected ports so tests do not pretend to prove GitHub production authority:

- candidate parser/validator operating on exact `{ref, tag_object, blob_bytes, repository_identity, authority_observation}`;
- semantic acceptor using frozen 002B validation/fingerprint/kernel contracts;
- reconciliation function that classifies ACCEPTED / DUPLICATE / REJECTED / DEFERRED without turning transport failure into semantic failure;
- bounded retry policy helper with injectable clock/randomness;
- no network credentials, GitHub administration or production ruleset mutations in the portable module.

Production GitHub scanning/tag/ruleset adapters are a separate integration surface and remain blocked until the real control-state repository/principal/rulesets exist.

## 13. Test denominator

Minimum isolated portable denominator before implementation freeze:

1. valid protected immutable command candidate accepts exactly once;
2. offline submission accepted after later rescan;
3. two command refs do not contend on one mutable head;
4. same ref replayed 1,000 times yields one semantic transaction;
5. same command ID with changed semantic bytes hard-conflicts;
6. ref/command ID mismatch rejected;
7. non-tag ref object rejected;
8. tag target non-blob rejected;
9. malformed UTF-8 rejected;
10. malformed JSON rejected;
11. unknown command field rejected by 002B;
12. unsupported protocol rejected;
13. unsupported command schema rejected;
14. supplied fingerprint mismatch rejected;
15. command-size limit rejects before semantic mutation;
16. transport timeout defers without transaction;
17. rate-limit response defers with bounded retry metadata;
18. nonretryable transport failure is classified without hidden retries;
19. lost wakeup does not affect full-scan recovery;
20. duplicate wakeup does not duplicate transaction;
21. crash after semantic acceptance/before observation persistence reconciles to duplicate existing transaction;
22. observation-state loss plus full scan reconstructs without duplicate transaction;
23. unauthorized repository identity blocks production acceptance;
24. missing/ambiguous effective protection blocks production acceptance;
25. unauthorized ingress principal blocks production acceptance;
26. update-capable historical command authority blocks production activation;
27. deletion-capable historical command authority blocks production activation;
28. Git author/tagger metadata never authenticates issuer;
29. notification payload alone cannot create transaction;
30. stale expected subject is preserved, never silently retargeted;
31. concurrent semantically conflicting commands remain separate immutable intents;
32. enumeration/timestamp order does not change semantic identity;
33. scanner retry loop is finite;
34. retry delay increases exponentially within cap;
35. jitter changes retry timing without changing semantics;
36. no retry occurs for schema/authority/idempotency conflict;
37. accepted ingress does not auto-admit/activate transaction;
38. rejected ingress creates no 002B transaction;
39. C1 control-state repository identity must equal ingress repository identity;
40. C1 activation fingerprint/qualified-subject binding is preserved in production ingress evidence.

Cumulative denominator must additionally rerun all frozen 002B tests, 002C portable/hosted tests available to the branch, and the C1 11-case activation-closure suite without regression.

## 14. Traceability lock

| Requirement / invariant | Implementation owner | Durable state | Interface / contract | Proof | Environment / blocker |
|---|---|---|---|---|---|
| immutable candidate intent | 002D Git transport adapter | protected tag/ref/blob | ingress candidate contract | isolated + GitHub integration | production ruleset/principal setup blocked |
| semantic idempotency | frozen 002B kernel | `commands` + `transactions` SQLite | `validateCommand`, `commandFingerprint`, `acceptCommand` | 002B cumulative tests + 002D replay tests | portable available |
| controller event authority | frozen 002C/C1 | GitHub durable journal/anchor | C1 activation receipt + journal publisher | cumulative C1/002C | production external setup blocked |
| offline rediscovery | 002D scanner | protected refs; local observation is projection | matching-ref scan contract | restart/loss tests | portable mock; production adapter pending |
| issuer authentication | future Identity/Delegation | not owned by 002D | issuer proof reference later | negative tests | architecture dependency |
| execution approval | future policy/admission | not owned by 002D | transaction admission later | negative tests | architecture dependency |
| wakeup tolerance | 002D reconciliation loop | none authoritative | hint-only wake contract | lost/duplicate wake tests | portable available |
| transient retry | 002D reconciliation loop | attempt metadata only | retry policy contract | backoff/jitter tests | portable available |

## 15. Exact blockers and non-claims

Production blockers remain:

- `C1_PRODUCTION_CONTROL_STATE_EXTERNAL_SETUP`
- `INGRESS_PRINCIPAL_IDENTITY_NOT_OBSERVED`
- `EFFECTIVE_TAG_RULESET_NOT_PRODUCTION_VERIFIED`

These block production ingress activation, not portable implementation and qualification.

No claim is made that ChatGPT/GitHub connector identity is a production ingress principal, that current repository rulesets satisfy the design, that a real dedicated control-state repository exists, or that any command is execution-authorized merely because it was transported or accepted.

## 16. Exact successor

`CONTROLLER-FOUNDATION-002D-PORTABLE-IMPLEMENTATION-001` — implement the locked candidate validation/reconciliation/retry contract on this C1-derived branch; run isolated tests and cumulative 002B/002C/C1 regression before any 002D freeze.
