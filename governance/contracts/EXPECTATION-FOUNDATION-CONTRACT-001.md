# EXPECTATION — Foundation Contract 001

**Capability** `C11`  
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`  

**Owner** `SYSTEM_MASTER/CORE` · **Lane** CORE · **Effective** 2026-09-15  
**Authority** `governance/CURRENT-AUTHORITY.json` → `CURRENT-AUTHORITY-005` / Topology 007  
**Engine** `RESPONSE-EXPECTATION-ENGINE-001`  
**Operation** `FOUNDATION-C11-RESPONSE-EXPECTATION-ENGINE-001`  
**Standing** IMPLEMENTED_ON_C11_BRANCH / EXACT_SUBJECT_QUALIFICATION_AND_EVIDENCE_REGISTRATION_PENDING

## Known from the census

- **Module name:** Response Expectation Engine
- **Interaction direction:** `CORE_CHAT_RESPONSE_POLICY_CAPABILITY`
- **Owner:** `SYSTEM_MASTER/CORE`
- **Foundation objective:** `FOUNDATION-1-0-CLOSURE-001`
- Historical census standing `EVIDENCE_REVIEW_REQUIRED__NAME_COLLISION` is resolved at the implementation-lineage level by this contract: the historical C11 capability is a language-neutral response-policy evaluator, not the governance expectation registry.
- `governance/EXPECTATION-REGISTRY-007.json` remains governance input describing product/work expectations. It is **not** C11 implementation evidence and no historical PASS is transferred from it.

## 1. Contract / interface

C11 exposes deterministic, language-neutral validation of rendered response text against an explicit response-expectation policy.

Named operations:

1. `evaluateResponseExpectations({ responseText, responseClass, policy })` — validates the exact response text against the selected class policy and returns an immutable PASS result only when every declared expectation is satisfied.
2. `assertResponseExpectations(input)` — assertion form of the same evaluator; returns `true` on PASS and throws a typed fail-closed error otherwise.
3. `responseExpectationPolicyDigest(policy)` — returns a deterministic SHA-256 digest of the normalized policy definition so callers can bind policy identity without depending on object key order.

A policy declares:

- response classes;
- ordered required headings per class;
- forbidden headings per class;
- required `Label:` entries within named sections; and
- allowed first-line values for headings common to every class.

C11 does **not** issue GitHub/A-01 authority, receipts, identity signatures, architecture authority, product-completion decisions, or native ChatGPT account configuration. It evaluates response expectations only.

C04 CHAT composes C11 rather than duplicating it: `development-response-governor.js` supplies the System Master development-response policy and maps generic C11 violations to the existing C04 error contract, while C04 retains exact-response receipt issuance, authority-context binding, and governed GitHub/A-01 admission semantics.

## 2. Ingress routes

1. **Direct policy-evaluation ingress** — a caller supplies exact UTF-8 response text, a response-class identifier, and an in-memory declarative policy to `evaluateResponseExpectations` or `assertResponseExpectations`.
2. **C04 adapter ingress** — `control-gateway/src/development-response-governor.js` supplies the versioned System Master development-response policy and exact rendered response text.
3. **Qualification ingress** — repository qualification invokes `.github/scripts/response-expectation-engine-qualify.js`, which exercises C11 directly and C04 through the adapter boundary.

Ingress is local and deterministic. C11 performs no network, account, filesystem, GitHub, A-01, or external-provider mutation.

## 3. Egress routes

1. On PASS, `evaluateResponseExpectations` returns an immutable object containing:
   - `status: PASS`;
   - `engine_id: RESPONSE-EXPECTATION-ENGINE-001`;
   - selected response class;
   - normalized policy digest; and
   - observed heading list.
2. `assertResponseExpectations` returns `true` on PASS.
3. On violation, C11 throws `ResponseExpectationEngineError` with a stable fail-closed error code and optional structured details.
4. C04 may translate C11 error codes into the pre-existing C04 `RESPONSE_*` error namespace; C11 itself does not emit or persist a C04 receipt.

No C11 result authorizes a side effect by itself.

## 4. Persistence and canonical writer

C11 introduces no durable runtime state and therefore no new canonical state writer.

The canonical implementation and acceptance sources are versioned Git repository objects under the admitted repository/PR writer path:

- `control-gateway/src/response-expectation-engine.js`
- `control-gateway/test/response-expectation-engine.test.js`
- `.github/scripts/response-expectation-engine-qualify.js`
- this Foundation contract.

Policies are caller-owned inputs. C11 normalizes them for validation/digesting but does not persist or mutate them.

Any claimed durable C11 evidence must be registered through the existing Foundation evidence path; C11 does not create a parallel evidence store.


Canonical semantic writer: `SYSTEM_MASTER/CORE` owns C11 response-expectation semantics; C11 itself is runtime-stateless.  
Physical persistence: admitted Git repository/evidence writers persist implementation and qualification records; C11 creates no independent durable state store.

## 5. Dependencies

Platform baseline: C11 depends on applicable Foundation requirements P00–P12 and P15 for repository authority, qualification, and evidence handling.

C11 runtime depends only on Node.js standard-library primitives used for deterministic SHA-256 hashing.

C04 depends on C11 for generic response-policy evaluation through:

- `control-gateway/src/response-expectation-engine.js` → generic mechanics;
- `control-gateway/src/development-response-governor.js` → C04-specific policy, error compatibility, receipt and authority binding.

Repository qualification depends on the existing canonical `verify.sh` auto-discovery of `.github/scripts/*qualify*.js|py` and Required Verification's non-vacuous test gate.

`governance/EXPECTATION-REGISTRY-007.json` is intentionally **not** a runtime dependency or implementation-evidence dependency for C11.

## 6. Failure semantics

Fail closed on malformed policy, invalid response class, or any unmet declared expectation. C11 is read-only and therefore does not consume a mutation `idempotency_key`; repeated identical inputs are deterministic and idempotent.

C11 is fail-closed.

- Empty/non-text response or malformed policy → `EXPECTATION_SCHEMA_INVALID`.
- Unknown response class → `EXPECTATION_CLASS_INVALID`.
- Missing or duplicate required heading → `EXPECTATION_REQUIRED_HEADING_INVALID`.
- Required heading out of order → `EXPECTATION_HEADING_ORDER_INVALID`.
- Forbidden peer heading present → `EXPECTATION_FORBIDDEN_HEADING`.
- Required section empty → `EXPECTATION_SECTION_EMPTY`.
- First section line outside its allowlist → `EXPECTATION_FIRST_LINE_INVALID`.
- Required labeled field missing or empty → `EXPECTATION_REQUIRED_LABEL_MISSING`.

Policy schema validation itself is fail-closed: duplicate declarations, empty class sets, labels bound to non-required sections, and cross-class allowlists attached to headings not required by every class are rejected.

Validation and policy digesting are deterministic and idempotent for identical exact inputs. C11 performs no retryable external action and therefore requires no mutation idempotency key.

## 7. Evidence target

Future evidence target (currently absent until Foundation qualification): `qualification/foundation/expectation-foundation-001.json`.

Required exact-subject repository evidence for C11 closure:

- exact Git commit containing `control-gateway/src/response-expectation-engine.js`;
- exact Git commit containing the adversarial C11 tests and C04 adapter integration;
- `.github/scripts/response-expectation-engine-qualify.js` PASS on that exact subject;
- existing `development-response-governor-qualify.js` PASS on that same subject, proving C04 compatibility;
- canonical `verify.sh` / Required Verification PASS with non-vacuous test discovery;
- current single-writer / lease / applicable A-01 control-plane gates required by repository policy.

Only immutable evidence tied to the exact qualified subject may be registered in `FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json`. A governance registry, historical census row, branch name, source-file presence, or prior C04 PASS is insufficient.

## 8. Acceptance target

Common specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js EXPECTATION`.  
Common implementation gate: `node .github/scripts/foundation-capability-acceptance.js EXPECTATION`.

From repository root, the direct C11 acceptance command is:

```bash
node .github/scripts/response-expectation-engine-qualify.js
```

The repository acceptance command is:

```bash
bash ./verify.sh
```

PASS requires:

- at least 21 C11 + C04 adapter tests discovered by the C11 qualifier;
- zero failed tests;
- positive cases for multiple response classes;
- deterministic policy digesting;
- negative cases for unknown class, missing/duplicate/out-of-order headings, empty sections, forbidden headings, invalid allowlist values, missing labels, and malformed policy;
- existing C04 development-response tests remaining green through the C11 adapter;
- canonical Required Verification remaining non-vacuous and green on the exact PR head.

Local or branch PASS alone does not close C11 in the Foundation matrix.

## 9. Authority boundary

Canonical owner boundary: `SYSTEM_MASTER/CORE`.

C11/CORE may define and implement reusable response-expectation validation mechanics and stable generic validation errors.

C11 may not decide:

- which product-specific response policy should govern a peer module;
- owner/topology changes;
- GitHub/A-01 execution authority;
- native ChatGPT Project/Skill installation;
- product/Foundation completion;
- credentials, private/native/external evidence, release, publication, or production authority.

A caller such as C04 owns its policy semantics and downstream authorization. C11 evaluates those semantics without inheriting the caller's authority.

## 10. Open gaps

- Exact-subject CI/Required Verification has not yet been captured for the C11 branch/PR head.
- Applicable single-writer, lease, and A-01 control-plane gates have not yet been captured for the final C11 PR head.
- `FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json` has not been updated with C11 exact-subject evidence.
- The Foundation closure matrix has not been regenerated from such evidence.
- C04's separate native ChatGPT Skill/Project binding remains pending and is not resolved by C11.
