# SMR021 Authorization Context Binding Research Delta 001

Date: 2026-09-09
Owner lane: `SYSTEM_MASTER/CORE`
Status: **RESEARCH_AHEAD CLOSED / IMPLEMENTATION AND EVALUATION DELTA SEALED**
Parent readiness packet: `SMR021-ADMISSION-BINDING-TOMORROW-READINESS-001.md`

## Question closed

What current external security guidance materially strengthens the reproduced SMR021 admission/work/action binding repair without importing a generic authorization platform or changing System Master ownership?

## Sources and provenance

Accessed 2026-09-09.

1. OWASP Cheat Sheet Series — Authorization Cheat Sheet
   - https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
   - Relevant guidance: deny by default; validate permissions on every request; authorize the specific object/function, not merely an object type; exit safely on failure; create unit and integration tests for authorization logic.

2. IETF RFC 9700 — Best Current Practice for OAuth 2.0 Security
   - https://datatracker.ietf.org/doc/html/rfc9700
   - Relevant principle: authorization should be restricted to particular resources and actions, and the receiver verifies on every request that the authorization was intended for that particular action on that particular resource.

3. IETF RFC 9396 — OAuth 2.0 Rich Authorization Requests
   - https://datatracker.ietf.org/doc/html/rfc9396
   - Relevant principle: fine-grained authorization can bind resource/action details; authorization details exposed to a user-controlled channel require integrity protection against tampering/swapping; resource servers need the granted authorization details needed for enforcement.

4. MITRE CWE-441 — Unintended Proxy or Intermediary ('Confused Deputy')
   - https://cwe.mitre.org/data/definitions/441.html
   - Relevant weakness model: failing to preserve the original request source/context can allow a more-privileged intermediary to exercise authority on behalf of an unintended requester/target.

5. MITRE CWE-639 — Authorization Bypass Through User-Controlled Key
   - https://cwe.mitre.org/data/definitions/639.html
   - Relevant weakness model: an attacker-controlled record/resource identifier cannot substitute for authorization to that exact underlying object.

6. NIST SP 800-207 — Zero Trust Architecture
   - https://doi.org/10.6028/NIST.SP.800-207
   - Relevant principle: the policy decision/enforcement path evaluates whether the subject and request are valid for the enterprise resource; the enforcement point gates access rather than trusting network/location context.

These sources are used for security invariants and evaluation design only. System Master is not adopting OAuth, a generic zero-trust platform, or an external policy engine merely because those sources use them as examples.

## Finding dispositions

### 1. Exact work/resource binding

Disposition: **KEEP / STRENGTHEN TESTING**

The already-sealed repair requires `proposed.workId()` to equal the route/admission work identity. This matches the current external principle that authorization is checked for the particular resource/object rather than a broad class.

Implementation implication:

- retain exact work identity inside the admission projection;
- compare exact work identity before any persistence;
- do not accept a user/caller-controlled work identifier as sufficient evidence of authorization.

Evaluation delta:

- retain `CROSS_WORK_REJECT`;
- add a sibling fixture with two otherwise-equivalent work objects proving that equality is exact and not type/category based.

### 2. Exact action binding

Disposition: **KEEP / STRENGTHEN TESTING**

The already-sealed repair forbids a free caller-supplied admitted-action set and requires action authority to originate in immutable owner-defined descriptor/admission evidence.

Implementation implication:

- action authorization must be coupled to the selected route/descriptor evidence;
- possession of a valid route for one action cannot imply another action on the same work;
- no UI-presented action becomes authorized merely because it is visible or syntactically valid.

Evaluation delta:

- retain `FREE_ACTION_INJECTION_REJECT`;
- add `SAME_WORK_DIFFERENT_ACTION_REJECT` to prove a valid route/work does not over-authorize sibling actions.

### 3. Authorization must be revalidated at the enforcement boundary

Disposition: **ADD_OR_REFINE**

OWASP and RFC 9700 independently support checking authorization at each request/enforcement event, not treating earlier authentication or a broad prior grant as permanent authority.

Implementation implication:

At `submit(...)`, the current candidate must verify the route-bound authorization context required by the current owner contract. A route/descriptor snapshot that is stale, superseded, no longer QUALIFIED, no longer admits USER-EXPERIENCE, or no longer matches its bound digest must fail closed.

This does not require re-running the entire routing algorithm inside USER-EXPERIENCE. It requires USER-EXPERIENCE to validate the current repository-defined evidence that PLATFORM-006 exposes for consumption.

Evaluation delta:

- add `STALE_ROUTE_AFTER_DESCRIPTOR_CHANGE_REJECT`;
- retain `DESCRIPTOR_DIGEST_MISMATCH_REJECT`;
- retain `UNQUALIFIED_DESCRIPTOR_REJECT`;
- retain `CALLER_ALLOWLIST_REJECT`.

### 4. Authorization-context integrity and anti-swapping

Disposition: **ADD_OR_REFINE**

RFC 9396's anti-tampering/swapping principle maps directly to the reproduced defect: independently valid authorization fields must not be recombined into a new unauthorized tuple.

Implementation implication:

Treat the admission context as one integrity-bound authorization tuple, not a bag of independently replaceable fields. At minimum the consumer-visible evidence must bind the current owner-defined equivalents of:

`principal/session + work/resource + selected capability/descriptor identity + descriptor digest + admitted action grant + admission evidence identity + work/admission version context`

Exact field shape remains controlled by the recovered dependency-current contracts. USER-EXPERIENCE must not invent missing PLATFORM-006 semantics.

Evaluation delta:

Add pairwise/multi-field swap probes:

- `WORK_FROM_ROUTE_B_ACTION_FROM_ROUTE_A_REJECT`;
- `DESCRIPTOR_FROM_ROUTE_B_EVIDENCE_FROM_ROUTE_A_REJECT`;
- `SESSION_FROM_ROUTE_B_ROUTE_A_REJECT`;
- `ADMISSION_REF_SWAP_REJECT`.

These tests are specifically intended to catch future partial-binding regressions even if each substituted field is individually well-formed.

### 5. Confused-deputy framing

Disposition: **KEEP AS SECURITY CLASSIFICATION / DO NOT ADD NEW PLATFORM**

The reproduced `work-A -> work-B` acceptance is consistent with a confused-deputy risk: USER-EXPERIENCE could exercise a legitimate admission decision outside the context for which that authority was granted.

Implementation implication:

Preserve original route/work/action/descriptor context through the projection and reject any request that cannot be proven to belong to that exact context.

Do not create a generic confused-deputy framework. The existing owner boundaries plus exact context binding are sufficient if implemented and tested correctly.

### 6. Deny-by-default and failure atomicity

Disposition: **KEEP / ADD OBSERVABILITY REQUIREMENT**

Authorization ambiguity, missing owner-defined action grants, stale evidence, mismatched work/action/context, or unverifiable descriptor state must reject rather than degrade to a permissive UX default.

Implementation implication:

- no authorization failure may append a command;
- no authorization failure may mutate attention or work state as a side effect;
- failure evidence should preserve a bounded reason/classification without logging sensitive payload content unnecessarily.

Evaluation delta:

- retain `NO_FAILED_ATTEMPT_PERSISTENCE`;
- add a deterministic store snapshot/assertion before and after every rejection family;
- add `MISSING_ACTION_GRANT_FAIL_CLOSED` for the pre-mutation owner-contract boundary.

## Updated focused adversarial gate

The parent readiness packet's 15-case gate remains valid. Add these five independent cases, yielding a **minimum 20-case authorization-focused gate** when the recovered current contracts support execution:

16. `SAME_WORK_DIFFERENT_ACTION_REJECT`
17. `STALE_ROUTE_AFTER_DESCRIPTOR_CHANGE_REJECT`
18. `WORK_FROM_ROUTE_B_ACTION_FROM_ROUTE_A_REJECT`
19. `DESCRIPTOR_FROM_ROUTE_B_EVIDENCE_FROM_ROUTE_A_REJECT`
20. `MISSING_ACTION_GRANT_FAIL_CLOSED`

The existing session/admission evidence mismatch tests may be parameterized to cover additional swap combinations without weakening these named minimum cases.

## What research does not justify

- no adoption of OAuth tokens inside System Master solely because RFC 9700/9396 express the relevant resource/action binding principle;
- no generic zero-trust subsystem;
- no new policy engine owned by USER-EXPERIENCE;
- no reinterpretation of `protocolBindings`, semantic tags, UI labels or purpose text as authorization;
- no transfer of PLATFORM-006 authority into USER-EXPERIENCE;
- no PASS without the recovered exact dependency-current source and executable evidence.

## Closed research result

The external evidence **supports and sharpens** the existing repair rather than replacing it.

The key implementation law is now:

**An interaction may be recorded only when the enforcement boundary can prove that the current principal/session is presenting current owner-issued admission evidence for this exact work/resource, this exact descriptor/capability context and this exact action grant, with integrity against field swapping; ambiguity or staleness fails closed before persistence.**

## Next dependency-valid action

No additional broad authorization research is needed before implementation.

Resume at the parent readiness packet's exact gate:

`RECOVER EXACT SMR020 RUNNABLE PREDECESSOR -> RECOMPUTE 89066e56... -> VERIFY CURRENT PLATFORM-006 DESCRIPTOR ACTION-GRANT CONTRACT -> APPLY MINIMUM CONTEXT-BINDING + R025 DB-PARITY REPAIR WHEN AUTHORIZED -> RUN MINIMUM 20-CASE AUTHORIZATION-FOCUSED MICRO-GATE -> FULL PORTABLE CAMPAIGN.`
