# BOOK-RECONSTRUCTION-B02-A — SOURCE INTAKE & EXISTING-BOOK RECOVERY RECOVERY / INVENTORY 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Control ref: `book-system/control-v1`
Recovered-from live owner head before mutation: `f7a42615644457a94c4b2218d59c549054e09108`
Controlling blueprint: `qualification/book-system/reconstruction/BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001.md`
Controlling Book record: `qualification/book-system/BOOK-SYSTEM-CONTROL-RECORD-012.json`
Controlling Book state: `qualification/book-system/BOOK-SYSTEM-RECONCILED-STATE-042.json`
Standing: `B02-A_COMPLETE__UNACCOUNTED_REQUIREMENTS_0__B02-B_ANALYSIS_ADMITTED__NO_B02_DESIGN_OR_IMPLEMENTATION_AUTHORIZED`
Canonical effect: NONE

## Scope and authority

This artifact closes only the RECOVER + INVENTORY stage for B02 Source Intake & Existing-Book Recovery. B00 Foundation & Authority and B01 Execution Foundation remain frozen. No B00/B01 invariant was found contradicted by B02 archaeology, so neither domain is reopened.

Historical Prose/Literary material is provenance only. It does not recreate a Prose owner, route, repair lane, qualification lane, research lane, telemetry lane, scheduler obligation or open-seam workstream. The one current owner is `SYSTEM_MASTER/BOOK`.

No claim in this inventory synthesizes author decisions, legal rights, private-source permission, native fidelity, external-provider availability, literary quality, publication authority, production standing or A-01 standing.

Implementation truth classes are restricted to the reconstruction blueprint classes: `MAIN-INSTALLED`, `BOOK-BRANCH-BUILT`, `HISTORICAL-BOOK-CODE`, `QUALIFIER-ONLY`, `DESIGNED-NOT-INSTALLED`, `EXTERNAL-REQUIRED`.

## Executive finding

B02 does not start from zero. The authoritative Book branch contains a substantive semantic existing-book recovery engine at `system-master/book-system/existing-book-recovery.js`. It consumes already-normalized source projections and reconstructs source census, exact source/content digests, revision lineage, structure, metadata, citations, comments, TODOs, tracked changes, semantic candidates, ambiguity/confidence, author-decision preparation and a proposed recovered baseline. It is non-canonical by construction.

That engine is **BOOK-BRANCH-BUILT**, not `MAIN-INSTALLED`: the file is absent from `main`. It is also not currently exposed by `book-capability-routing-interface.js`; therefore B02 recovery is CODED but not proved INSTALLED or REACHABLE through the current Book capability router.

The native source front door is a real external boundary. Current recovery requires `normalized_projection`; current and preserved Book trees expose no native PDF parser, DOCX parser or OCR runtime. Historical Literary/Prose extraction contracts assume authorized source text already exists and govern downstream observations; they do not establish native file extraction. Native PDF/DOCX/OCR fidelity and availability therefore remain `EXTERNAL-REQUIRED`.

The canonical back door is split correctly but incomplete for B02. Frozen Book admission primitives exist on the Book branch, while the recovery-specific governed-admission integration exists as a contract/design only and is not installed as a recovery adapter. Exact per-unit digests for chapter/scene admission remain dependent on normalized/native provider evidence.

## Atomic lossless B02 trace ledger

| # | Atomic B02 requirement | Current / target owner | Truth class | Durable state | Interface / contract | Reachable runtime path | Test / evidence class | Exact blocker / finding |
|---|---|---|---|---|---|---|---|---|
| B02-01 | Intake request identity | BOOK | BOOK-BRANCH-BUILT | recovery request/session/project identity | `existing-book-recovery.js` request validator | Direct module only; not routed | historical synthetic qualifier only | No current routed intake command |
| B02-02 | Immutable source identity | BOOK | BOOK-BRANCH-BUILT | `source_id`, source ref | recovery source contract | Direct module only | historical synthetic | Not main-installed/routed |
| B02-03 | Exact source digest | BOOK | BOOK-BRANCH-BUILT | SHA-256 digest required | `source_digest` | Direct module only | historical synthetic | Digest must be supplied by intake/provider boundary |
| B02-04 | Exact recovered-content digest | BOOK + provider input | BOOK-BRANCH-BUILT | candidate `content_digest` | version-candidate input | Direct module only | historical synthetic | Provider must bind digest to extracted content |
| B02-05 | Original/raw bytes custody | external/shared storage under Book acceptance contract | EXTERNAL-REQUIRED | external immutable source object/locator | B00 custody/provenance boundary | No Book raw-byte store | native/external evidence required | Book durable workflow store intentionally does not become raw manuscript store |
| B02-06 | Source locator | BOOK acceptance + external provider | EXTERNAL-REQUIRED | stable external locator required | provider/intake boundary | No native current adapter | native/external | Native locator production not installed in Book |
| B02-07 | Rights/custody/provenance evidence | BOOK | BOOK-BRANCH-BUILT | evidence record/digest | `rights-custody-evidence-core.js` | Book-branch module | B00 frozen evidence; no B02 fresh qualification | Real legal permission remains external/human authority |
| B02-08 | Private-source permission/privacy | BOOK policy + external/human authority | EXTERNAL-REQUIRED | permission/evidence refs; no raw text in workflow state | B00 privacy/custody boundaries | Guards exist; permission source external | private/human evidence required | Permission cannot be synthesized |
| B02-09 | Source-currentness / stale-source rejection | BOOK | BOOK-BRANCH-BUILT | exact source/project/digest bindings | B00/B01 exact-subject guards + recovery key | module-level only | inherited B00/B01 + historical synthetic | Needs B02 cumulative qualification on eventual candidate |
| B02-10 | Native PDF extraction | external/native provider | EXTERNAL-REQUIRED | normalized projection + digest/locator | provider boundary; recovery accepts normalized projection | No current Book parser | native/provider evidence required | No current or preserved Book native PDF runtime found |
| B02-11 | Native DOCX extraction | external/native provider | EXTERNAL-REQUIRED | normalized projection + digest/locator | provider boundary | No current Book parser | native/provider evidence required | No current or preserved Book native DOCX runtime found |
| B02-12 | OCR for image/scanned sources | external/native provider | EXTERNAL-REQUIRED | normalized projection + confidence/evidence | provider boundary | No current Book OCR runtime | native/provider calibration required | OCR fidelity/availability unproved |
| B02-13 | Normalized source projection schema/acceptance | BOOK owns acceptance; provider supplies projection | BOOK-BRANCH-BUILT | `normalized_projection` consumed by recovery | `existing-book-recovery.js` | Direct module input only | historical synthetic | No current provider adapter/routed front door |
| B02-14 | Historical source-text extraction observations | historical Literary/Prose | HISTORICAL-BOOK-CODE | preserved historical extraction/calibration artifacts | historical extractor/provider contracts | Historical only | historical calibration/receipts | Provenance only; not current native intake authority |
| B02-15 | Source census | BOOK | BOOK-BRANCH-BUILT | normalized source set | recovery phase `SOURCE_CENSUS` | Direct module | historical synthetic | Not routed/currently qualified |
| B02-16 | Recovery session determinism | BOOK | BOOK-BRANCH-BUILT | deterministic recovery key/profile | recovery request normalization | Direct module | historical synthetic | Not routed/currently qualified |
| B02-17 | Book/project identity | BOOK | BOOK-BRANCH-BUILT | project/session anchor | recovery request contract | Direct module | historical synthetic | No current capability route |
| B02-18 | Existing edition re-entry | BOOK | BOOK-BRANCH-BUILT | `RECOVER_EXISTING` mode | recovery request contract | Direct module | historical synthetic | Canonical re-entry adapter not installed |
| B02-19 | New-edition lineage | BOOK | BOOK-BRANCH-BUILT | prior edition id + exact digest | `NEW_EDITION` + `prior_edition_ref` | Direct module | historical synthetic | Admission/rebind path not installed |
| B02-20 | Manuscript/version identity | BOOK | BOOK-BRANCH-BUILT | manuscript/version/candidate IDs | recovery version-candidate input | Direct module | historical synthetic | Final canonical admission pending |
| B02-21 | Revision parent graph | BOOK | BOOK-BRANCH-BUILT | parent candidate IDs + graph | `REVISION_GRAPH` phase | Direct module | historical synthetic | No fresh B02 qualification |
| B02-22 | Authoritative-version ambiguity | BOOK + AUTHOR | BOOK-BRANCH-BUILT | authority signals; ambiguous heads preserved | recovery graph/decision preparation | Direct module | historical synthetic + human required | Author choice cannot be synthesized |
| B02-23 | Exact duplicate detection | BOOK | BOOK-BRANCH-BUILT | digest identity | recovery graph/dedup logic | Direct module | historical synthetic | Needs fresh qualification |
| B02-24 | Near-duplicate/overlap handling | BOOK | BOOK-BRANCH-BUILT | similarity/overlap evidence | recovery candidate comparison | Direct module | historical synthetic | Empirical thresholds require calibration if changed/expanded |
| B02-25 | Manuscript variants | BOOK | BOOK-BRANCH-BUILT | multiple candidate nodes retained | revision graph | Direct module | historical synthetic | Canonical selection requires author/governed admission |
| B02-26 | Parts/front matter/chapters | BOOK | BOOK-BRANCH-BUILT | ordered structure items | normalized projection `structure` | Direct module | historical synthetic | Native extraction of boundaries external |
| B02-27 | Scenes/sections/units | BOOK | BOOK-BRANCH-BUILT | ordered structure items/anchors | normalized projection `structure` | Direct module | historical synthetic | Exact per-unit content digest not produced by Book recovery core |
| B02-28 | Stable order/anchors | BOOK + provider | BOOK-BRANCH-BUILT | ordinal/anchor/confidence | structure normalization | Direct module | historical synthetic | Provider fidelity remains external |
| B02-29 | Recovery confidence | BOOK + provider | BOOK-BRANCH-BUILT | structure confidence/ambiguity | normalized projection + recovery output | Direct module | synthetic mechanics only | Real extraction confidence needs provider calibration |
| B02-30 | Boundary ambiguity blockers | BOOK | BOOK-BRANCH-BUILT | ambiguous flags/blockers | recovery structure semantics | Direct module | historical synthetic | Must remain fail-closed at admission |
| B02-31 | Metadata preservation/conflicts | BOOK | BOOK-BRANCH-BUILT | metadata copied into recovery candidate | normalized projection | Direct module | historical synthetic | Conflict adjudication belongs B02-B analysis/design |
| B02-32 | Citations/reference preservation | BOOK | BOOK-BRANCH-BUILT | citation arrays + source evidence refs | normalized projection | Direct module | historical synthetic | Native citation fidelity external |
| B02-33 | Comments/editor queries | BOOK | BOOK-BRANCH-BUILT | comments array retained | normalized projection | Direct module | historical synthetic | Native comment extraction external |
| B02-34 | TODO/TBD/open/missing-citation signals | BOOK | BOOK-BRANCH-BUILT | TODO array retained | normalized projection | Direct module | historical synthetic | Native extraction/classification fidelity external/model-calibration as applicable |
| B02-35 | Tracked changes | BOOK | BOOK-BRANCH-BUILT | tracked-change array retained | normalized projection | Direct module | historical synthetic | DOCX/native fidelity external |
| B02-36 | Semantic extraction inputs/candidates | BOOK | BOOK-BRANCH-BUILT | story-bible/nonfiction/voice candidates are proposals | recovery semantic candidate interface | Direct module | historical synthetic; historical Prose calibration provenance | No candidate becomes canonical automatically |
| B02-37 | Author decision preparation | BOOK + AUTHOR | BOOK-BRANCH-BUILT | proposal/evidence batches | recovery `AUTHOR_DECISION_PREPARATION` | Direct module | mechanics synthetic; human evidence required | Author decision external/human |
| B02-38 | Recovered baseline assembly | BOOK | BOOK-BRANCH-BUILT | `PROPOSED_RECOVERED_BASELINE__AWAITING_GOVERNED_ADMISSION` | recovery baseline output | Direct module | historical synthetic | Intentionally non-canonical |
| B02-39 | Recovery-specific canonical admission | BOOK | DESIGNED-NOT-INSTALLED | governed admission proposal contract | `BOOK-SYSTEM-EXISTING-BOOK-RECOVERY-GOVERNED-ADMISSION-INTEGRATION-002-CONTRACT.json` | No recovery-specific runtime adapter | design + historical qualification provenance only | Adapter/runtime not installed; explicit author ratification required |
| B02-40 | Generic manuscript/chapter/scene canonical admission guard | BOOK | BOOK-BRANCH-BUILT | immutable admission candidates/current-subject guards | `content-object-admission-core.js` | Book-branch runtime primitive | B00 frozen qualification lineage | Not main-installed; B02-specific binding still absent |
| B02-41 | Lifecycle rejoin/rebind after recovery | BOOK | DESIGNED-NOT-INSTALLED | proposed re-entry/admission semantics | recovery admission contract + B00/B01 boundaries | No end-to-end routed recovery path | design/inherited evidence | Must be analyzed before design/build |
| B02-42 | Durable recovery coordination state | BOOK | BOOK-BRANCH-BUILT | checkpoint/evidence coordination state | recovery checkpoint semantics + `book-workflow-durable-store.js` | Module-level substrate | B01 frozen + historical recovery synthetic | Physical durability/backup/PITR/DR remain external |
| B02-43 | Checkpoint/resume/idempotent replay | BOOK | BOOK-BRANCH-BUILT | recovery key/checkpoint identity | recovery engine | Direct module | historical synthetic | No current routed execution evidence |
| B02-44 | Error/fail-closed semantics | BOOK | BOOK-BRANCH-BUILT | explicit recovery errors + validation fences | recovery engine | Direct module | historical synthetic | Needs fresh B02 qualification |
| B02-45 | Exact per-unit digests for chapter/scene admission | BOOK acceptance + external provider | EXTERNAL-REQUIRED | per-unit exact digest evidence | recovery admission design | Not installed end-to-end | native/provider + B02 qualification required | Current recovery structure carries anchors/confidence, not authoritative native per-unit bytes/digests |
| B02-46 | Capability routing/reachability | BOOK | DESIGNED-NOT-INSTALLED | current router has no B02 recovery capability binding | `book-capability-routing-interface.js` | No routed path | no B02 current execution evidence | CODED recovery core is not REACHABLE through Book capability router |
| B02-47 | Main integration standing | SYSTEM MASTER integration authority | EXTERNAL-REQUIRED | main branch installation | main | absent | no exact-main B02 evidence | B02 code and inherited reconstructed guards are not `MAIN-INSTALLED` |
| B02-48 | Native/provider availability/fidelity | external provider/native environment | EXTERNAL-REQUIRED | provider-specific | provider contracts | unavailable/unproved here | NATIVE/EXTERNAL | Cannot synthesize provider availability or fidelity |
| B02-49 | Production/device/A-01 standing | external qualification authority | EXTERNAL-REQUIRED | environment-specific | qualification boundary | not established | NATIVE/EXTERNAL/A-01 | No standing synthesized |
| B02-50 | Publication authority from recovered content | BOOK/AUTHOR/publication authority | EXTERNAL-REQUIRED | publication decision/evidence | later B11 lifecycle | no B02 path | HUMAN/PUBLICATION | Recovery does not authorize publication |

## Duplicate-truth and historical-provenance findings

1. The current Book recovery engine is the only discovered current reusable semantic recovery implementation. No second current Book semantic recovery owner is admitted.
2. Historical Literary/Prose extraction/evaluation artifacts overlap in concepts such as source digest, confidence, abstention and candidate observations. They remain provenance/calibration evidence and do not become a current Prose execution domain.
3. Historical provider contracts do not prove a native PDF/DOCX/OCR front door. They assume source text or normalized observations are already available.
4. Historical recovery PASS receipts are exact-subject historical evidence only. They do not qualify the reconstructed B02 candidate.
5. Generic B00/B01 admission, provenance, durability and exact-subject safeguards are reusable dependencies; B02 must bind to them rather than fork duplicate Book authority.

## Installed / reachable / tested truth

### DESIGNED
- Recovery-specific governed admission and re-entry semantics exist as preserved contracts.
- Provider boundaries are explicit.

### CODED
- Semantic existing-book recovery is real executable code on `book-system/control-v1`.
- B00/B01 rights/custody, admission, provenance and durable coordination primitives are real executable code on the Book branch.

### INSTALLED
- No B02 capability is proven `MAIN-INSTALLED` by this inventory.
- Key inherited reconstructed B00/B01 runtime files checked here are also absent from `main`; their frozen reconstruction standing is not converted into an upward-integration claim.

### REACHABLE
- Recovery is directly importable as a module on the Book branch but is not exposed through the current Book capability router.
- No native PDF/DOCX/OCR front door and no recovery-specific canonical-admission adapter are currently reachable end-to-end.

### TESTED
- Historical synthetic recovery qualification/fixtures exist and are useful provenance.
- B00/B01 have their own frozen exact-subject qualification history.
- No fresh B02 isolated or B00-B02 cumulative qualification has been run because B02 has not reached qualification stage.

### QUALIFIED / CALIBRATED
- B02 is **NOT QUALIFIED** and **NOT CALIBRATED**.
- Historical PASS does not transfer.
- Native extraction, private source handling, real-book recovery quality, human/author ratification, provider fidelity, publication and A-01 remain unproved where applicable.

## B00/B01 invariant check

B02 archaeology found no contradiction requiring B00 or B01 to reopen. The following frozen invariants remain required:

- canonical Book mutation stays behind governed Book admission;
- proposal/recovery/provider state is not canonical state;
- exact source/current-subject identity must fail closed on staleness;
- immutable history and prior editions are preserved;
- no provider or historical Prose component gains Book canonical authority;
- raw/private manuscript content is not silently moved into coordination-state storage;
- author decisions and publication authority are never synthesized.

## B02-A closure accounting

Atomic requirements enumerated: **50**

Unaccounted B02 requirements: **0**

All discovered current and historical B02 behaviors are classified by current/target owner, implementation truth class, durable state, interface/contract, reachable runtime path, evidence class and blocker.

B02-A is therefore complete as RECOVER + INVENTORY. This does **not** mean the capability is installed, reachable, tested end-to-end, qualified or ready for production.

## Exact dependency-valid successor

The reconstruction blueprint requires ANALYZE after RECOVER + INVENTORY. The dependency-valid successor is:

`BOOK-RECONSTRUCTION-B02-B — SOURCE INTAKE & EXISTING-BOOK RECOVERY ANALYSIS / ADJUDICATION`

B02-B must analyze, without implementation:

1. the native/source-provider acceptance boundary and the minimum lossless normalized projection contract;
2. whether the current recovery engine is KEEP-AS-IS or KEEP-BUT-REFACTOR;
3. how recovery becomes a Book-owned routed capability without duplicating B01 routing/execution authority;
4. how the designed recovery-specific admission adapter binds to frozen B00 admission without widening canonical authority;
5. exact per-unit digest/locator requirements for chapter/scene recovery admission;
6. duplicate historical Prose/Literary concepts that must be migrated, merged or retained only as provenance;
7. evidence classes required for synthetic mechanics, provider/native fidelity, real-book recovery, author decisions and cumulative B00-B02 qualification; and
8. the KEEP-AS-IS / KEEP-BUT-REFACTOR / MIGRATE-INTO-BOOK / MERGE / REPLACE / BUILD / DELEGATE / REMOVE disposition for every B02 ledger item.

No B02 design or implementation is authorized by this inventory closure. Before any successor mutation, live Book owner head and shared governance head bindings must be re-read and reconciled if changed.
