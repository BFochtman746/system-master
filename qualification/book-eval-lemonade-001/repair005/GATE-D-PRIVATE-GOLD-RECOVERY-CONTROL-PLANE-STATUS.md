# BOOK-EVAL-LEMONADE-001 REPAIR-005 Gate D Private Gold Recovery — Control-Plane Standing

## Standing

**PREQUALIFIED__PRIVATE_TRANSFER_REQUIRED**

This workstream has migrated `BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D-PRIVATE-GOLD-RECOVERY` to the canonical shared A-01 control plane without rewriting existing branch history.

## Control-plane authority

- canonical baseline: `c51046152eaf749d672ce923ea983e1c7893d3f2`
- registered qualification ID: `BOOK-EVAL-REPAIR-005-GATE-D-PRIVATE-GOLD-RECOVERY`
- workstream ID: `BOOK-EVAL-LEMONADE-001`
- gate class: `focused`
- migrated forward commit: `097902585dcce9aebb98172f52c07677273656a2`
- caller: `.github/workflows/book-eval-repair-005-gate-d-private-gold-recovery.yml`
- wrapper: `.github/scripts/book-eval-repair005-private-gold-recovery-qualify.js`
- shared gateway is pinned to the canonical baseline above.

The migrated caller does not schedule A-01 merely because migration files change. It requests A-01 only when the dedicated recovery ticket path is changed after safe prequalification.

## Preserved legacy truth

Legacy direct run `34289986330` at subject `2dbdeed59692891a6d2931cdeda83c2611044ba5` completed `failure`. It is preserved as historical diagnostic evidence only and is not a conforming control-plane receipt.

Its non-sensitive evidence established:

- state: `PRIVATE_INPUT_RECOVERY_BLOCKED`
- exact hash binding: `false`
- recovered: `PROVIDER`, exact SHA-256 `30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53`
- recovered: `REPAIRED_OUTPUT`, exact SHA-256 `b445acb8764661eea8c0969a7a52c4d73e86bc5bfb7b4ad082125fed875e4ce8`
- missing: `BASE_TRAINING`
- missing: `DEVELOPMENT_GOLD`
- sealed archive matches: `0`
- deterministic Gate-B rebuild attempted: `false`, because canonical gold was absent
- qualification rerun: `false`
- Teacher verification: `false`
- student training: `false`
- selective 120B: `false`
- visible-regression used: `false`
- hidden-holdout used: `false`

This is an input-availability/subject-boundary failure, not evidence of an A-01 machine failure or a Gate-D model-quality failure.

## Canonical gold availability outside GitHub

The canonical Library artifact `BOOK-EVAL-GOLD-CORPUS-v2.jsonl` has been independently re-materialized outside the repository and re-verified as:

- rows: `160`
- bytes: `180313`
- SHA-256: `51cd4790ddd89d067a6e85ee6c6f3092ec3a6fba94faac8e77e31041277da91a`

No scoring-private bytes were committed to GitHub. This status file records identity and verification only.

## Dependency-valid next boundary

**PRIVATE-GOLD-LOCAL-TRANSFER**

Place the exact verified `BOOK-EVAL-GOLD-CORPUS-v2.jsonl` onto A-01 under a bounded private recovery root, preferably:

`C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_REPAIR005_PRIVATE_RECOVERY\BOOK-EVAL-GOLD-CORPUS-v2.jsonl`

Then, and only then:

1. change the registered recovery ticket path to create the exact control-plane subject SHA;
2. run the registered focused recovery qualification through the shared gateway;
3. adjudicate its control-plane receipt;
4. require exact gold SHA `51cd4790...da91a`;
5. deterministically rebuild the 612-record Gate-B corpus if required and require exact SHA `0e3d2374...8473`;
6. only after that recovery PASS may Gate D resume at Teacher-v3 freeze verification.

Do not rerun the unchanged recovery gate before the private file is present on A-01. Do not place scoring-private content in repository history.
