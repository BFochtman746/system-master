# BOOK-EVAL-LEMONADE-001-REPO-BIND-001-PACKAGE-V2-CLOSURE

## Closure status

**TECHNICAL QUALIFICATION: PASS**  
**PROCESS COMPLIANCE: PASS WITH RECORDED DEVIATIONS**  
**FURTHER A-01 PREFLIGHTS FOR THIS PACKAGE-V2 OBJECTIVE: FROZEN**

The repository-authoritative Package V2 transport is reconstructed, hash-bound, committed, and proven usable through the GitHub -> A-01 Windows/X64 runner boundary with repository-only `cmd` + HTTP execution.

This record does not qualify Book-evaluator quality and does not close the E4/E5 blind campaign.

## Authoritative rebuild evidence

- Recovery/build workflow run: `34161022958`
- Trigger commit: `7a202f40186193142ff56fd1b58cb070d3072510`
- Repository-authoritative rebuilt payload commit: `2afd9458168edd1d399a329488572e25596d9609`
- Rebuild evidence artifact: `10032590604`
- Source authority: retained A-01 `PASS_EXISTING_PACKAGE_PROBE` artifact `10031477242` from workflow run `34157551269`
- Scoring-private included: `false`
- Canonical inputs verified: `4/4`
- Repository reconstruction verified: `4/4`
- Rebuild qualification marker: `PASS_PACKAGE_V2_REBUILD_LOCAL_GENERATION`

Frozen object identities:

- evaluator JAR SHA-256: `fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248`
- provider-visible corpus SHA-256: `30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53`
- provider ontology SHA-256: `3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6`
- runner-private execution manifest SHA-256: `7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06`

Repository transport part counts:

- JAR: `41`
- corpus: `15`
- ontology: `1`
- execution manifest: `9`

## A-01 repository-only preflight evidence

The dependent preflight job in workflow run `34161022958` checked out rebuilt payload commit `2afd9458168edd1d399a329488572e25596d9609` and completed successfully.

- Job: `101862760391`
- Evidence artifact: `10032595973`
- frozen input hashes verified: `true`
- frozen input source: `repository_reconstruction_only`
- Java evaluator contract: `PASS_10_OF_10`
- Lemonade HTTP load verified: `true`
- `/v1/responses` round trip verified: `true`
- model request ID: `user.gpt-oss-120b-MXFP4`
- checkpoint: `ggml-org/gpt-oss-120b-GGUF:MXFP4`
- model file: `gpt-oss-120b-MXFP4.gguf`
- upstream model SHA-256 reference: `582bd40f6886200101f4c4ed9f25f3fe80cc14c86e9e2b37746cd8904a0c622d`
- PowerShell used: `false`
- Lemonade CLI required: `false`
- scoring-private accessed: `false`
- qualification marker: `PASS_A01_REPOSITORY_PACKAGE_V2_PREFLIGHT`

## Process deviation 1 - preflight provenance metadata

The dependent preflight physically checked out the correct rebuilt payload commit `2afd9458168edd1d399a329488572e25596d9609`, but the first version of the summary field used workflow-level `GITHUB_SHA` and therefore recorded the trigger commit `7a202f40186193142ff56fd1b58cb070d3072510` as `commit=`.

A later provenance-correction run `34161122627` executed the same bounded repository-only preflight at commit `1e69a13e191a80e864c9b8828f79e4f00fc7b4e4` and produced corrected self-consistent commit provenance.

- correction job: `101863011755`
- correction evidence artifact: `10032622594`
- qualification marker: `PASS_A01_REPOSITORY_PACKAGE_V2_PREFLIGHT`

Because this correction physically executed the preflight again, the original instruction's literal physical-execution count of exactly one was exceeded. This is recorded as a process deviation rather than hidden or relabeled. No further Package-V2 preflight is permitted or required.

## Process deviation 2 - blind execution ordering

Workflow run `34157917638` began the real E4/E5 blind campaign before this repository-bind objective was fully closed. That ordering violated the objective's stated rule that real E4/E5 execution must remain outside this qualification slice.

The run nevertheless preserved the blind boundary (`scoring_private_accessed=false`) and showed real resumable progress before runner shutdown:

- E4 reached `160/160`
- E5 reached `16/160`
- the runner then received a shutdown signal and the workflow terminated

This early execution is not used to prove the repository-bind objective and does not qualify evaluator quality. It is retained only as downstream blind-campaign evidence for the successor objective.

## Adjudication

The technical question for this objective is resolved affirmatively:

1. the four frozen canonical inputs can be recovered from retained A-01 evidence;
2. all four independently match their frozen SHA-256 identities;
3. the complete V2 repository transport reconstructs byte-identically;
4. scoring-private material is excluded;
5. the repository-frozen evaluator passes its 10/10 contract;
6. A-01 reaches and loads the bound GPT-OSS-120B-MXFP4 model through localhost HTTP;
7. a repository-only HTTP response round trip succeeds;
8. the evidence is preserved in GitHub Actions artifacts.

Therefore `BOOK-EVAL-LEMONADE-001-REPO-BIND-001-PACKAGE-V2-REBUILD` is **technically qualified and closed with recorded process deviations**.

## Exact dependency-valid successor

Proceed to a new blind-campaign objective that treats the repository-bound V2 package as the authority, preserves the completed E4 `160/160` evidence where valid, resumes E5 from preserved state where valid, and separately repairs/adjudicates the observed provider-response ontology failure behavior. Do not rerun this Package-V2 preflight again.
