@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "OBJECTIVE=BOOK-EVAL-LEMONADE-001-BLIND-RESUME-002-STATE-PROBE"
set "RUNROOT=C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_A01_BLIND_RUN_GPT_OSS_120B"
set "EVIDENCE=%RUNNER_TEMP%\book-eval-blind-state-probe-v2-%GITHUB_RUN_ID%"
set "E4_FILE=%RUNROOT%\E4-SPECIALIST-v2-FROZEN.jsonl"
set "E5_FILE=%RUNROOT%\E5-PANEL-v2-FROZEN.jsonl"
set "STATUS_FILE=%RUNROOT%\BLIND-RUN-STATUS.json"
set "EXPECTED_E4_SHA=a5a5a3d25b36f50b8e667e22137fefea88a1b12e0d1c1812d6cc1cdd782e8b9c"
set "EXPECTED_E4_COUNT=160"
set "EXPECTED_E5_COUNT=117"
set "SUMMARY=%EVIDENCE%\state-probe-v2-summary.txt"

if exist "%EVIDENCE%" rmdir /s /q "%EVIDENCE%"
mkdir "%EVIDENCE%" || exit /b 80

(
  echo objective=%OBJECTIVE%
  echo repository=%GITHUB_REPOSITORY%
  echo commit=%GITHUB_SHA%
  echo runner=%RUNNER_NAME%
  echo machine=%COMPUTERNAME%
  echo persistent_runroot_mutated=false
  echo model_calls_executed=false
  echo scoring_private_accessed=false
  echo powershell_used=false
  echo expected_e4_cases=%EXPECTED_E4_COUNT%
  echo expected_e5_cases=%EXPECTED_E5_COUNT%
  echo expected_e4_sha256=%EXPECTED_E4_SHA%
)>"%SUMMARY%"

if not exist "%RUNROOT%" (set "FAIL=persistent_runroot_missing" & goto :fail)
if exist "%RUNROOT%\scoring-private" (set "FAIL=scoring_private_material_present_in_runroot" & goto :fail)
if exist "%RUNROOT%\BOOK_EVAL_SCORING_PRIVATE_v2.zip" (set "FAIL=scoring_private_zip_present_in_runroot" & goto :fail)
if not exist "%E4_FILE%" (set "FAIL=e4_frozen_output_missing" & goto :fail)
if not exist "%E5_FILE%" (set "FAIL=e5_frozen_output_missing" & goto :fail)

for /f %%C in ('find /c /v "" ^< "%E4_FILE%"') do set "E4_COUNT=%%C"
for /f %%C in ('find /c /v "" ^< "%E5_FILE%"') do set "E5_COUNT=%%C"
echo e4_frozen_cases=!E4_COUNT!>>"%SUMMARY%"
echo e5_frozen_cases=!E5_COUNT!>>"%SUMMARY%"

if not "!E4_COUNT!"=="%EXPECTED_E4_COUNT%" (set "FAIL=e4_count_mismatch" & goto :fail)
if not "!E5_COUNT!"=="%EXPECTED_E5_COUNT%" (set "FAIL=e5_count_mismatch" & goto :fail)

certutil -hashfile "%E4_FILE%" SHA256 >"%EVIDENCE%\e4-sha256.txt" 2>&1 || (set "FAIL=e4_hash_failed" & goto :fail)
findstr /i /c:"%EXPECTED_E4_SHA%" "%EVIDENCE%\e4-sha256.txt" >nul || (set "FAIL=e4_sha_mismatch" & goto :fail)
certutil -hashfile "%E5_FILE%" SHA256 >"%EVIDENCE%\e5-sha256.txt" 2>&1 || (set "FAIL=e5_hash_failed" & goto :fail)

if exist "%STATUS_FILE%" copy /y "%STATUS_FILE%" "%EVIDENCE%\BLIND-RUN-STATUS.json" >nul || (set "FAIL=status_copy_failed" & goto :fail)
dir /b /a:-d "%RUNROOT%" >"%EVIDENCE%\runroot-files.txt" 2>&1

(
  echo runroot_present=true
  echo scoring_private_present=false
  echo e4_sha256_unchanged=true
  echo e5_remaining_cases=43
  echo qualification=PASS_RESUMABLE_STATE_E4_160_UNCHANGED_E5_117
)>>"%SUMMARY%"
type "%SUMMARY%"
exit /b 0

:fail
(
  echo failure=!FAIL!
  echo qualification=FAIL_BLIND_STATE_PROBE_V2
)>>"%SUMMARY%"
type "%SUMMARY%"
exit /b 1
