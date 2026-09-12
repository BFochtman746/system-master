# CONTROLLER-FOUNDATION-002D-PORTABLE-QUALIFICATION-001

Standing: **PORTABLE IMPLEMENTATION QUALIFIED / CUMULATIVE CONTROLLER REGRESSION PASS / PRODUCTION INGRESS ACTIVATION BLOCKED**

## Exact subjects

- C1 base: `controller-v2/foundation-002c-c1@a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d`
- 002D implementation head tested by pull-request integration: `controller-v2/foundation-002d-c1-rebind@3ee6edbaf13c7f0de7acb65f1b8f580ec0a1952c`
- GitHub pull-request merge test subject: `fc00e5627e68bc33be4f4f9d47c08fc7af9f7cd9`
- Pull request: `#63`
- Hosted workflow: `Controller v2 Foundation`, run `34674955034`

This receipt is append-only evidence written after the tested subject. The receipt commit itself is not retroactively covered by the recorded test run.

## Hosted cumulative result

The existing Controller V2 foundation workflow checked out the exact PR merge subject and ran the full `controller-v2` Node test suite on both supported hosted runtimes.

| Runtime | Tests | Passed | Failed | Skipped | Result |
|---|---:|---:|---:|---:|---|
| Node 22.23.2 | 198 | 198 | 0 | 0 | PASS |
| Node 24.20.0 | 198 | 198 | 0 | 0 | PASS |

The workflow completed successfully. The denominator includes the pre-existing 002B/002C/C1 Controller foundation tests plus the new portable 002D ingress tests, so this is cumulative regression evidence rather than a focused-test-only claim.

## 002D behaviors exercised in the cumulative suite

The new ingress suite demonstrated, on the integrated C1-derived subject:

- valid immutable command candidates enter frozen 002B as exactly one OPEN transaction;
- replay of the same immutable command ref is semantically idempotent, including a 1,000-replay case;
- reuse of the same command ID with changed semantic contents fails with an idempotency conflict;
- exact inbox namespace, UUIDv7 identity, annotated-tag identity and blob target checks fail closed;
- invalid UTF-8, invalid JSON, unknown command fields, unsupported protocol and bounded-size violations reject before semantic mutation;
- production-authority validation requires exact C1 control-state repository identity, effective create/update/delete protections, no historical-rewrite bypass and matching observed creation principal;
- Git author/tagger metadata is not treated as logical issuer authentication;
- a lost wake signal does not lose the command because later reconciliation from the immutable ref accepts it;
- crash after semantic acceptance but before local observation persistence reconciles to the existing transaction rather than creating a duplicate;
- transient transport errors use finite retries and defer without creating a transaction when the retry budget is exhausted;
- schema/authority/idempotency classes are not silently retried;
- exponential backoff, cap and jitter behavior is deterministic under injected randomness;
- a notification payload alone cannot create a transaction;
- stale expected-subject identity is preserved for later admission adjudication and is never silently retargeted;
- C1 qualified-subject identity and activation fingerprint remain bound in production ingress evidence.

## Preserved predecessor standing

No regression was observed in the frozen Controller foundation behavior included in the cumulative suite, including:

- 002B transaction/idempotency kernel semantics;
- fencing, lease, recovery, migration and canonical subject behavior;
- 002C durable journal, publisher, Git transport, integrity, anchor, token and authority-preflight behavior;
- C1 activation-closure semantics and its 11 targeted closure cases.

## Separate control-plane enforcement fact

An A-01 Control Plane Enforcement workflow also completed successfully for the same 002D PR head. That is control-plane enforcement evidence only. It is **not** an A-01 qualification of the 002D ingress subject and does not grant native, production, external or promotion authority.

## Production blockers intentionally preserved

Portable qualification does not remove the real production authority fences:

1. `C1_PRODUCTION_CONTROL_STATE_EXTERNAL_SETUP` — a dedicated production control-state installation has not been established through the required external GitHub administration.
2. `INGRESS_PRINCIPAL_IDENTITY_NOT_OBSERVED` — the exact production principal authorized to create command refs has not been mechanically established.
3. `EFFECTIVE_TAG_RULESET_NOT_PRODUCTION_VERIFIED` — the intended create-only / update-denied / delete-denied inbox namespace has not been verified on the real production control-state repository.

Consequently there is no claim of real protected-tag ingestion, production Controller activation, 002D A-01 subject PASS, external-effect authority, or execution authorization.

## Closure disposition

- RECOVER: PASS
- INVENTORY: PASS
- ANALYZE: PASS
- TARGETED RESEARCH: PASS first current pass
- ADJUDICATE: PASS for portable v1 design
- DESIGN-LOCK: PASS for portable v1 contract
- BUILD: PASS for portable module
- ISOLATED/CUMULATIVE HOSTED QUALIFICATION: PASS, 198/198 on Node 22 and 198/198 on Node 24
- PRODUCTION GITHUB INTEGRATION QUALIFICATION: BLOCKED_EXTERNAL_SETUP
- A-01 002D SUBJECT QUALIFICATION: NOT EXECUTED / NOT CLAIMED
- WHOLE 002D PRODUCTION FREEZE: NOT CLAIMED

## Dependency-valid successor

`CONTROLLER-FOUNDATION-002D-PRODUCTION-INGRESS-ADAPTER-FORENSICS-001` — recover and specify the exact GitHub adapter/preflight interfaces and production authority evidence contract without fabricating the absent repository/principal/ruleset facts. In parallel, remaining Controller foundation domains may be recovered as archaeology only where they do not depend on pretending that production 002D activation is complete.
