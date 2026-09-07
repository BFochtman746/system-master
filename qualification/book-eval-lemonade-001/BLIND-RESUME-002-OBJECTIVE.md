# BOOK-EVAL-LEMONADE-001-BLIND-RESUME-002

## Status
ACTIVE — predecessor run completed with resumable partial progress.

## Predecessor evidence
- Run: `34161381658`
- Commit: `88c1870bd1653d52bf79bd65d251096fe7fa60e9`
- Result: `FAIL_BLIND_RESUME`
- Failure: `e5_not_complete_after_12_resumable_passes`
- E4 remained `160/160` on every recorded pass.
- E4 pre-resume SHA-256: `a5a5a3d25b36f50b8e667e22137fefea88a1b12e0d1c1812d6cc1cdd782e8b9c`.
- E5 advanced from `16/160` to `117/160`.
- Scoring-private accessed: false.
- Evidence artifact ID: `10034152502`.
- Evidence artifact SHA-256: `de6e9df67251a6e3a9b878573d3470727865e247f47d97a82193eaddfe953691`.

## Exact objective
Recover and qualify the persisted blind campaign after the predecessor exhausted its bounded 12-pass resume budget. Before any additional model execution, run exactly one read-only A-01 state probe that proves:

1. the persistent run root is present;
2. scoring-private material is absent;
3. E4 is present at exactly `160` cases;
4. E4 SHA-256 is exactly `a5a5a3d25b36f50b8e667e22137fefea88a1b12e0d1c1812d6cc1cdd782e8b9c`;
5. E5 is present at exactly `117` cases;
6. the probe performs no model calls and does not mutate the persistent run root.

Only after that probe passes may a successor resume be bound to the proven `117/160` E5 state. The successor resume must preserve E4 byte-for-byte and generate only the remaining 43 E5 cases. It must not expose or use scoring-private material.

## Advancement gate
Do not run the 43-case successor resume until the read-only state probe records `PASS_RESUMABLE_STATE_E4_160_UNCHANGED_E5_117` and its evidence artifact is preserved.
