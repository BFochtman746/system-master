# BOOK-EVAL-LEMONADE-001 — Local Lemonade Provider Binding

## Standing
PASS_LOCAL_LEMONADE_PROVIDER_ADAPTER_AND_BLIND_RUNNER_READY_FOR_USER_SERVER_EXECUTION

This packet adapts the already-qualified provider-blind v2 Book evaluator to a local Lemonade Responses-compatible endpoint without adding the scoring-private gold corpus to the runner package.

## Input authority
- Provider-visible corpus SHA-256: `30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53`
- Provider ontology SHA-256: `3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6`
- Runner-private execution manifest SHA-256: `7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06`

## New executable behavior
- Local Lemonade endpoint defaults to `http://127.0.0.1:13305/v1/responses`.
- No API key is required for loopback Lemonade; optional `LEMONADE_API_KEY` is supported if the server is later secured.
- Provider request contains no gold/family/split/difficulty/capability/oracle fields.
- Reasoning output is ignored; only final `output_text` is accepted as the structured evaluator response.
- Structured response is validated locally against the exact task-mode ontology and exact case/subject digest binding.
- Invalid structured output is retried within a bounded attempt budget; it never silently becomes evidence.
- Runtime fingerprint binds exact model/runtime identity JSON, corpus/ontology, evaluator prompt, output-token budget, temperature, provider endpoint, and E4/E5 architecture composition.
- The Windows wrapper resolves the exact Hugging Face GGUF file, hashes it, records Lemonade version/backend/device/context settings, and then launches the blind runner.
- DEVELOPMENT is run first and frozen at exactly 80 cases for E4 and E5 before regression/holdout completion.
- Run is resumable from frozen case evidence.
- User-visible progress is emitted after every durably committed case.
- On success, the wrapper packages only blind outputs for later scoring; gold scoring is not present in the runner package.

## Qualification executed here
Strict Java 21 compile: PASS (`--release 21 -Xlint:all -Werror`).

Contract/regression assertions:
- provider v2 blind-boundary contract: 37/37 PASS
- inherited provider adapter contract: 10/10 PASS
- inherited provider contract: 53/53 PASS
- new Lemonade adapter contract: 10/10 PASS
- subtotal: 110/110 PASS

End-to-end local contract-provider rehearsal:
- E4 frozen cases: 160/160
- E5 frozen cases: 160/160
- provider calls: 664
- blind run state: BLIND_OUTPUTS_FROZEN
- provider-visible case/gold boundary preserved

## Real machine evidence supplied by user
The user's Lemonade 11.5.0 server successfully loaded the explicitly registered `user.gpt-oss-120b-MXFP4` model and returned a completed `/v1/responses` response from the actual `gpt-oss-120b-MXFP4.gguf` artifact. This packet does not treat that smoke test as Book-quality evidence; it only establishes that the target local provider/model path is available.

## Not yet claimed
- No 160-case real-model Book qualification has been scored yet.
- No E4/E5 capability is qualified merely because Lemonade/model loading works.
- Expert-calibration-pending gold cases remain provisional after scoring.
- Assurance promotion is not authorized by this packet.

## Next execution
Run `run-book-eval-lemonade.ps1` on the user's Lemonade machine. After it produces `BOOK_EVAL_LEMONADE_001_BLIND_OUTPUTS_*.zip`, upload that ZIP for post-freeze scoring against the scoring-private gold corpus.
