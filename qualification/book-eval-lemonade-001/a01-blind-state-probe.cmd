@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "OBJECTIVE=BOOK-EVAL-LEMONADE-001-BLIND-RESUME-001-STATE-PROBE"
set "RUNROOT=C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_A01_BLIND_RUN_GPT_OSS_120B"
set "EVIDENCE=%RUNNER_TEMP%\book-eval-blind-state-probe-%GITHUB_RUN_ID%"
set "E4_FILE=%RUNROOT%\E4-SPECIALIST-v2-FROZEN.jsonl"
set "E5_FILE=%RUNROOT%\E5-PANEL-v2-FROZEN.jsonl"
set "STATUS_FILE=%RUNROOT%\BLIND-RUN-STATUS.json"
set "OLD_SUMMARY=%RUNROOT%\A01-EXECUTION-SUMMARY.txt"

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
)>"%EVIDENCE%\state-probe-summary.txt"

if not exist "%RUNROOT%" goto :runroot_missing
if exist "%RUNROOT%\scoring-private" goto :gold_present
if exist "%RUNROOT%\BOOK_EVAL_SCORING_PRIVATE_v2.zip" goto :gold_present

dir /b /a:-d "%RUNROOT%" >"%EVIDENCE%\runroot-files.txt" 2>&1

set "E4_COUNT=0"
set "E5_COUNT=0"
set "E4_PRESENT=false"
set "E5_PRESENT=false"
set "STATUS_PRESENT=false"
set "OLD_SUMMARY_PRESENT=false"

if exist "%E4_FILE%" (
  set "E4_PRESENT=true"
  for /f %%C in ('find /c /v "" ^< "%E4_FILE%"') do set "E4_COUNT=%%C"
  certutil -hashfile "%E4_FILE%" SHA256 >"%EVIDENCE%\e4-sha256.txt" 2>&1 || goto :hash_fail
)

if exist "%E5_FILE%" (
  set "E5_PRESENT=true"
  for /f %%C in ('find /c /v "" ^< "%E5_FILE%"') do set "E5_COUNT=%%C"
  certutil -hashfile "%E5_FILE%" SHA256 >"%EVIDENCE%\e5-sha256.txt" 2>&1 || goto :hash_fail
)

if exist "%STATUS_FILE%" (
  set "STATUS_PRESENT=true"
  copy /y "%STATUS_FILE%" "%EVIDENCE%\BLIND-RUN-STATUS.json" >nul || goto :copy_fail
)

if exist "%OLD_SUMMARY%" (
  set "OLD_SUMMARY_PRESENT=true"
  copy /y "%OLD_SUMMARY%" "%EVIDENCE%\A01-EXECUTION-SUMMARY.txt" >nul || goto :copy_fail
)

(
  echo runroot_present=true
  echo scoring_private_present=false
  echo e4_present=!E4_PRESENT!
  echo e4_frozen_cases=!E4_COUNT!
  echo e5_present=!E5_PRESENT!
  echo e5_frozen_cases=!E5_COUNT!
  echo blind_run_status_present=!STATUS_PRESENT!
  echo prior_execution_summary_present=!OLD_SUMMARY_PRESENT!
)>>"%EVIDENCE%\state-probe-summary.txt"

if not "!E4_PRESENT!"=="true" goto :state_unexpected
if not "!E4_COUNT!"=="160" goto :state_unexpected
if "!E5_PRESENT!"=="false" (
  echo qualification=PASS_RESUMABLE_STATE_E4_COMPLETE_E5_EMPTY>>"%EVIDENCE%\state-probe-summary.txt"
  type "%EVIDENCE%\state-probe-summary.txt"
  exit /b 0
)

if !E5_COUNT! GTR 160 goto :state_unexpected
if "!E5_COUNT!"=="160" (
  echo qualification=PASS_PERSISTED_BLIND_OUTPUTS_COMPLETE>>"%EVIDENCE%\state-probe-summary.txt"
  type "%EVIDENCE%\state-probe-summary.txt"
  exit /b 0
)

if !E5_COUNT! GEQ 0 (
  echo qualification=PASS_RESUMABLE_STATE_E4_COMPLETE_E5_PARTIAL>>"%EVIDENCE%\state-probe-summary.txt"
  type "%EVIDENCE%\state-probe-summary.txt"
  exit /b 0
)

goto :state_unexpected

:runroot_missing
set "FAIL=persistent_runroot_missing"
goto :fail
:gold_present
set "FAIL=scoring_private_material_present_in_runroot"
goto :fail
:hash_fail
set "FAIL=frozen_output_hash_failed"
goto :fail
:copy_fail
set "FAIL=evidence_copy_failed"
goto :fail
:state_unexpected
set "FAIL=persisted_blind_state_unexpected"
goto :fail

:fail
(
  echo failure=!FAIL!
  echo qualification=FAIL_BLIND_STATE_PROBE
)>>"%EVIDENCE%\state-probe-summary.txt"
type "%EVIDENCE%\state-probe-summary.txt"
exit /b 1
