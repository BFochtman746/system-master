# Repository package transport

The original `jar-base64/chunk-*` preservation was exercised by A-01 run 34156192176 and failed closed because the reconstructed Base64 was invalid. Those files are retained as failure evidence and are not authoritative inputs.

The replacement transport uses smaller `jar-base64-v2/part-*`, `provider-visible-parts-v2/part-*`, and `runner-private-parts-v2/part-*` files. A-01 must reconstruct each frozen input under `RUNNER_TEMP` and verify its canonical SHA-256 before executing it.

The canonical frozen hashes remain:

- evaluator JAR: `fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248`
- provider-visible corpus: `30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53`
- provider ontology: `3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6`
- runner-private execution manifest: `7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06`

Scoring-private gold is intentionally excluded from the A-01 blind-execution repository path.