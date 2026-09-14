# Required Verification — installation proof

This file exists only to create the first pull-request subject after the `Required Verification` workflow landed on `main`.

Acceptance for this proof PR:

- GitHub emits check context `Required Verification / required-verification`.
- The anti-vacuous probe intentionally reduces discovered qualification classes below the fixed floor and observes the expected nonzero Maven exit.
- The checkout is restored and `./verify.sh` returns `RESULT: PASS`.
- Surefire XML contains a non-zero executed-test count.

This proof does not alter architecture, authority, ownership, or evidence lineage.
