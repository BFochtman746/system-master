# BOOK-EVAL-LEMONADE-001 REPAIR-005 — Private Authority Recovery Update — 2026-09-09

Status: SOURCE FOUND / A-01 TRANSFER PENDING

## Material change

The earlier A-01 `SUBJECT_FAILURE` from private recovery run `34292412264` correctly proved that the exact `DEVELOPMENT_GOLD` and `BASE_TRAINING` roles were not present in the A-01 search roots at execution time. It did **not** prove those artifacts were irrecoverably lost.

During this second-shift pass, the saved ChatGPT Library was searched for the frozen Book Evaluation artifacts without exposing or uploading their content to GitHub.

Exact saved artifacts verified in an isolated working copy:

- `BOOK-EVAL-GOLD-CORPUS-v2.jsonl`
  - rows: 160
  - bytes: 180313
  - SHA-256: `51cd4790ddd89d067a6e85ee6c6f3092ec3a6fba94faac8e77e31041277da91a`
  - exact Gate-D `DEVELOPMENT_GOLD` authority: **MATCH**
- `BOOK-EVAL-CORPUS-INPUT-v2.jsonl`
  - rows: 160
  - bytes: 65183
  - SHA-256: `30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53`
  - exact Gate-D `PROVIDER` authority: **MATCH**

No private corpus body was copied into the repository, committed, or uploaded as a GitHub Actions artifact.

## Why BASE_TRAINING no longer requires an independent lost-file hunt

The existing repository-owned recovery program `recover-repair005-gate-d-inputs.py` already implements the correct deterministic recovery semantics:

1. locate exact-hash `PROVIDER`, `DEVELOPMENT_GOLD`, and `REPAIRED_OUTPUT`;
2. if exact `BASE_TRAINING` is absent but those three inputs exist, invoke the frozen `compile-repair005-gate-b.py` compiler;
3. accept the rebuild only if the resulting private training corpus hashes exactly to:
   `0e3d237405340ae1abf0706c88c39275360c8c9380388b4f53d73275f4f38473`;
4. otherwise keep the recovery boundary failed.

The compiler itself filters the 160-row gold corpus to exactly the 80 `DEVELOPMENT` rows, separately records the 48 `VISIBLE_REGRESSION` and 32 `HIDDEN_HOLDOUT` IDs, rejects any selected input/output intersection with those forbidden IDs, and verifies the produced training text contains no forbidden case IDs. The resulting corpus is therefore an exact deterministic DEVELOPMENT-only derivative, not a reconstruction from hidden or visible holdout labels.

Canonical A-01 recovery run `34292412264` already found exact-hash:

- `PROVIDER`: recovered
- `REPAIRED_OUTPUT`: recovered

It could not attempt the deterministic Gate-B rebuild because exact `DEVELOPMENT_GOLD` was absent from A-01. The saved Library verification now proves the correct gold still exists.

## Revised blocker classification

Previous shorthand:

`BASE_TRAINING missing + DEVELOPMENT_GOLD missing`

Revised authoritative interpretation:

`DEVELOPMENT_GOLD exact source found and verified outside A-01 -> secure transfer to A-01 pending -> existing recovery qualifier can then recover PROVIDER + REPAIRED_OUTPUT and deterministically rebuild BASE_TRAINING to its frozen exact SHA -> exact private authority can be requalified`

The remaining problem is therefore **secure source custody / transfer onto A-01**, not evaluator design, not gold regeneration, and not a need to synthesize a replacement training corpus.

## Security boundary

Do not:

- commit the gold corpus to GitHub;
- upload it as a GitHub Actions artifact;
- paste or expose its rows in logs/evidence;
- infer or regenerate gold labels;
- move hidden/visible rows into adaptive training;
- weaken exact SHA identities to accept a near match.

A transfer mechanism must place the exact file on A-01 through a private/local path that the registered recovery wrapper is authorized to scan. The recovery wrapper itself records only role/hash/provenance state, not private paths or raw content, in authoritative evidence.

## Dependency-valid recovery sequence

Two independent prerequisites may close in either order:

1. `BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-FREEZE` — exact Teacher raw/status/taxonomy -> canonical 440 or fail closed.
2. Securely place exact `DEVELOPMENT_GOLD` SHA `51cd...a91a` on A-01 -> rerun `BOOK-EVAL-REPAIR-005-GATE-D-PRIVATE-GOLD-RECOVERY` -> deterministic exact `BASE_TRAINING` rebuild if needed.

Only after both PASS:

`612 base + 440 Teacher -> 1,052 task-qualified hierarchical student corpus -> student retraining -> 5-fold source-held-out qualification -> selective <=35% 120B fallback + A/B swap audit`

## Exact next private-authority objective

`BOOK-EVAL-REPAIR-005-GATE-D-PRIVATE-AUTHORITY-TRANSFER-002` — securely stage the exact verified saved `BOOK-EVAL-GOLD-CORPUS-v2.jsonl` onto A-01 without GitHub/artifact exposure, then rerun only the registered exact-hash private recovery qualification. The existing recovery program should deterministically rebuild `BASE_TRAINING` and must accept it only if SHA-256 equals `0e3d237405340ae1abf0706c88c39275360c8c9380388b4f53d73275f4f38473`.
