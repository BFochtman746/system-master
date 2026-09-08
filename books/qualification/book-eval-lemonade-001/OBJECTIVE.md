# BOOK-EVAL-LEMONADE-001-REPO-BIND-001

## Exact objective

Bind the frozen Book evaluator to the authoritative `BFochtman746/system-master` repository and qualify the A-01 execution boundary before any real E4/E5 blind run.

## Authority and base

- Repository: `BFochtman746/system-master`
- Objective branch: `book-eval-lemonade-001-repo-bind-001`
- Base qualified runner commit: `b4a6ee628f9c1a02980d1e1b2fbb787ee860ae34`
- Required runner labels: `[self-hosted, Windows, X64]`
- A-01 runner: `system-master-pc`

## Frozen evaluator identities

- `book-eval-lemonade.jar` SHA-256: `fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248`
- provider-visible corpus SHA-256: `30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53`
- provider ontology SHA-256: `3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6`
- runner-private execution manifest SHA-256: `7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06`
- scoring-private package identity only: `1091d409b5167463325ff85764bdd9b62c0e96cf9a9bef5f03445616c6b81940`

The scoring-private package contents are intentionally absent from this branch and from the A-01 preflight source path.

## Frozen-input preservation route

The earlier attempt to transfer the JAR as repository text chunks was detected as non-byte-exact before any workflow existed. Those `jar-base64/` files and the partial `jar-base64-v2/` retry are preserved only as failed transfer evidence and are **not authoritative inputs**.

For this qualification slice the byte-authoritative inputs are read-only from the exact, previously user-executed Book-evaluator folder on A-01:

`C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_RUNNER_JAVA25_HOTFIX\delivery`

The preflight copies only four named frozen input files from that bounded related path into `RUNNER_TEMP`, verifies every SHA-256 against this repository contract, runs the 10/10 Java contract test, and uploads the verified copies with the qualification evidence as a GitHub Actions artifact. No parent-directory enumeration occurs.

This makes the GitHub run + artifact the preserved evidence for the exact binary/text inputs used on A-01. The source folder is not modified.

## Model binding

- model request ID: `user.gpt-oss-120b-MXFP4`
- checkpoint: `ggml-org/gpt-oss-120b-GGUF:MXFP4`
- expected local model file: `gpt-oss-120b-MXFP4.gguf`
- expected bytes: `63387346208`
- context for preflight: `4096`
- API base: `http://127.0.0.1:13305`

The preflight requires exact model metadata, successful load, a unique exact local model file under the bounded Hugging Face repository cache, exact byte size, an exact SHA-256 evidence receipt, and a `/v1/responses` smoke response from that model.

## What this objective may prove

A PASS may prove that the exact frozen evaluator inputs, Java contract, Lemonade route, and exact GPT-OSS-120B-MXFP4 artifact are usable through the qualified GitHub → A-01 path.

It may **not** prove Book-evaluator quality. The real E4/E5 blind execution remains forbidden in this objective and must report `blind_e4_e5_executed=false`.
