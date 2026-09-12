# BOOK-RECONSTRUCTION-B01-A2 — CONTEXT COMPILER + CAPABILITY OWNERSHIP RECOVERY 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Parent recovery checkpoint: `BOOK-RECONSTRUCTION-B01-A-EXECUTION-FOUNDATION-RECOVERY-INVENTORY-001`
Parent live head: `01afda98d11e9a0a503bbb4756c94d99dd84d877`
Standing: `RECOVERY_COMPLETE_FOR_CONTEXT_COMPILER__CAPABILITY_IDENTITY_COLLISION_CONFIRMED__B01-A_NOT_YET_FROZEN`
Canonical effect: NONE

## 1. Exact historical Context Compiler recovery

The historical Context Compiler is recovered as exact immutable evidence rather than rewritten from memory.

Qualified historical subject:

- commit: `6a488b45497c3a60fb3a23bab640a6a7ca372246`
- runtime path: `system-master/book-system/context-compiler/book-context-compiler.js`
- runtime blob: `8b71624cd555e834fb6572cb659ad3d50a1ade2c`
- package schema path: `system-master/book-system/context-compiler/book-context-package.schema.json`
- schema blob: `725f3a16990f096c6fd99fe9e27d026445839efa`
- portable qualifier path: `.github/scripts/book-context-compiler-context-package-001-qualify.js`
- qualifier blob: `0a903198ea4baff3ceaa3b8b82da1546ef15fb14`
- hosted workflow: `.github/workflows/book-context-compiler-portable-qualification.yml`
- hosted run: `34564007172`
- hosted job: `103152279773`
- historical bounded result: `44/44` on exact subject `6a488b45497c3a60fb3a23bab640a6a7ca372246`
- evidence class now: `PROVENANCE_ONLY__NO_PASS_TRANSFER`

Recovered semantic behavior is Book-owned and remains suitable substrate for reconstruction:

- deterministic context digesting and durable envelope construction;
- exact source manuscript, Book-state, Story-Bible and service-registry bindings;
- separate GENERATION / EVALUATION / ADMISSION context classes;
- unresolved author decisions fail `AUTHOR_DECISION_REQUIRED`;
- hard constraint conflicts fail closed rather than guessing priority;
- raw manuscript/candidate, private blind labels, author secrets, chain-of-thought, canonical mutation commands, publication credentials and production credentials are excluded from durable context;
- evaluator generation-context reuse is forbidden;
- expired context handles fail closed;
- Documents cannot own completed-Prose integration;
- active historical Prose authority domains are rejected;
- even ADMISSION_CONTEXT has zero canonical effect until existing Book admission authority acts.

The live reconstructed owner tree does not contain the recovered `context-compiler/` runtime path, so this is a confirmed reusable-runtime custody/rebind gap rather than a reason to design a replacement.

## 2. Current capability identity collision

The current Registry v2 remains top-level Book-owned but embeds pre-retirement provider ownership taxonomy that conflicts with current authority if interpreted as active execution ownership.

### 2.1 Registry v2 preserved semantics

Reusable without ownership widening:

- strict request/response schema v2 envelopes;
- exact parent/source/artifact/provider identities;
- all provider canonical/lifecycle/export-freeze/publication authority false;
- provider outputs enter Book only as evidence/artifact/proposal/author-decision requests;
- idempotent replay versus non-idempotent reconcile-before-new-attempt;
- technical artifact state never implies publication authorization;
- external provenance remains evidence-only.

### 2.2 Registry v2 stale active-owner labels

The following are current architecture debt, not dispatch authority:

- service family `PROSE_ANALYSIS_AND_REVISION`;
- provider class `PROSE_SYSTEM`;
- canonical owner `SYSTEM_MASTER/BOOK/PROSE`;
- service family `BOOK_EVALUATION` canonical owner `SYSTEM_MASTER/BOOK/PROSE` and historical classification as a Prose-owned capability/qualification lane;
- `provider_classes` still includes `PROSE_SYSTEM`.

Current authority says PROSE is complete and terminally retired with no active owner/lane. Therefore these identifiers may remain immutable historical/provider provenance only, or be consumed behind a Book-owned adapter boundary, but cannot themselves grant current dispatch ownership.

### 2.3 Current runtime references that depend on the stale identifiers

The following current reachable runtime paths are coupled to old identity:

1. `system-master/book-system/book-capability-routing-interface.js`
   - resolves `PROSE.*` capabilities and old owner paths from `BOOK-WORKFLOW-ORCHESTRATOR-CAPABILITY-ROUTING-INTERFACE-001.json`.
2. `system-master/book-system/book-workflow-concurrency-rules.js`
   - hard-codes `PROSE.GENERATE_REVISION_CANDIDATE` as the serial non-idempotent generation capability.
3. `system-master/book-system/book-workflow-retry-idempotency-rules.js`
   - hard-codes the same capability as the non-idempotent special case and pins Registry v2 historical exact content/subject.
4. `system-master/book-system/book-workflow-book-admission-handoff.js`
   - requires candidate provenance from `PROSE.GENERATE_REVISION_CANDIDATE` in `LITERARY_CANDIDATE_GENERATION`.
5. `system-master/book-system/book-workflow-scheduler-runtime.js`
   - deliberately withholds `/PROSE`, `PROSE.*`, `PROSE_ANALYSIS_AND_REVISION`, and `BOOK_EVALUATION` from execution. This is correct under retirement authority, but proves the current execution chain cannot simply dispatch the old identities.
6. workflow failure/evidence/cancellation modules
   - their provider-operation validation transitively uses current routing/retry and therefore inherits the same identity collision even where their own algorithms are otherwise reusable.

## 3. Adjudication boundary for B01-A

This recovery does **not** rename provider implementations, invent a replacement provider, fabricate external service standing, or create a Prose lane.

The lossless reconstruction distinction is:

- **historical provider provenance identity** may remain `PROSE_*` where needed to identify exact completed historical capability/evidence;
- **current execution ownership / routing identity** must be BOOK-owned under `SYSTEM_MASTER/BOOK`;
- a Book-owned adapter/context/compiler/router/orchestrator may consume preserved historical provider capability, but the adapter is the current execution owner and the historical provider identity is evidence/implementation provenance, not a topology lane;
- no adapter may gain Book canonical write, author-decision, publication, private-data, native-platform, external-provider or A-01 authority by rebinding labels.

This is consistent with the recovered historical Context Compiler itself, whose tested capability request used Book-owned authority/integration fields and explicitly rejected `SYSTEM_MASTER/BOOK/PROSE` as an active authority domain.

## 4. Exact evidence standing

Historical Context Compiler qualification proves only the exact historical subject and synthetic/nonblind cases stated in that receipt. It does not qualify the reconstructed B01 subject and does not prove fresh blind execution, private manuscript access, author authority, A-01, native platform, publication, production, or external-provider standing.

Current orchestrator closure contracts under `qualification/book-system/book-prose-integration/orchestrator/` remain useful requirement/provenance evidence, including authority, routing, workflow-state, dependency-plan, concurrency, retry, failure, cancellation/resume, evidence/provenance and admission-handoff contracts. Their old ownership/capability labels are not current dispatch authority and their historical closure status transfers no PASS to changed B01 bytes.

## 5. Remaining lossless B01-A work

B01-A is still not frozen because the exact retired-identity dependency surface has not yet been reduced to a zero-unaccounted ledger. Remaining work is bounded to current execution-foundation references and their exact contracts/tests/qualification evidence; it is no longer an open-ended scheduler backlog.

Exactly one dependency-valid successor is bound:

`BOOK-RECONSTRUCTION-B01-A3 — RETIRED-IDENTITY DEPENDENCY LEDGER + REBIND REQUIREMENT CENSUS`

Required output:

1. enumerate every current B01 execution-foundation source/contract/test that references retired Prose execution ownership or capability IDs;
2. classify each reference as immutable provenance, provider implementation identity, Book-owned integration interface requiring rebind, or invalid residue;
3. derive the zero-loss requirement set that any Book-owned rebind must preserve (operation semantics, idempotency, evidence, concurrency, context isolation, admission and canonical-authority fences);
4. enumerate exact current test/closure paths protecting each requirement and mark historical evidence `NO_PASS_TRANSFER`;
5. finish with `unaccounted B01-A rebind requirements = 0` before admitting B01-B analysis.

No implementation, capability renaming, provider substitution or qualification claim is authorized by this recovery checkpoint.
