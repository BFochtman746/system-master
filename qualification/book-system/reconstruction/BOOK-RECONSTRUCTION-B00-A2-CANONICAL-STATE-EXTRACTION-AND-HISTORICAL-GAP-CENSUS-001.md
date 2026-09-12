# BOOK-RECONSTRUCTION-B00-A2 — CANONICAL-STATE EXTRACTION + HISTORICAL GAP CENSUS 001

Status: **IN_PROGRESS / FORENSIC EVIDENCE / NOT B00-A CLOSURE / NOT B00-B ADMISSION / NO BUILD AUTHORIZATION**

Owner: **SYSTEM_MASTER/BOOK**  
Controlling method: `BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001`  
Observed live owner head immediately before this write: `book-system/control-v1@19c91d574a91158c7e5bb789fd83a96f21cd9f8a`  
Parent evidence map: `BOOK-RECONSTRUCTION-B00-A-PATH-EVIDENCE-MAP-001.md`

## 1. Purpose

Continue B00-A lossless archaeology. This unit does not advance to B00-B, does not design-lock a replacement runtime, and does not transfer any historical qualification result to reconstructed bytes.

The immediate questions are:

1. What reusable Book authority must eventually be extracted from the canonical-state qualifier?
2. Which B00 requirements depend on that extraction?
3. Does preserved historical Book/literary material already contain reusable rights/licensing/custody or copy-edit/style authority that should be recovered instead of reinvented?
4. What evidence is still missing before a design-lock or build decision is valid?

## 2. Recovered canonical-state authority surface

The current canonical state is represented by:

- `qualification/book-system/canonical-state-001/BOOK-SYSTEM-CANONICAL-BOOK-STATE-MODEL-001.json`
- `.github/scripts/book-system-canonical-state-001-qualify.js`

The model declares the Book parent as canonical store and describes Book identity, lifecycle, source/authority policy, selection policy, current pointers/defaults, research/author/proposal/export registries, derived-artifact references, reconciliation, last canonical event, and audit references. Its mutation protocol requires current-authority/state re-read, precondition checking, parent-only canonical write authority, exact schema validation, scoped mutation, history preservation, and auditability.

The qualifier contains executable product-like semantics that are not presently accepted as reusable Book runtime. Recovered behavior includes the equivalent of these surfaces:

- canonical state construction and schema/aggregate validation;
- canonical effect payload formation/application;
- state read and deterministic digesting;
- reconcile/current-state checking;
- exact state-version/digest mutation preconditions;
- actor-class / operation-scope enforcement;
- research/source registration;
- author-decision registration;
- integration-proposal registration;
- export-freeze/release registration;
- legal lifecycle transition checks.

This confirms the prior classification: **canonical parent Book state remains QUALIFIER-ONLY for material semantics**. The presence of a successful qualifier is not installation proof.

## 3. Mandatory extraction boundary — forensic requirements, not final design

A later design-lock must produce one reusable parent Book-state authority without turning specialized ledgers into competing canonical truth. The following boundary is therefore mandatory to resolve before BUILD:

| Concern | Current evidence | Required reusable boundary | Durable-state implication | Interface/contract implication | Qualification implication | Current blocker |
|---|---|---|---|---|---|---|
| Stable Book/project identity | qualifier model + downstream consumers | one canonical identity/state authority | canonical aggregate + immutable identity | read/validate current parent | identity stability, collision, restart | QUALIFIER-ONLY parent |
| Canonical pointers | qualifier active pointers + version runtime | one source of current pointer truth | versioned active pointers + history | get/current-pointer + guarded mutation | stale pointer/CAS/race tests | split authority risk |
| Canonical schema/envelope | model JSON + qualifier validation | reusable schema validation owned by Book parent | schema/version recorded with aggregate | validate/read/migrate contract | schema/version/migration denominator | reusable runtime absent |
| Mutation preconditions | qualifier + branch-built guards | parent CAS/precondition authority | expected version/digest/event lineage | compare-and-mutate contract | stale-write/replay/concurrency suite | duplicated guard semantics |
| Mutation history/audit | qualifier history rule + specialized ledgers | parent mutation-history contract, specialized projections remain projections | append-only parent history/audit refs | append/read/reconcile | tamper/restart/replay tests | truth boundary not adjudicated |
| Author decisions | qualifier registry + author-decision runtime | parent references current decision authority without duplicating decision truth | decision refs/currentness only where canonical | register/ref/currentness contract | stale/foreign/wrong-authority tests | parent/runtime seam unresolved |
| Integration proposals | qualifier registry + proposal runtime | parent records accepted proposal standing/reference only as adjudicated | immutable proposal/effect refs | register/apply-current proposal | stale/reclassified/duplicate tests | parent/runtime seam unresolved |
| Research/source refs | qualifier + workflow/proposal/recovery evidence | canonical references must preserve source identity/provenance without swallowing evidence store | stable source/evidence refs | register/revalidate source ref | missing/stale/reclassified tests | custody/rights authority incomplete |
| Export freeze/release | qualifier + export-freeze runtime | reusable parent release state bound to exact manuscript/version/evidence identity | release/freeze refs + current subject | freeze/register/revoke/currentness | stale subject/changed manuscript tests | parent runtime absent |
| Lifecycle | qualifier legal transitions + lifecycle runtime | one canonical project lifecycle state, specialized engine applies validated transitions | lifecycle state + transition history | propose/apply/reconcile transition | illegal/race/replay/restart tests | duplicate-state risk |

This table is a reconstruction constraint only. It does **not** select implementation shape, storage technology, or final API names.

## 4. B00 requirement trace impact

The parent extraction is directly or transitively required by at least these currently mapped B00 rows:

- `B00.001` stable Book/project identity;
- `B00.003` canonical object envelope/schema;
- `B00.004` current canonical revision/version pointer;
- `B00.005` Story Bible canonical structure;
- `B00.006` Book Plan canonical structure;
- `B00.007` manuscript canonical structure;
- `B00.008` research/source canonical structure;
- `B00.012` integration proposal parent registration/currentness;
- `B00.014` canonical mutation CAS/exact preconditions;
- `B00.018` project/unit lifecycle authority;
- `B00.021` mutation/audit/event history;
- `B00.026` concurrency/currentness across workflow + parent state;
- `B00.028` export/release canonical identity + freeze preconditions;
- `B00.029` publication/delivery authorization boundary;
- `B00.030` authority fences.

No row above is considered reconstructed merely because its qualifier or a specialized branch-built runtime exists. The required closure chain remains:

`requirement/invariant -> implementation -> durable state -> interface/contract -> tests -> evidence -> environment -> blocker`.

## 5. Historical rights/licensing/custody archaeology

### 5.1 Current Book runtime

Current reusable Book runtime provides **partial** rights/provenance enforcement, especially through integration-proposal source/provenance currentness and rights/privacy reclassification blocking, existing-book recovery source semantics, and workflow evidence/provenance identity. This is not evidence of one complete reusable rights/licensing/custody authority.

### 5.2 Preserved branch census

The following preserved lineages were inspected during this B00-A pass:

- `book-system/reconstruction-v1@0406abadcf903e828c278d6d0116b67606ef2215`, tree `dcbae81a1637ab21007042e30036c6ecf2048795`;
- `books-literary-prose-001@55fa713be0e9b704399bd75920d0186b406f8117`, tree `dc3b14f596aa3ec09de2e4a2622ff693df71a650`;
- `literary-prose-engine-001@e8b463f39c2951ed90dd1623327a4d8a0bbdf774`, tree `57ad42cf8c8056acd50aa50f90035f1c8fb41b43`.

Path-name searches in the inspected reconstruction tree did not expose a dedicated `rights`, `license`, or `style` runtime path. Repository/default-branch searches for rights/licensing/custody likewise produced no reusable Book authority hit in this pass. **These are bounded search results, not proof that no historical implementation exists.** Source-level/content-level recovery remains open.

Historical literary/prose state contains rights/clearance safeguards around similarity/publication concerns. Those artifacts are preserved as provenance/evidence of prior policy intent only. PROSE is retired; those records do not recreate a Prose owner lane and do not become current Book runtime authority by inheritance.

### 5.3 Adjudication

`B00.009` remains **OPEN / PARTIAL / NOT INSTALLED** for a complete rights/licensing/custody authority. Before design-lock, Book must either:

1. recover an existing reusable owner-valid implementation and rebind it, or
2. prove the historical/source census sufficiently complete to justify a new Book-owned contract.

No rights clearance, private-source permission, publication permission, or external custody fact is inferred here.

## 6. Historical copy-edit/style archaeology

The current `system-master/book-system` runtime directory does not expose a dedicated copy-edit profile or style-sheet authority. Generic version metadata is insufficient to prove the `B00.027` requirement.

The inspected preserved Book/literary trees did not yield a current reusable style/copy-edit runtime by path-name census in this pass. A guessed historical qualification path was not accepted as evidence because it could not be fetched at that exact location. Therefore no nonexistent or unverified artifact is cited as recovered.

`B00.027` remains **OPEN / DESIGNED-NOT-INSTALLED + PARTIAL GENERIC METADATA** until source-level historical content recovery either locates the prior authority or establishes the gap with stronger evidence.

## 7. Targeted research decision

No external/web research was invoked for this unit. The material uncertainty is currently repository-internal: owner authority, historical source custody, qualifier/runtime separation, and missing reusable surfaces. External research cannot resolve whether an already-built System Master implementation exists or whether historical PASS applies to exact current bytes. External research should begin only when the internal census exposes a design question that could materially change the Book contract.

## 8. Adjudication — what may and may not advance

### May advance now

- deeper source-level recovery for rights/licensing/custody;
- deeper source-level recovery for copy-edit/style metadata authority;
- canonical-state qualifier-to-runtime semantic extraction census;
- duplicate-truth analysis across parent state, version, lifecycle, admission, proposal, author-decision, workflow/evidence and export ledgers;
- draft test-denominator inventory for a future extracted parent state, provided it is not mislabeled as qualification.

### May not advance yet

- B00-B analysis as if B00-A were lossless;
- canonical-state BUILD;
- rights/custody BUILD;
- copy-edit/style BUILD;
- final design lock;
- B00 freeze/closure;
- any transfer of historical PASS to reconstructed bytes.

## 9. Current blocker ledger

| Blocker | Class | Why it blocks B00-A closure | Safe independent work |
|---|---|---|---|
| Canonical parent semantics embedded in qualifier | INTERNAL / QUALIFIER-ONLY | B00 lacks reusable parent authority | finish extraction/duplicate-truth census |
| Rights/licensing/custody authority incomplete | INTERNAL-HISTORICAL / SOURCE-RECOVERY | B00.009 cannot be losslessly classified as installed or absent | source-level branch/content recovery |
| Copy-edit/style authority unresolved | INTERNAL-HISTORICAL / SOURCE-RECOVERY | B00.027 cannot be losslessly classified | source-level branch/content recovery |
| Native PDF/DOCX/OCR fidelity | EXTERNAL/NATIVE | native mechanics cannot be claimed from normalized semantic recovery | freeze Book-owned provider contract only |
| Real author/private/publication authority | HUMAN/PRIVATE/EXTERNAL | cannot be synthesized | deterministic fences/tests/specification only |
| A-01 exact-subject evidence | A-01 | no current reconstructed subject has been qualified there | hosted/repository work may proceed without claiming A-01 |

## 10. B00-A standing

- B00 denominator remains **30 mapped requirements**.
- Requirement mapping is not equivalent to archaeology closure.
- Canonical state extraction surface: **RECOVERED ENOUGH TO CONFIRM MANDATORY EXTRACTION; NOT DESIGN-LOCKED**.
- Rights/licensing/custody: **OPEN**.
- Copy-edit/style: **OPEN**.
- Unaccounted archaeology: **greater than zero**.
- B00-A: **NOT CLOSED**.
- B00-B: **NOT ADMITTED**.

## 11. Exact dependency-valid successor

**`BOOK-RECONSTRUCTION-B00-A3 — RIGHTS/CUSTODY + COPY-EDIT/STYLE SOURCE-LEVEL CONTENT RECOVERY + CANONICAL-STATE DUPLICATE-TRUTH/PORT CENSUS`**

Required output of A3:

1. source-level historical evidence map for rights/licensing/custody and copy-edit/style, with exact paths/commits or explicit bounded-not-found results;
2. canonical-state semantic-by-semantic comparison against reusable version/lifecycle/admission/proposal/author/workflow/export runtimes;
3. identify which state is canonical, projection-only, ledger-only, or external reference;
4. draft the minimum parent-state ports/contracts needed to remove qualifier-only behavior without creating duplicate truth;
5. update the 30-row B00 map and prove whether B00-A has reached zero unaccounted archaeology.

Only if A3 (and any evidence-required continuation it discovers) reduces unaccounted archaeology to zero may B00-A be considered for closure and B00-B admission.

## 12. Evidence fences

This artifact claims no real author decision, private-source permission, rights clearance, native extraction fidelity, publication authorization, production installation, or A-01 PASS. Historical Prose/literary evidence remains immutable provenance only; all genuinely open integration remains BOOK-owned.
