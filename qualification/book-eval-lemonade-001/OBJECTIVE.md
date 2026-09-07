# BOOK-EVAL-LEMONADE-001-REPO-BIND-001

## Objective
Bind the frozen Book evaluator to the authoritative `BFochtman746/system-master` repository and qualify the A-01 execution route before any real E4/E5 blind qualification is allowed.

Execution route:

`ChatGPT -> GitHub -> GitHub Actions -> self-hosted Windows X64 runner system-master-pc on A-01 -> logs/artifacts -> GitHub -> ChatGPT verification`

Base authority commit: `b4a6ee628f9c1a02980d1e1b2fbb787ee860ae34`.

## Frozen evaluator inputs

- evaluator JAR bytes are losslessly preserved as four repository-safe Base64 chunks under `jar-base64/`; reconstructed JAR SHA-256 `fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248`
- provider-visible corpus SHA-256 `30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53`
- provider-visible ontology SHA-256 `3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6`
- runner-private execution manifest SHA-256 `7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06`

The historical audited PowerShell wrapper is preserved under `historical/` for traceability only. It is **not** the qualified A-01 execution route and no workflow in this objective invokes it.

## Blindness boundary

The scoring-private gold corpus is intentionally absent from this branch and from the A-01 preflight execution path. Its previously sealed identity is recorded in `SCORING-PRIVATE-BOUNDARY.md`; its contents must not be introduced before blind outputs are frozen.

## A-01 model route to qualify

- Lemonade model request id: `user.gpt-oss-120b-MXFP4`
- expected checkpoint: `ggml-org/gpt-oss-120b-GGUF:MXFP4`
- expected GGUF filename: `gpt-oss-120b-MXFP4.gguf`
- expected GGUF byte size: `63387346208`
- Lemonade endpoint: `http://127.0.0.1:13305/v1/responses`
- preflight context: `4096`

The preflight computes and preserves the local GGUF SHA-256 as new machine evidence. It does not run the 160-case E4/E5 qualification.
