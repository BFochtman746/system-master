# BROWSER — Foundation Contract 001

**Capability** `C02` · **Owner** `SYSTEM_MASTER/CONNECTED_ACTIONS` · **Lane** CONNECTED_ACTIONS · **Effective** 2026-09-13
**Authority** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Foundation implementation** `BROWSER-FOUNDATION-1.0`

> **Foundation 1.0 implementation accepted for deterministic browser-action intent compilation and verification only.** It does not launch a browser, open a network connection, execute JavaScript, hold credentials/cookies/session state, submit forms, upload/download files, click a live control, or perform any external side effect. A real browser runtime remains separately admitted work inside CONNECTED_ACTIONS.

## 1. Contract / interface

Provide a headless CONNECTED_ACTIONS-owned compiler/verifier for narrowly typed browser-action intents:

- implementation: `tools/browser_action_plan.py`
- build: `python3 tools/browser_action_plan.py build <browser.json> <output>`
- verify: `python3 tools/browser_action_plan.py verify <output>`
- input schema: `BROWSER-ACTION-SPEC-1.0`
- output: `browser-action-plan.json`, schema `BROWSER-ACTION-PLAN-1.0`
- qualification: `python3 .github/scripts/browser-foundation-qualify.py`
- representative corpus: `qualification/browser/corpus/basic/browser.json`
- CI: `.github/workflows/browser-foundation-qualification.yml`

Foundation 1.0 admits only three intent types: `NAVIGATE`, `EXTRACT_TEXT`, and `CLICK`. The input carries one HTTPS target URL and a strictly ordered action list. `NAVIGATE` has no payload. `EXTRACT_TEXT` and `CLICK` may carry only a selector. Unknown fields are rejected, preventing credentials, headers, cookies, scripts, form values, arbitrary request bodies, uploads, downloads, or provider-specific payloads from entering this foundation contract.

The compiler binds the plan to `CURRENT-AUTHORITY.json`, the authority-selected capability crosswalk, and C02's current `SYSTEM_MASTER/CONNECTED_ACTIONS` ownership. It emits a deterministic SHA-256-bound local plan with no timestamp.

## 2. Ingress routes

- Chat/System Master or another admitted capability may supply a local `browser.json` intent specification to C02.
- The specification is admitted only when the current authority-selected crosswalk still binds C02 to `SYSTEM_MASTER/CONNECTED_ACTIONS`.
- Target URLs must be absolute HTTPS URLs, may not contain embedded username/password credentials, may not target localhost, and may not use a non-default port.
- Action ids must be unique; action types and fields must match the narrow Foundation 1.0 schema.

Ingress creates a local plan only. It does not admit the plan to a browser runtime and it does not constitute user approval for a live action.

## 3. Egress routes

- A caller-selected local directory containing only `browser-action-plan.json`.
- The plan carries the target URL, ordered intent actions, current authority/crosswalk hashes, C02 owner binding, per-action effect classification, explicit authority requirements, and `plan_sha256`.
- Qualification writes `qualification-output/browser-foundation-1.0.json`; CI preserves it as `browser-foundation-1.0-evidence`.
- A future separately admitted CONNECTED_ACTIONS browser runtime may consume a verified plan, but no runtime handoff or dispatch path is implemented by Foundation 1.0.

There is no network, live-browser, credential, cookie/session, JavaScript, form submission, upload, download, click execution, publication, or external-side-effect egress.

## 4. Persistence and canonical writer

`tools/browser_action_plan.py` is the canonical writer for the Foundation 1.0 local browser-action plan. It writes only to a caller-selected output path that does not already exist, stages the plan in a sibling temporary directory, and promotes it by filesystem rename. Existing output is never overwritten or deleted.

C02/CONNECTED_ACTIONS owns browser-intent semantics. Any future browser runtime, session/cookie store, credential broker, download store, or connector/provider state requires its own admitted canonical writer and is not created by this foundation.

## 5. Dependencies

- `governance/CURRENT-AUTHORITY.json` — current authority pointer.
- Current capability crosswalk — proves C02 remains owned by `SYSTEM_MASTER/CONNECTED_ACTIONS`.
- Python 3 standard library only for Foundation 1.0 compilation/verification.
- A separately admitted browser runtime is required for actual navigation, DOM extraction, or clicking; no such runtime is claimed by Foundation 1.0.
- C27/PLUGINS and P14's absorbed connector-action semantics remain independent of this browser-intent substrate and are not closed here.

Foundation 1.0 has no network, browser-engine, WebDriver, credential, cookie/session, JavaScript, provider, connector, package-manager, or device dependency.

## 6. Failure semantics

Fail closed on malformed JSON, unknown fields, schema drift, duplicate action ids, unsupported action types, missing selectors, selectors where forbidden, unsafe/non-HTTPS URLs, embedded URL credentials, localhost targets, non-default ports, stale C02 ownership, stale authority/crosswalk hashes, plan-body hash mismatch, authority-boundary drift, per-action effect drift, or any attempt to mark a Foundation action executable.

`NAVIGATE` and `EXTRACT_TEXT` are labeled `SEPARATE_BROWSER_RUNTIME_ADMISSION_REQUIRED`. `CLICK` is conservatively labeled `SEPARATE_BROWSER_RUNTIME_AND_USER_AUTHORITY_REQUIRED`; Foundation 1.0 does not attempt to infer whether a future click is harmless or state-changing.

Repeated compilation of the same valid intent against byte-identical authority/crosswalk inputs produces byte-identical plans and the same `plan_sha256`.

## 7. Evidence target

The qualification command writes `qualification-output/browser-foundation-1.0.json`. Evidence includes source identity, corpus path, deterministic-repeat result, plan SHA-256, plan-file SHA-256, tamper detection, current-authority binding, browser-execution denial, network-access denial, credential/session/JavaScript/form-submission denials, and proof that `CLICK` remains separately user-authority gated.

Each compiled `browser-action-plan.json` separately binds the current authority and capability crosswalk by id/path/SHA-256, binds C02 to `SYSTEM_MASTER/CONNECTED_ACTIONS`, records every intent as non-executable, and carries `plan_sha256` over the complete plan body.

## 8. Acceptance target

Foundation 1.0 implementation acceptance requires all of the following:

1. `python3 -m unittest tests.test_browser_action_plan` passes.
2. `python3 .github/scripts/browser-foundation-qualify.py` passes against `qualification/browser/corpus/basic/browser.json`.
3. Two independent compiles produce byte-identical `browser-action-plan.json` files and the same `plan_sha256`.
4. Non-HTTPS URLs, embedded URL credentials, unknown payload fields, duplicate action ids and destructive output replacement fail closed.
5. Verification detects ordinary plan tampering.
6. Verification also rejects a re-hashed `CLICK` plan that attempts to downgrade required user authority.
7. C02 owner binding is derived from the current authority-selected crosswalk, not caller assertion.
8. Every action remains `execution_permitted_by_foundation: false`.
9. The CLI exposes no run, open, click, execute, browser, launch or navigate command.
10. The emitted plan denies browser execution, network, credential, cookie/session, JavaScript, form-submission, upload and download authority.
11. `.github/workflows/browser-foundation-qualification.yml` executes unit tests, qualification, canonical census verification and evidence preservation.

Passing these checks closes the C02 deterministic browser-action intent/authority-envelope Foundation gap. It does not prove a browser engine, browser session, live navigation, DOM compatibility, connector action runtime, credentials, user authorization, or production browsing.

## 9. Authority boundary

CONNECTED_ACTIONS/C02 may define typed browser-intent semantics, conservative effect classification, deterministic local planning, target URL validation, authority requirements, and local verification. Foundation 1.0 may not launch or control a browser, access a network, retain session state, use credentials, execute script, submit a form, upload/download content, click a live control, or perform an external side effect.

Actual browser execution requires a separately admitted CONNECTED_ACTIONS runtime. Any action capable of changing external state also requires the appropriate user/human/provider authority; Foundation 1.0 intentionally treats all `CLICK` intents as requiring explicit user authority rather than guessing.

## 10. Remaining gaps after Foundation 1.0

- No executable browser runtime/WebDriver/browser-engine adapter is implemented or proven here.
- DOM extraction against real pages, redirects, TLS behavior, cookies/sessions, downloads/uploads and JavaScript execution remain unqualified.
- Authentication/credential transport and user authorization remain separately gated.
- C27/PLUGINS remains an independent Foundation census gap; P14 remains absorbed into C27 rather than closed by C02.
- Production browser compatibility, device/browser-version coverage, rate limiting, robots/policy handling and provider-specific side-effect semantics remain outside this deterministic intent substrate.
