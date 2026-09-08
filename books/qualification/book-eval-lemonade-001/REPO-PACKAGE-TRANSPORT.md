# Repository package transport

`BOOK-EVAL-LEMONADE-001-REPO-BIND-001-PACKAGE-V2-REBUILD` replaces the failed historical transport with repository-authoritative Base64 payloads generated mechanically from the exact canonical frozen bytes whose SHA-256 identities were previously proven on A-01.

The historical `jar-base64/chunk-*` files are retained as failure evidence only. A-01 run `34156192176` proved that transport invalid by failing closed during Base64 reconstruction. They must never be used as execution inputs.

Authoritative V2 payload directories are:

- `jar-base64-v2/` — 41 parts, 6,000 Base64 characters per full part.
- `provider-visible-corpus-base64-v2/` — 15 parts.
- `provider-ontology-base64-v2/` — 1 part.
- `runner-private-base64-v2/` — 9 parts.

`PACKAGE-V2-REBUILD-MANIFEST.json` binds part counts, source byte lengths, Base64 lengths, per-part SHA-256 values, and final canonical SHA-256 identities.

The canonical frozen identities are:

- evaluator JAR: `fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248`
- provider-visible corpus: `30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53`
- provider ontology: `3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6`
- runner-private execution manifest: `7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06`

Qualification rule: A-01 must reconstruct all four inputs only from these repository V2 payloads under `RUNNER_TEMP`, verify all four final SHA-256 identities, prove scoring-private material is absent, pass the evaluator contract test `10/10`, and then verify Lemonade through the localhost HTTP API. The Lemonade CLI and PowerShell are not required.

Scoring-private gold remains intentionally excluded from the blind-execution repository path.
