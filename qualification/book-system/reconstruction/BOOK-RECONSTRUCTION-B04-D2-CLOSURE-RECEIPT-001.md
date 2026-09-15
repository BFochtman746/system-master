# BOOK-RECONSTRUCTION-B04-D2 — QUALIFIED CLOSURE RECEIPT 001

Date: 2026-09-15
Owner: SYSTEM_MASTER/BOOK
Predecessor: `BOOK-RECONSTRUCTION-B04-D1-CLOSURE-RECEIPT-001`
Predecessor branch/head: `book-system/b04-d1-reader-exposure-v1@29fb53caf120cefd924bc254526af94cfa57d354`
Design authority: `BOOK-RECONSTRUCTION-B04-C-DESIGN-LOCK-001`
Subject branch: `book-system/b04-d2-reader-understanding-v1`
Qualified executable subject SHA: `36365f60ea32fb8ce9e82a399046c41b57b1eabf`
Authoritative Book control remains outside this receipt and is not moved by it.
Standing: `IMPLEMENTED_QUALIFIED__READY_FOR_GOVERNED_ADMISSION__NONCANONICAL`
Canonical effect: NONE

## D2 delivered scope

B04-D2 implements the observation-acceptance and reader-understanding assembly layer selected by B04-C:

1. `BookReaderObservationV1` acceptance, validation and immutable content-addressed sealing;
2. exact binding to one current `BookReaderExposureProjectionV1` ID/digest and exact reveal frontier;
3. exactly one observation target: one immutable PCE013 dimension ID or one current `ReaderPerspectiveLensV1` ID;
4. source classes `DETERMINISTIC | MODEL | SYNTHETIC_READER | HUMAN`;
5. standings `OBSERVED_UNCALIBRATED | OBSERVED_CALIBRATED | ABSTAINED | NOT_APPLICABLE`;
6. exact provider-subject/admission reference plus provider-admission digest binding for provider-executed MODEL/SYNTHETIC evidence;
7. exact calibration reference/digest/class binding for calibrated evidence;
8. explicit rejection of MODEL/SYNTHETIC -> HUMAN standing synthesis;
9. explicit rejection of provider standing on HUMAN observations;
10. opaque governed reader-profile requirement for SYNTHETIC_READER/HUMAN where applicable;
11. no raw manuscript text, quoted/full text, credentials, secrets, chain-of-thought or hidden-reasoning payloads;
12. no demographic-essentialist payload fields;
13. no universal reader score/rating/rank/aggregate field;
14. `BookReaderUnderstandingProjectionV1` deterministic assembly;
15. all 64 dimension dispositions always emitted exactly once as `OBSERVED | ABSTAINED | NOT_APPLICABLE | UNOBSERVED`;
16. all 12 current lens coverage entries always emitted exactly once;
17. sparse evidence preserved rather than converted into success;
18. exact observation refs/digests, provider refs/admission refs/digests and calibration refs/digests bound into the projection;
19. deterministic content-addressed understanding projection identity;
20. `canonical_effect=false` throughout.

No D2 operation mutates Story Bible truth, Book canonical state, provider registry authority, author decisions, revision state, export state or publication state.

## Sealed-observation hardening

The first hosted D2 pass was green, but a further design review identified that a content-addressed observation should not be considered sufficient merely because its digest is internally consistent.

The sealed observation was therefore hardened to preserve the accepted authority evidence used to establish standing:

- `provider_admission_digest`;
- `calibration_digest`;
- `calibration_class`.

Assembly revalidates those sealed standing boundaries rather than trusting a caller-supplied label.

Adversarial cases prove that:

- a forged sealed HUMAN observation cannot acquire provider standing;
- a forged sealed MODEL observation cannot acquire HUMAN calibration standing;
- accepted provider-admission and calibration digests survive sealing and are bound into the understanding projection.

## Hosted qualification evidence

Exact-head B04-D2 qualification:

- GitHub Actions run: `34974244722`
- job: `104397836341`
- exact checked-out SHA: `36365f60ea32fb8ce9e82a399046c41b57b1eabf`
- Node: `v22.23.2`
- result: PASS

Explicit denominators executed:

- B03 knowledge schema baseline K01-K32: `32/32 PASS`
- B03 cumulative integration E01-E08: `8/8 PASS`
- inherited B04-D1 registry/exposure tests: `11/11 PASS`
- B04-D2 core + sealed-binding hardening: `30/30 PASS`
- combined explicit cases in this qualification lane: `81/81 PASS`
- failures: `0`
- skipped: `0`
- cancelled: `0`
- runtime import smoke: PASS

Repository control-plane evidence on the same exact head:

- A-01 Control Plane Enforcement run: `34974222645`
- result: PASS

Historical PASS transfer: `0`.
Synthetic fixtures prove deterministic mechanics only; they are not evidence of human-reader accuracy, literary quality, author approval, publication readiness or production standing.

## Standing / sparse-observation laws preserved

- Missing observation evidence remains `UNOBSERVED`.
- Explicit abstention remains `ABSTAINED`.
- Explicit inapplicability remains `NOT_APPLICABLE`.
- Neither abstention nor inapplicability is converted to failure or PASS.
- A partial 64-dimension observation set yields `PARTIALLY_OBSERVED`.
- A complete uncalibrated 64-dimension set may yield `OBSERVED_UNCALIBRATED`.
- `OBSERVED_WITH_CALIBRATION_EVIDENCE` means calibration evidence is bound; it does not mean universal/human validity or literary quality.
- Lens observations remain independent of 64-dimension completeness.

## External evidence fences intentionally remain open

D2 does not convert any of these to PASS:

- `MODEL_READER_SIMULATION_CALIBRATION_REQUIRED`
- `HUMAN_READER_ALIGNMENT_REQUIRED`
- `REAL_BOOK_LONG_FORM_CALIBRATION_REQUIRED`
- `PROVIDER_SUBJECT_ADMISSION_REQUIRED`

Provider and calibration fixtures in deterministic tests prove binding mechanics only; they do not admit a production provider or establish real human calibration.

## Denominator accounting

The B04-C isolated denominator remains exactly 128 cases for B04-E:

- E01-E32: exposure/frontier/source/B03 binding/currentness/privacy;
- D01-D32: exact dimension registry/grouping/sparse applicability/non-scalar law;
- P01-P24: perspective/observation target/standing/calibration/evidence law;
- U01-U24: understanding assembly/sparse applicability/projection standing/cross-boundary adversarial law;
- I01-I16: invalidation/currentness/idempotency/query/content-addressing.

D1 and D2 focused qualification cases are implementation-gate evidence. They do not shrink, replace or claim completion of the locked B04-E 128-case denominator.

## Admission boundary

This receipt is evidence for governed admission only. It does not merge PR #158, does not move `book-system/control-v1`, and does not authorize a direct control-ref update outside the Book control gateway.

## Exact successor

`BOOK-RECONSTRUCTION-B04-D3 — INVALIDATION / CURRENTNESS + QUERY / RUNTIME REACHABILITY COMPOSITION`
