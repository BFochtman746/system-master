# BOOK-EVAL-LEMONADE-001 PowerShell Audit

Audit target: `run-book-eval-lemonade.ps1`
Audited revision: `BOOK-EVAL-LEMONADE-001-PS1-v1.2.0`

## Defects found and repaired

1. **PowerShell parser failure in Java error message**
   - Bad form: `$javaMajor:` inside a double-quoted string.
   - PowerShell interprets the colon as part of a scoped/drive variable reference.
   - Repaired by using the format operator (`-f`) instead of ambiguous interpolation.

2. **False Java failure on valid newer Java runtimes**
   - The original wrapper was written around Java 21 assumptions and `java -version` stderr behavior.
   - Repaired to accept Java 21 or newer and capture the version without treating stderr as a fatal PowerShell error.

3. **Resume claim was not actually true at the wrapper layer**
   - A new timestamped run directory was created on every invocation, so rerunning the same command could not reach the prior frozen evidence.
   - Repaired with a per-model active-run pointer. Interrupted runs reuse the same evidence directory.

4. **Completed evaluation could be accidentally rerun after a packaging failure**
   - Repaired: if `BLIND_OUTPUTS_FROZEN` already exists, provider calls are skipped and packaging resumes only.

5. **Runtime fingerprint could drift across restarts due to timestamped log lines**
   - Backend/device observations previously stored whole log lines, including timestamps.
   - Repaired: only stable backend/device values are extracted (for example, `vulkan` and the device identity), excluding timestamps/free-memory observations.

6. **Custom endpoint parameter was only partially honored**
   - Several Lemonade metadata calls were hardcoded to `127.0.0.1:13305`.
   - Repaired: the API base is derived from the supplied `-Endpoint`; the hardcoded address now appears only as the default parameter value.

7. **Evaluator JAR integrity was not checked by the wrapper**
   - Repaired: the script verifies the frozen JAR SHA-256 before execution.

8. **Model artifact selection could fail or bind ambiguously with multiple cached snapshots**
   - Repaired: prefer Hugging Face `refs/main`, verify the exact registry variant, and verify the expected byte size before hashing.

9. **Input ranges were not validated before Java execution**
   - Repaired: context size, max output tokens, max attempts, endpoint URI, and model name are validated early with explicit errors.

10. **Final provider-call evidence could be misleading after resume**
    - The Java status counter is per process.
    - Repaired at wrapper verification: the script reconstructs the frozen logical provider-member count from the final E4/E5 evidence and requires exactly `664` before packaging. The Java last-process count is retained separately for audit, not used as the total.

## Checks run after repair

- Frozen package SHA-256 manifest: PASS.
- Evaluator JAR bytecode target: Java 21 (`major version 65`): PASS.
- Java Lemonade contract suite: `10/10 PASS`.
- Corpus: `160/160`, unique IDs `160`, unique subject digests `160`: PASS.
- Expected E4/E5 logical provider-member count: `664`: PASS.
- Conservative PowerShell delimiter/string scan: PASS.
- Exact parser-defect regression (`$name:` in interpolated strings): PASS; only valid scoped variables such as `$env:` remain.
- Windows PowerShell 5.1 compatibility guard for unsupported modern operators (`??`, `?.`, `&&`, `||`, `ForEach-Object -Parallel`): PASS.
- Endpoint hardcoding audit: PASS; only default endpoint remains hardcoded.
- Blind-package boundary: no scoring-private/gold corpus files shipped: PASS.

## Execution limitation of this audit environment

The build container does not contain a Windows PowerShell engine, so the repaired `.ps1` cannot be executed by the actual Windows PowerShell parser here. The script was therefore subjected to full static inspection, conservative syntax scans, package/integration checks, and Java-side execution tests. The next run on the user's Windows machine is the authoritative Windows PowerShell execution test.
