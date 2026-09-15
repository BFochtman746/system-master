# A01-CODE-QUAL-001 Fixture Boundary

This directory is the sealed benchmark package boundary.

The executable fixture is intentionally split into:

- `candidate/` — copied into the writable A-01 workspace at benchmark start;
- `evaluator-hidden/` — never exposed to A-01 before the candidate artifact is frozen;
- `runner/` — orchestrates sealing, the 1,800-second coding window, freeze, post-run evaluation, evidence hashing, and receipt generation.

No run is valid until all three areas exist, the hidden evaluator is inaccessible during the timed window, and the closure checklist is satisfied.

Do not place live System Master production code in this fixture. The benchmark must exercise equivalent engineering problems without granting the candidate foreknowledge from prior System Master work.
