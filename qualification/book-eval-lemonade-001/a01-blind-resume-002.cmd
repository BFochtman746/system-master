@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "OBJECTIVE=BOOK-EVAL-LEMONADE-001-BLIND-RESUME-002"
set "MODEL=user.gpt-oss-120b-MXFP4"
set "EXPECTED_CHECKPOINT=ggml-org/gpt-oss-120b-GGUF:MXFP4"
set "EXPECTED_JAR_SHA=fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248"
set "EXPECTED_CORPUS_SHA=30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53"
set "EXPECTED_ONTOLOGY_SHA=3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6"
set "EXPECTED_EXEC_SHA=7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06"
set "EXPECTED_E4_SHA=a5a5a3d25b36f50b8e667e22137fefea88a1b12e0d1c1812d6cc1cdd782e8b9c"
set "API_BASE=http://127.0.0.1:13305"
set "RESPONSES_ENDPOINT=%API_BASE%/v1/responses"
set "BUNDLE=%GITHUB_WORKSPACE%\qualification\book-eval-lemonade-001"
set "EVIDENCE=%RUNNER_TEMP%\book-eval-blind-resume-002-%GITHUB_RUN_ID%"
set "STAGE=%EVIDENCE%\frozen-inputs"
set "RUNROOT=C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_A01_BLIND_RUN_GPT_OSS_120B"
set "SUMMARY=%EVIDENCE%\blind-resume-002-summary.txt"
set "IDENTITY=%EVIDENCE%\LEMONADE-RUNTIME-IDENTITY.json"
set "E4_FILE=%RUNROOT%\E4-SPECIALIST-v2-FROZEN.jsonl"
set "E5_FILE=%RUNROOT%\E5-PANEL-v2-FROZEN.jsonl"
set "STATUS_FILE=%RUNROOT%\BLIND-RUN-STATUS.json"

if exist "%EVIDENCE%" rmdir /s /q "%EVIDENCE%"
mkdir "%EVIDENCE%" || exit /b 80
mkdir "%STAGE%" || exit /b 81

for /f %%S in ('git rev-parse HEAD') do set "ACTUAL_COMMIT=%%S"
if not defined ACTUAL_COMMIT exit /b 82

(
 echo objective=%OBJECTIVE%
 echo repository=%GITHUB_REPOSITORY%
 echo commit=%ACTUAL_COMMIT%
 echo trigger_commit=%GITHUB_SHA%
 echo runner=%RUNNER_NAME%
 echo machine=%COMPUTERNAME%
 echo source=repository_authoritative_package_v2
 echo predecessor_state_probe_run=34166970629
 echo predecessor_state_probe_commit=719819c6dd0dea1594a95f76adaf20d80ea747d4
 echo predecessor_state_probe_qualification=PASS_RESUMABLE_STATE_E4_160_UNCHANGED_E5_117
 echo scoring_private_accessed=false
 echo powershell_used=false
 echo lemonade_cli_required=false
 echo preexisting_e4_required=160
 echo preexisting_e5_required=117
 echo remaining_e5_at_start=43
 echo expected_e4_sha256=%EXPECTED_E4_SHA%
)>"%SUMMARY%"

if /I not "%RUNNER_OS%"=="Windows" (set "FAIL=runner_os_mismatch" & goto :fail)
if /I not "%RUNNER_ARCH%"=="X64" (set "FAIL=runner_arch_mismatch" & goto :fail)
if not exist "%RUNROOT%" (set "FAIL=persistent_runroot_missing" & goto :fail)
if exist "%RUNROOT%\scoring-private" (set "FAIL=scoring_private_material_present_in_runroot" & goto :fail)
if exist "%RUNROOT%\BOOK_EVAL_SCORING_PRIVATE_v2.zip" (set "FAIL=scoring_private_zip_present_in_runroot" & goto :fail)
if exist "%BUNDLE%\scoring-private" (set "FAIL=scoring_private_material_present_in_repository" & goto :fail)
if exist "%BUNDLE%\BOOK_EVAL_SCORING_PRIVATE_v2.zip" (set "FAIL=scoring_private_zip_present_in_repository" & goto :fail)

call :reconstruct "%BUNDLE%\jar-base64-v2" 41 "%STAGE%\book-eval-lemonade.jar" "%EXPECTED_JAR_SHA%" jar
if errorlevel 1 goto :fail
call :reconstruct "%BUNDLE%\provider-visible-corpus-base64-v2" 15 "%STAGE%\BOOK-EVAL-CORPUS-INPUT-v2.jsonl" "%EXPECTED_CORPUS_SHA%" corpus
if errorlevel 1 goto :fail
call :reconstruct "%BUNDLE%\provider-ontology-base64-v2" 1 "%STAGE%\BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json" "%EXPECTED_ONTOLOGY_SHA%" ontology
if errorlevel 1 goto :fail
call :reconstruct "%BUNDLE%\runner-private-base64-v2" 9 "%STAGE%\RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json" "%EXPECTED_EXEC_SHA%" execution_manifest
if errorlevel 1 goto :fail

echo frozen_inputs_hash_verified=4/4>>"%SUMMARY%"

if not exist "%E4_FILE%" (set "FAIL=e4_frozen_output_missing" & goto :fail)
if not exist "%E5_FILE%" (set "FAIL=e5_frozen_output_missing" & goto :fail)
for /f %%C in ('find /c /v "" ^< "%E4_FILE%"') do set "E4_BEFORE=%%C"
for /f %%C in ('find /c /v "" ^< "%E5_FILE%"') do set "E5_BEFORE=%%C"
if not "!E4_BEFORE!"=="160" (set "FAIL=e4_precondition_not_160" & goto :fail)
if not "!E5_BEFORE!"=="117" (set "FAIL=e5_precondition_not_117" & goto :fail)
certutil -hashfile "%E4_FILE%" SHA256 >"%EVIDENCE%\e4-before-sha256.txt" 2>&1 || (set "FAIL=e4_before_hash_failed" & goto :fail)
findstr /i /c:"%EXPECTED_E4_SHA%" "%EVIDENCE%\e4-before-sha256.txt" >nul || (set "FAIL=e4_before_hash_mismatch" & goto :fail)
certutil -hashfile "%E5_FILE%" SHA256 >"%EVIDENCE%\e5-before-sha256.txt" 2>&1 || (set "FAIL=e5_before_hash_failed" & goto :fail)

echo e4_before_cases=!E4_BEFORE!>>"%SUMMARY%"
echo e5_before_cases=!E5_BEFORE!>>"%SUMMARY%"
echo e4_before_sha256=%EXPECTED_E4_SHA%>>"%SUMMARY%"

where java.exe >"%EVIDENCE%\java-path.txt" 2>&1 || (set "FAIL=java_missing" & goto :fail)
java -version >"%EVIDENCE%\java-version.txt" 2>&1 || (set "FAIL=java_version_failed" & goto :fail)
java -cp "%STAGE%\book-eval-lemonade.jar" org.systemmaster.tools.booklab.BookEvalLemonade001ContractTests >"%EVIDENCE%\contract-tests.txt" 2>&1 || (set "FAIL=contract_tests_failed" & goto :fail)
findstr /x /c:"BOOK-EVAL-LEMONADE-001 CONTRACT PASS 10/10" "%EVIDENCE%\contract-tests.txt" >nul || (set "FAIL=contract_marker_missing" & goto :fail)
echo contract_tests=PASS_10_OF_10>>"%SUMMARY%"

where curl.exe >"%EVIDENCE%\curl-path.txt" 2>&1 || (set "FAIL=curl_missing" & goto :fail)
curl.exe --fail --silent --show-error "%API_BASE%/v1/models/%MODEL%" -o "%EVIDENCE%\model-registry.json" || (set "FAIL=model_registry_failed" & goto :fail)
findstr /c:"%EXPECTED_CHECKPOINT%" "%EVIDENCE%\model-registry.json" >nul || (set "FAIL=checkpoint_identity_mismatch" & goto :fail)
curl.exe --fail --silent --show-error -X POST "%API_BASE%/v1/load" -H "Content-Type: application/json" --data-binary "@%BUNDLE%\lemonade-load-request.json" -o "%EVIDENCE%\model-load.json" || (set "FAIL=model_load_failed" & goto :fail)
findstr /i /c:"success" "%EVIDENCE%\model-load.json" >nul || (set "FAIL=model_load_marker_missing" & goto :fail)
echo lemonade_http_load_verified=true>>"%SUMMARY%"

(
 echo {
 echo   "packet_id":"BOOK-EVAL-LEMONADE-001",
 echo   "provider_kind":"LEMONADE_LOCAL",
 echo   "endpoint":"http://127.0.0.1:13305/v1/responses",
 echo   "model_request_id":"user.gpt-oss-120b-MXFP4",
 echo   "registry_checkpoint":"ggml-org/gpt-oss-120b-GGUF:MXFP4",
 echo   "runtime_snapshot_commit":"238abdd290bb874b90a5da1b4549881b7d05c091",
 echo   "primary_file":"gpt-oss-120b-MXFP4.gguf",
 echo   "upstream_model_sha256":"582bd40f6886200101f4c4ed9f25f3fe80cc14c86e9e2b37746cd8904a0c622d",
 echo   "upstream_model_bytes":63387346208,
 echo   "upstream_xet_hash":"6fe6de3e0f6984269f0fdc61c16f2a464d8f499454713b686ee2a7628926bfd7",
 echo   "weight_binding_method":"UPSTREAM_SHA256_PLUS_RUNTIME_SNAPSHOT_PATH",
 echo   "local_rehash_by_github_runner":false,
 echo   "qualification_context_size":4096,
 echo   "max_output_tokens":1200,
 echo   "temperature":0.0,
 echo   "max_attempts":3,
 echo   "provider_visible_corpus_sha256":"30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53",
 echo   "provider_ontology_sha256":"3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6",
 echo   "runner_private_execution_manifest_sha256":"7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06"
 echo }
)>"%IDENTITY%"

set "BOOK_EVAL_PROVIDER_KIND=LEMONADE"
set "BOOK_EVAL_MODEL=%MODEL%"
set "BOOK_EVAL_ENDPOINT=%RESPONSES_ENDPOINT%"
set "BOOK_EVAL_RUNTIME_IDENTITY_FILE=%IDENTITY%"
set "BOOK_EVAL_MAX_OUTPUT_TOKENS=1200"
set "BOOK_EVAL_TEMPERATURE=0"
set "BOOK_EVAL_MAX_ATTEMPTS=3"
set "BOOK_EVAL_MAX_PROVIDER_CALLS=700"

set /a PASS=0
set /a RECOVERABLE_EXITS=0
:resume_pass
set /a PASS+=1
if !PASS! GTR 12 goto :incomplete

echo resume_pass=!PASS!>>"%SUMMARY%"
java -cp "%STAGE%\book-eval-lemonade.jar" org.systemmaster.tools.booklab.BookEvalProvider001AV2BlindRun "%STAGE%\BOOK-EVAL-CORPUS-INPUT-v2.jsonl" "%STAGE%\BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json" "%STAGE%\RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json" "%RUNROOT%" >"%EVIDENCE%\resume-pass-!PASS!.log" 2>&1
set "JAVA_EXIT=!ERRORLEVEL!"
echo resume_pass_!PASS!_java_exit=!JAVA_EXIT!>>"%SUMMARY%"

for /f %%C in ('find /c /v "" ^< "%E4_FILE%"') do set "E4_NOW=%%C"
for /f %%C in ('find /c /v "" ^< "%E5_FILE%"') do set "E5_NOW=%%C"
echo resume_pass_!PASS!_e4_cases=!E4_NOW!>>"%SUMMARY%"
echo resume_pass_!PASS!_e5_cases=!E5_NOW!>>"%SUMMARY%"

if not "!E4_NOW!"=="160" (set "FAIL=e4_count_changed_during_resume" & goto :fail)
certutil -hashfile "%E4_FILE%" SHA256 >"%EVIDENCE%\e4-pass-!PASS!-sha256.txt" 2>&1 || (set "FAIL=e4_hash_failed_during_resume" & goto :fail)
findstr /i /c:"%EXPECTED_E4_SHA%" "%EVIDENCE%\e4-pass-!PASS!-sha256.txt" >nul || (set "FAIL=e4_bytes_changed_during_resume" & goto :fail)

if "!E5_NOW!"=="160" goto :complete
if !E5_NOW! GTR 160 (set "FAIL=e5_count_exceeded_160" & goto :fail)
if !E5_NOW! LSS 117 (set "FAIL=e5_count_regressed_below_117" & goto :fail)
if not "!JAVA_EXIT!"=="0" (
  set /a RECOVERABLE_EXITS+=1
  echo resume_pass_!PASS!_provider_or_evaluator_exit=RECORDED_RESUMABLE>>"%SUMMARY%"
)
ping 127.0.0.1 -n 2 >nul
goto :resume_pass

:complete
certutil -hashfile "%E5_FILE%" SHA256 >"%EVIDENCE%\e5-final-sha256.txt" 2>&1 || (set "FAIL=e5_final_hash_failed" & goto :fail)
if exist "%STATUS_FILE%" copy /y "%STATUS_FILE%" "%EVIDENCE%\BLIND-RUN-STATUS.json" >nul
for /f %%C in ('find /c /v "" ^< "%E4_FILE%"') do set "E4_FINAL=%%C"
for /f %%C in ('find /c /v "" ^< "%E5_FILE%"') do set "E5_FINAL=%%C"
(
 echo e4_final_cases=!E4_FINAL!
 echo e5_final_cases=!E5_FINAL!
 echo e4_unchanged=true
 echo e5_added_this_objective=43
 echo recoverable_provider_or_evaluator_exits=!RECOVERABLE_EXITS!
 echo blind_outputs_frozen=true
 echo gold_scoring_performed=false
 echo qualification=PASS_BLIND_RESUME_002_E5_COMPLETE
)>>"%SUMMARY%"
type "%SUMMARY%"
exit /b 0

:incomplete
set "FAIL=e5_not_complete_after_12_resumable_passes_from_117"
goto :fail

:reconstruct
set "PART_DIR=%~1"
set "EXPECTED_COUNT=%~2"
set "TARGET_FILE=%~3"
set "EXPECTED_SHA=%~4"
set "LABEL=%~5"
if not exist "!PART_DIR!" (set "FAIL=!LABEL!_parts_missing" & exit /b 1)
set "LIST_FILE=%EVIDENCE%\!LABEL!-parts.txt"
dir /b /a-d /on "!PART_DIR!\part-*" >"!LIST_FILE!" 2>nul
if errorlevel 1 (set "FAIL=!LABEL!_parts_list_failed" & exit /b 1)
for /f %%C in ('find /c /v "" ^< "!LIST_FILE!"') do set "ACTUAL_COUNT=%%C"
if not "!ACTUAL_COUNT!"=="!EXPECTED_COUNT!" (set "FAIL=!LABEL!_part_count" & exit /b 1)
set "B64_FILE=%EVIDENCE%\!LABEL!.b64"
type nul >"!B64_FILE!"
for /f "usebackq delims=" %%F in ("!LIST_FILE!") do type "!PART_DIR!\%%F" >>"!B64_FILE!"
certutil -decode "!B64_FILE!" "!TARGET_FILE!" >"%EVIDENCE%\decode-!LABEL!.txt" 2>&1
if errorlevel 1 (set "FAIL=!LABEL!_decode_failed" & exit /b 1)
certutil -hashfile "!TARGET_FILE!" SHA256 >"%EVIDENCE%\hash-!LABEL!.txt" 2>&1
if errorlevel 1 (set "FAIL=!LABEL!_hash_failed" & exit /b 1)
findstr /i /c:"!EXPECTED_SHA!" "%EVIDENCE%\hash-!LABEL!.txt" >nul
if errorlevel 1 (set "FAIL=!LABEL!_sha_mismatch" & exit /b 1)
echo !LABEL!_sha256=!EXPECTED_SHA!>>"%SUMMARY%"
echo !LABEL!_part_count=!ACTUAL_COUNT!>>"%SUMMARY%"
exit /b 0

:fail
(
 echo failure=!FAIL!
 echo qualification=FAIL_BLIND_RESUME_002
)>>"%SUMMARY%"
type "%SUMMARY%"
exit /b 1
