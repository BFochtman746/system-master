# DOCUMENTS-R4-TRANSPORT-CONTRACT-RECONCILIATION-003

Status: SELECTED / READY_FOR_EXECUTION
Owner: SYSTEM_MASTER/DOCUMENTS
Parent reconciliation: DOCUMENTS-FULL-BUILD-READINESS-RECONCILIATION-001
Date: 2026-09-11

## Objective

Remove the demonstrated R4 source-admission ambiguity before exact source transfer by deriving one deterministic transport contract from the exact recovered R4 handoff and its 225-row canonical source manifest.

## Immutable inputs

- Exact source handoff: `CR001_R4_EXACT_225_SOURCE_HANDOFF_20260910.zip`
- Source handoff SHA-256: `ada701cfa15e6162b6cdf67bc6c0803540a611b08a23aeeeddd1045d8ce2d8ab`
- Canonical source manifest: `CANONICAL-SOURCE-TREE-MANIFEST(2).csv`
- Canonical Java source/test row count: `225`

## Demonstrated defect

Current transport authorities disagree:

- `transport/document-r4/STAGING.json`: transport SHA `4fce25bc78646f4be3b8152865184e1cee84868ba1a13e4587ccef6a16c23dd9`, expected chunks `81`.
- `.github/workflows/document-r4-github-native-admission.yml`: transport SHA `b6d0f8a98cea0615513eda07873b38532123585336de87c40350afeafa474edf`, expected chunks `100`.

Neither derived carrier identity is accepted merely because it already appears in metadata.

## Execution contract

1. Materialize the exact handoff bytes and verify SHA-256 equals the immutable input digest.
2. Verify the archive contains the exact 225 Java source/test files matching the canonical manifest by path, size and SHA-256.
3. Define one deterministic carrier recipe including archive format, member ordering, normalized metadata/timestamps/ownership/modes, compression implementation and version, compression settings, and chunking rule.
4. Generate the carrier twice from independent fresh extraction directories and require byte-identical output.
5. Compute the canonical carrier SHA-256 from those reproduced bytes.
6. Split the carrier using one explicit fixed chunk-size rule and emit an ordered chunk manifest containing ordinal, filename, byte length and SHA-256.
7. Reassemble from the ordered chunks and require byte identity with the canonical carrier.
8. Adversarially prove fail-closed behavior for: missing chunk, duplicate chunk, reordered ordinal/name mapping, modified byte, unexpected extra chunk, wrong chunk count, wrong chunk digest, wrong carrier digest, and wrong reconstructed source-manifest row.
9. Reconcile `STAGING.json` and the admission workflow to the new single canonical carrier/chunk contract. Do not preserve conflicting magic constants.
10. Keep the transport unarmed and READY absent until every exact required chunk exists at the admitted paths.
11. Do not import source into current authority merely because the transport contract is repaired; GitHub-native source custody becomes true only after exact bytes are actually committed and reverified.
12. Transfer no historical R4/T14 PASS to any new GitHub subject.

## Required evidence

- deterministic-carrier recipe record;
- two-build byte-identity receipt;
- canonical carrier SHA-256;
- ordered chunk manifest;
- reassembly receipt;
- adversarial transport verification receipt;
- 225/225 source-manifest verification receipt;
- STAGING/workflow contract-parity receipt;
- source-custody standing explicitly remaining BLOCKED until all payload bytes are present;
- exact successor after fresh owner-head revalidation.

## Acceptance criteria

PASS only when all of the following are simultaneously true:

- exact input handoff digest matches `ada701cf...d8ab`;
- 225/225 source rows match the canonical manifest;
- independent carrier generation is byte-identical;
- one and only one canonical carrier digest is recorded;
- one and only one chunk-count/size/order contract is recorded;
- STAGING and admission workflow consume that exact same contract;
- all adversarial chunk/reassembly cases fail closed;
- no READY marker is created by this package;
- no GitHub-native source-custody PASS is claimed by this package;
- no historical qualification PASS is transferred.

Any mismatch yields BLOCKED/FAIL with raw evidence preserved.

## Explicit non-scope

- no DOCX/PDF/PPTX/OCR feature implementation;
- no UI work;
- no Book, Learning, Programming or Prose semantics;
- no production certification;
- no native Microsoft Office fidelity claim;
- no A-01 claim.

## Queued feature candidate after source admission

`DOCUMENTS-SPINE-IDENTIFY-PROFILE-COMPLETION-001` remains a candidate only. It is not promoted by this package.
