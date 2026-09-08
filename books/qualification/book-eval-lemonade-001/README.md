# BOOK-EVAL-LEMONADE-001 — Canonical Books V2 Repository Bind

This directory binds the canonical Books V2 Lemonade qualification payload to the `system-master` repository.

Authority rules:
- Canonical core ZIP SHA-256: `19d8923945a05be473c4ad1822bc4ac765d3669294e4009676098e12332ea35d`.
- Evaluator JAR SHA-256: `fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248`.
- Provider-visible corpus SHA-256: `30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53`.
- Provider ontology SHA-256: `3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6`.
- Runner-private execution manifest SHA-256: `7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06`.
- Scoring-private gold is intentionally absent from the repository-bound provider payload.

The canonical core archive is stored as ordered Base64 chunks under `package/`. `scripts/a01-preflight.ps1` reconstructs the archive into runner temporary storage, verifies the archive and all four frozen authorities, enforces the provider-visible/runner-private boundary, then executes `BookEvalLemonade001ContractTests`.

This is a repository transport representation only; qualification authority remains the reconstructed byte hashes and the commit SHA under test.
