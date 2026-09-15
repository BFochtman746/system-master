# BOOK-RECONSTRUCTION-B04-D3 — QUALIFIED CLOSURE RECEIPT 001

Date: 2026-09-15
Owner: SYSTEM_MASTER/BOOK
Predecessor: `BOOK-RECONSTRUCTION-B04-D2-CLOSURE-RECEIPT-001`
Predecessor branch/head: `book-system/b04-d2-reader-understanding-v1@3f015b84526c04682abe4a9fcf64a0410c6713b8`
Design authority: `BOOK-RECONSTRUCTION-B04-C-DESIGN-LOCK-001`
Subject branch: `book-system/b04-d3-reader-currentness-runtime-v1`
Qualified executable subject SHA: `9bccc508649d6fce17f8c483f031c6d179e1fc37`
Authoritative Book control remains outside this receipt and is not moved by it.
Standing: `IMPLEMENTED_QUALIFIED__READY_FOR_GOVERNED_ADMISSION__NONCANONICAL`
Canonical effect: NONE

## D3 delivered scope

B04-D3 implements the invalidation/currentness and read-only runtime reachability layer selected by B04-C:

1. `ComputeReaderUnderstandingInvalidationV1` as a deterministic Book-internal operation;
2. exact currentness checks for Story Bible ref/digest;
3. exact currentness checks for B03 knowledge candidate ID/digest;
4. exact scope kind/ref/digest currentness;
5. exact reveal-frontier anchor/ordinal/digest currentness;
6. exact sealed observation ID/digest currentness;
7. exact provider-subject/admission/digest currentness;
8. exact calibration ref/digest/class currentness;
9. composition with the existing B03 invalidation impact contract without mutating B03;
10. content-addressed `BookReaderUnderstandingCurrentnessV1` receipts;
11. separate `exposure_current` and `understanding_current` standing;
12. exact `recompute_exposure_required` and `recompute_understanding_required` flags;
13. stale dependency kind/reason evidence;
14. exact replay/idempotency for unchanged semantic input;
15. runtime reachability for all five locked B04 read-only queries;
16. a hardened dimension/lens query facade that revalidates the complete sealed observation set before returning evidence;
17. content-addressed `BookReaderRuntimeV1` reachability evidence;
18. no B01 provider-registry widening;
19. `canonical_effect=false` throughout.

No D3 operation mutates Story Bible truth, canonical Book state, author decisions, provider registry authority, revision state, lifecycle, export or publication state.

## Layered currentness law

D3 preserves two distinct currentness layers.

### Exposure-affecting dependencies

A change to any of the following makes both the exposure projection and understanding projection stale:

- Story Bible binding;
- B03 knowledge binding;
- scope binding;
- reveal frontier binding;
- an exact B03 invalidation impact bound to the projection's B03 parent.

Result:

- `exposure_current=false`;
- `understanding_current=false`;
- `recompute_exposure_required=true`;
- `recompute_understanding_required=true`.

### Understanding-only dependencies

A change to any of the following makes the understanding projection stale without unnecessarily discarding an otherwise-current exposure projection:

- sealed observation identity/digest/currentness;
- provider admission identity/digest/currentness;
- calibration ref/digest/class/currentness.

Result:

- `exposure_current=true` when its own dependencies remain exact/current;
- `understanding_current=false`;
- `recompute_exposure_required=false`;
- `recompute_understanding_required=true`.

This layered rule prevents reader-evidence changes from forcing an unnecessary reveal/exposure rebuild while still preventing stale reader understanding from being returned as current.

## Locked query/runtime surface

The exact B04 read-only query surface is runtime-reachable:

1. `GetReaderExposureProjectionV1`
2. `GetReaderUnderstandingProjectionV1`
3. `GetReaderDimensionEvidenceV1`
4. `GetReaderLensCoverageV1`
5. `GetReaderUnderstandingCurrentnessV1`

Runtime command surface added by D3:

1. `ComputeReaderUnderstandingInvalidationV1`

The D3 runtime publishes no canonical-write operation and does not add a B01 provider capability.

Currentness laws at query time:

- stale exposure may not be returned as current;
- stale understanding may not be returned as current;
- a still-current exposure may remain queryable when only understanding evidence is stale;
- the currentness query remains available while stale so the caller can determine the exact recomputation boundary.

## Query substitution hardening

Before hosted qualification, design review identified that a standalone dimension/lens query must not trust a caller merely because supplied observation ID/digest fields look like the projection's recorded references.

The hardened query facade therefore:

1. revalidates every sealed `BookReaderObservationV1` against the exact exposure projection;
2. rejects duplicate observation IDs;
3. deterministically rebuilds the D2 understanding projection from the supplied sealed observations;
4. requires the rebuilt understanding ID/digest to equal the exact queried projection;
5. only then returns dimension/lens evidence.

Adversarial qualification proves that altered evidence metadata or altered standing behind unchanged caller-supplied ID/digest strings is rejected.

## B03 invalidation composition

D3 consumes the existing B03 `BOOK_KNOWLEDGE_INVALIDATION_IMPACT_V1` result as evidence. It does not create a competing B03 invalidation engine.

A supplied B03 impact must:

- pass the existing B03 invalidation validator;
- bind the same Story Bible ref/digest;
- bind the same B03 knowledge candidate ID/digest.

A valid changed B03 impact marks the B04 exposure/understanding projection stale. An impact bound to another Story Bible/knowledge parent is rejected. Historical B03 knowledge remains immutable.

## Hosted qualification evidence

Exact-head B04-D3 qualification:

- GitHub Actions run: `34980569927`
- job: `104419492174`
- exact checked-out SHA: `9bccc508649d6fce17f8c483f031c6d179e1fc37`
- Node: `v22.23.2`
- result: PASS

Explicit denominators executed:

- B03 knowledge schema baseline K01-K32: `32/32 PASS`
- B03 invalidation baseline I01-I16: `16/16 PASS`
- B03 cumulative integration E01-E08: `8/8 PASS`
- inherited B04-D1 registry/exposure tests: `11/11 PASS`
- inherited B04-D2 core + sealed-binding hardening: `30/30 PASS`
- B04-D3 currentness/query/runtime + query substitution hardening: `43/43 PASS`
- combined explicit cases in this qualification lane: `140/140 PASS`
- failures: `0`
- skipped: `0`
- cancelled: `0`
- runtime import smoke: PASS

Repository control-plane evidence on the same exact executable head:

- A-01 Control Plane Enforcement run: `34980569972`
- exact SHA: `9bccc508649d6fce17f8c483f031c6d179e1fc37`
- result: PASS

Historical PASS transfer: `0`.

The B03 I01-I16 cases are inherited B03 invalidation evidence executed fresh on the D3 subject. They are not counted as completion of the future B04-E I01-I16 denominator merely because the labels are similar.

## External evidence fences intentionally remain open

D3 does not convert any of these to PASS:

- `MODEL_READER_SIMULATION_CALIBRATION_REQUIRED`
- `HUMAN_READER_ALIGNMENT_REQUIRED`
- `REAL_BOOK_LONG_FORM_CALIBRATION_REQUIRED`
- `PROVIDER_SUBJECT_ADMISSION_REQUIRED`

Synthetic fixtures prove deterministic currentness/query/runtime mechanics only. They do not prove human-reader accuracy, model-reader calibration, production provider admission, literary quality, author approval, publication readiness or production standing.

## B04-E denominator accounting

The B04-C isolated denominator remains exactly 128 cases for B04-E:

- E01-E32: exposure/frontier/source/B03 binding/currentness/privacy;
- D01-D32: exact dimension registry/grouping/sparse applicability/non-scalar law;
- P01-P24: perspective/observation target/standing/calibration/evidence law;
- U01-U24: understanding assembly/sparse applicability/projection standing/cross-boundary adversarial law;
- I01-I16: invalidation/currentness/idempotency/query/content-addressing.

D1, D2 and D3 focused qualification cases are implementation-gate evidence only. They do not shrink, replace, renumber or claim completion of the locked B04-E 128-case denominator.

## Admission boundary

This receipt is evidence for governed admission only. It does not merge PR #160, does not move `book-system/control-v1`, and does not authorize a direct control-ref update outside the Book control gateway.

## Exact successor

`BOOK-RECONSTRUCTION-B04-E — 128-CASE ISOLATED + B00-B04 CUMULATIVE QUALIFICATION / CALIBRATION`