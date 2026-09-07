BOOK-EVAL-LEMONADE-001 — Windows local-model blind evaluator runner

Purpose
- Run the frozen 160-case provider-blind Book evaluator against Lemonade on the user's own machine.
- The package contains NO gold corpus and NO oracle answers.
- E4 and E5 responses are frozen before scoring.

Default model
  user.gpt-oss-120b-MXFP4

Requirements
- Windows PowerShell 5.1 or newer.
- Java 21 or newer. The evaluator JAR targets Java 21 bytecode; newer Java runtimes are accepted.
- Lemonade CLI/server reachable at the endpoint supplied to the script.

Run from PowerShell
  Set-ExecutionPolicy -Scope Process Bypass
  .\run-book-eval-lemonade.ps1

The script:
1. verifies the evaluator JAR and frozen corpus/ontology/execution hashes;
2. validates Java 21 or newer without treating java -version stderr as a PowerShell failure;
3. verifies Lemonade and loads the exact model at the requested context size;
4. resolves, size-checks, and SHA-256 hashes the exact local GGUF weights;
5. records a stable runtime identity (timestamps from logs are deliberately excluded);
6. creates an active-run pointer so rerunning the same command resumes the same evidence directory;
7. runs E4 + E5 in DEVELOPMENT -> REGRESSION -> HIDDEN order with DEVELOPMENT freezes;
8. if provider/runtime execution stops, keeps the active-run pointer and frozen evidence for resume;
9. if evaluation already closed but packaging failed, reruns packaging without making provider calls;
10. verifies 160 E4 cases, 160 E5 cases, and 664 frozen logical provider-member calls;
11. packages blind outputs into a ZIP for upload and later private-gold scoring.

Do not add the scoring-private gold corpus to this runner directory before the blind run closes.
