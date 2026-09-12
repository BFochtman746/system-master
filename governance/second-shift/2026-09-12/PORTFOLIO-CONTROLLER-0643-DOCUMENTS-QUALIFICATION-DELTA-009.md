# 2026-09-12 SECOND SHIFT PORTFOLIO CONTROLLER — 06:43 ET DOCUMENTS QUALIFICATION DELTA 009

Standing: **DOCUMENTS_ROUTE_INTEGRATION_COMPILES_AND_ISOLATED_PASSES__CUMULATIVE_REGRESSION_FAILS_CLOSED__OWNER_REPAIR_REQUIRED__NO_CONTROLLER_CLAIM**

This checkpoint supersedes the in-progress qualification standing in `PORTFOLIO-CONTROLLER-0642-LIVE-RECONCILIATION-008.md`. It is evidence only; no Documents owner mutation is performed by the portfolio controller.

## Exact repaired subject and observed qualification

Documents owner worker exact repaired integration subject:

`b91605fe762f3af7920e04ad4c2362185542c176`

Bounded repair: `UniversalDocumentSpine.ENGINE_ID` is rebound to `DocumentExistingArtifactEffectExecutor.ENGINE_ID` rather than restoring the legacy inline mutation engine identity.

Fresh hosted attempt on GitHub Ubuntu / Temurin Java 21 produced:

- strict Java 21 compile: **PASS** (`compile_status=0`)
- isolated effect-runtime denominator: **PASS**, `REBUILD=48`, `MASTER=44`
- owner-route integration regression: **PASS**, `DocumentSpine002APortableTests assertions=43`
- cumulative portable regression: **FAIL** (`cumulative_status=1`, 32 portable test classes attempted)

Workflow run `34689078221`, job `103541064819`, therefore correctly concluded **FAILURE**. The owner worker preserved the exact failed-attempt evidence on branch head `51b56302e5623385393ac3bc450e7dece34912e0` rather than claiming success.

## Demonstrated cumulative conflict

The changed live route now correctly fails closed for effectful document execution without an explicit `DocumentEffectAdmissionProvider`:

`SecurityException: effectful document execution requires explicit DocumentEffectAdmissionProvider`

The cumulative failures are concentrated in legacy portable tests that still invoke effectful MASTER/REBUILD-style spine execution through the old five-argument construction path without supplying effect admission. Demonstrated affected classes in the preserved cumulative tail include:

- `DocumentDocxMasteryT01PortableTests`
- `DocumentDocxMasteryT02PortableTests`
- `DocumentDocxMasteryT03PortableTests`
- `DocumentDocxMasteryT04PortableTests`
- `DocumentDocxMasteryT05PortableTests`
- `DocumentDocxMasteryT06PortableTests`
- `DocumentDocxMasteryT07PortableTests`
- `DocumentDocxMasteryT08PortableTests`
- `DocumentWorldClass001CPortableTests`

This is not evidence that the new effect-admission fence should be weakened. The isolated 48/44 and owner-route tests pass with the explicit contract. The owner-valid repair question is whether each affected cumulative test represents an effectful operation that must be rebound to an explicit deterministic test admission provider, or a genuinely read-only path that the integration classified incorrectly. That adjudication belongs to Documents and must be made test-by-test before mutation.

## Fail-closed disposition

- No `DOCUMENTS-SPINE-EFFECT-RUNTIME-INTEGRATION-001` PASS is admitted.
- No owner-control freeze is admitted.
- The earlier qualified pre-route runtime subject `969519ce33c111e8816df6f4705fa5e503d351e4` remains valid only for its pre-integration scope; it does not qualify `b91605fe...`.
- `b91605fe...` has fresh evidence for compile + isolated REBUILD/MASTER + owner-route behavior, but **not cumulative compatibility**.
- branch head `51b56302...` is an evidence-bearing failed-attempt head, not a qualified runtime subject.

Safe Documents successor remains owner-local:

`DOCUMENTS-SPINE-EFFECT-RUNTIME-INTEGRATION-CUMULATIVE-REPAIR-001 — inventory every cumulative failure against the explicit effect-admission contract; classify each call as EFFECTFUL_REQUIRES_TEST_ADMISSION / READ_ONLY_WRONGLY_GATED / STALE_LEGACY_EXPECTATION; repair only owner-valid test/route mismatches without bypassing effect admission; rerun strict compile + REBUILD-48 + MASTER-44 + owner-route + all cumulative portable classes on one exact changed subject; only then consider owner-control freeze.`

The portfolio controller does not perform that repair while the Documents owner worker is active.

## Nonclaims

No Microsoft Office-native, target-device, real external-policy-provider, human/author, private-source, publication, production or A-01 evidence is inferred. Passing isolated tests does not override a failed cumulative gate.
