@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "OBJECTIVE=BOOK-EVAL-LEMONADE-001-FULL-BLIND-EXEC"
set "MODEL=user.gpt-oss-120b-MXFP4"
set "EXPECTED_CHECKPOINT=ggml-org/gpt-oss-120b-GGUF:MXFP4"
set "EXPECTED_RUNTIME_SNAPSHOT=238abdd290bb874b90a5da1b4549881b7d05c091"
set "EXPECTED_MODEL_FILE=gpt-oss-120b-MXFP4.gguf"
set "UPSTREAM_MODEL_SHA=582bd40f6886200101f4c4ed9f25f3fe80cc14c86e9e2b37746cd8904a0c622d"
set "UPSTREAM_MODEL_BYTES=63387346208"
set "UPSTREAM_XET_HASH=6fe6de3e0f6984269f0fdc61c16f2a464d8f499454713b686ee2a7628926bfd7"
set "EXPECTED_JAR_SHA=fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248"
set "EXPECTED_CORPUS_SHA=30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53"
set "EXPECTED_ONTOLOGY_SHA=3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6"
set "EXPECTED_EXEC_SHA=7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06"
set "SOURCE_ZIP=C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_RUNNER_JAVA25_HOTFIX.zip"
set "API_BASE=http://127.0.0.1:13305"
set "RESPONSES_ENDPOINT=%API_BASE%/v1/responses"
set "BUNDLE=%GITHUB_WORKSPACE%\qualification\book-eval-lemonade-001"
set "STAGE=%RUNNER_TEMP%\book-eval-lemonade-001-full-%GITHUB_RUN_ID%"
set "RUNROOT=C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_A01_BLIND_RUN_GPT_OSS_120B"
set "SUMMARY=%RUNROOT%\A01-EXECUTION-SUMMARY.txt"
set "IDENTITY=%RUNROOT%\LEMONADE-RUNTIME-IDENTITY.json"

if not exist "%SOURCE_ZIP%" goto :source_missing
if not exist "%STAGE%" mkdir "%STAGE%" || goto :stage_fail
where jar.exe >"%STAGE%\jar-path.txt" 2>&1 || goto :jar_tool_missing
pushd "%STAGE%"
jar xf "%SOURCE_ZIP%"
if errorlevel 1 (popd & goto :extract_fail)
popd
set "SOURCE=%STAGE%\delivery"
set "JAR=%SOURCE%\book-eval-lemonade.jar"
set "INPUT=%SOURCE%\provider-visible\BOOK-EVAL-CORPUS-INPUT-v2.jsonl"
set "ONTOLOGY=%SOURCE%\provider-visible\BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json"
set "EXEC=%SOURCE%\runner-private\RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json"

if not exist "%RUNROOT%" mkdir "%RUNROOT%" || goto :runroot_fail
(
 echo objective=%OBJECTIVE%
 echo repository=%GITHUB_REPOSITORY%
 echo workflow_commit=%GITHUB_SHA%
 echo runner=%RUNNER_NAME%
 echo machine=%COMPUTERNAME%
 echo provider=LEMONADE_LOCAL
 echo endpoint=%RESPONSES_ENDPOINT%
 echo model_request_id=%MODEL%
 echo scoring_private_accessed=false
 echo local_model_rehash_performed=false
 echo local_model_rehash_limitation=NETWORK_SERVICE cannot enumerate interactive-user Hugging Face cache; immutable upstream SHA plus Lemonade runtime snapshot/file identity is used.
)>"%SUMMARY%"

call :verify_sha "%JAR%" "%EXPECTED_JAR_SHA%" jar || goto :input_hash_fail
call :verify_sha "%INPUT%" "%EXPECTED_CORPUS_SHA%" corpus || goto :input_hash_fail
call :verify_sha "%ONTOLOGY%" "%EXPECTED_ONTOLOGY_SHA%" ontology || goto :input_hash_fail
call :verify_sha "%EXEC%" "%EXPECTED_EXEC_SHA%" execution_manifest || goto :input_hash_fail
echo frozen_input_hashes_verified=true>>"%SUMMARY%"

if exist "%SOURCE%\scoring-private" goto :gold_present
if exist "%SOURCE%\BOOK_EVAL_SCORING_PRIVATE_v2.zip" goto :gold_present
if exist "%BUNDLE%\scoring-private" goto :gold_present
if exist "%BUNDLE%\BOOK_EVAL_SCORING_PRIVATE_v2.zip" goto :gold_present
echo scoring_private_absent_from_execution_inputs=true>>"%SUMMARY%"

where java.exe >"%RUNROOT%\java-path.txt" 2>&1 || goto :java_missing
java -version >"%RUNROOT%\java-version.txt" 2>&1 || goto :java_fail
java -cp "%JAR%" org.systemmaster.tools.booklab.BookEvalLemonade001ContractTests >"%RUNROOT%\contract-tests.txt" 2>&1 || goto :contract_fail
findstr /x /c:"BOOK-EVAL-LEMONADE-001 CONTRACT PASS 10/10" "%RUNROOT%\contract-tests.txt" >nul || goto :contract_marker_fail
echo evaluator_contract_tests=PASS_10_OF_10>>"%SUMMARY%"

where curl.exe >"%RUNROOT%\curl-path.txt" 2>&1 || goto :curl_missing
curl.exe --fail --silent --show-error "%API_BASE%/v1/models/%MODEL%" -o "%RUNROOT%\model-registry.json" || goto :registry_fail
findstr /c:"%EXPECTED_CHECKPOINT%" "%RUNROOT%\model-registry.json" >nul || goto :checkpoint_fail
curl.exe --fail --silent --show-error -X POST "%API_BASE%/v1/load" -H "Content-Type: application/json" --data-binary "@%BUNDLE%\lemonade-load-request.json" -o "%RUNROOT%\model-load.json" || goto :load_fail
findstr /i /c:"success" "%RUNROOT%\model-load.json" >nul || goto :load_marker_fail
curl.exe --fail --silent --show-error -X POST "%RESPONSES_ENDPOINT%" -H "Content-Type: application/json" --data-binary "@%BUNDLE%\smoke-request.json" -o "%RUNROOT%\runtime-binding-smoke.json" || goto :smoke_fail
findstr /c:"%EXPECTED_RUNTIME_SNAPSHOT%" "%RUNROOT%\runtime-binding-smoke.json" >nul || goto :snapshot_fail
findstr /c:"%EXPECTED_MODEL_FILE%" "%RUNROOT%\runtime-binding-smoke.json" >nul || goto :model_file_fail
findstr /c:"MODEL_ROUTE_OK" "%RUNROOT%\runtime-binding-smoke.json" >nul || goto :smoke_output_fail
echo lemonade_route_verified=true>>"%SUMMARY%"
echo registry_checkpoint=%EXPECTED_CHECKPOINT%>>"%SUMMARY%"
echo runtime_snapshot_commit=%EXPECTED_RUNTIME_SNAPSHOT%>>"%SUMMARY%"
echo runtime_primary_file=%EXPECTED_MODEL_FILE%>>"%SUMMARY%"
echo upstream_model_sha256=%UPSTREAM_MODEL_SHA%>>"%SUMMARY%"
echo upstream_model_bytes=%UPSTREAM_MODEL_BYTES%>>"%SUMMARY%"
echo upstream_xet_hash=%UPSTREAM_XET_HASH%>>"%SUMMARY%"
echo model_weight_binding=UPSTREAM_SHA256_PLUS_RUNTIME_SNAPSHOT_PATH>>"%SUMMARY%"

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
:run_pass
set /a PASS+=1
echo blind_execution_pass=!PASS!>>"%SUMMARY%"
echo === Blind execution pass !PASS! ===
java -cp "%JAR%" org.systemmaster.tools.booklab.BookEvalProvider001AV2BlindRun "%INPUT%" "%ONTOLOGY%" "%EXEC%" "%RUNROOT%"
set "JAVA_EXIT=!ERRORLEVEL!"
echo pass_!PASS!_java_exit=!JAVA_EXIT!>>"%SUMMARY%"
if exist "%RUNROOT%\BLIND-RUN-STATUS.json" (
  findstr /c:"BLIND_OUTPUTS_FROZEN" "%RUNROOT%\BLIND-RUN-STATUS.json" >nul && goto :verify_complete
)
if !PASS! GEQ 6 goto :blind_incomplete
timeout /t 5 /nobreak >nul
goto :run_pass

:verify_complete
for /f %%C in ('find /c /v "" ^< "%RUNROOT%\E4-SPECIALIST-v2-FROZEN.jsonl"') do set "E4=%%C"
for /f %%C in ('find /c /v "" ^< "%RUNROOT%\E5-PANEL-v2-FROZEN.jsonl"') do set "E5=%%C"
echo e4_frozen_cases=!E4!>>"%SUMMARY%"
echo e5_frozen_cases=!E5!>>"%SUMMARY%"
if not "!E4!"=="160" goto :frozen_count_fail
if not "!E5!"=="160" goto :frozen_count_fail
echo blind_outputs_frozen=true>>"%SUMMARY%"
echo gold_scoring_performed=false>>"%SUMMARY%"
echo qualification=PASS_BLIND_EXECUTION_FROZEN>>"%SUMMARY%"
type "%SUMMARY%"
exit /b 0

:verify_sha
if not exist "%~1" exit /b 1
certutil -hashfile "%~1" SHA256 >"%RUNROOT%\hash-%~3.txt" 2>&1 || exit /b 1
findstr /i /c:"%~2" "%RUNROOT%\hash-%~3.txt" >nul || exit /b 1
exit /b 0

:source_missing
set "FAIL=canonical_source_zip_missing"
goto :fail_early
:stage_fail
set "FAIL=stage_create_failed"
goto :fail_early
:jar_tool_missing
set "FAIL=jar_tool_missing"
goto :fail_early
:extract_fail
set "FAIL=canonical_source_zip_extract_failed"
goto :fail_early
:runroot_fail
set "FAIL=runroot_create_failed"
goto :fail_early
:input_hash_fail
set "FAIL=canonical_frozen_input_hash_mismatch"
goto :fail
:gold_present
set "FAIL=scoring_private_material_present_in_execution_input"
goto :fail
:java_missing
set "FAIL=java_missing"
goto :fail
:java_fail
set "FAIL=java_version_failed"
goto :fail
:contract_fail
set "FAIL=evaluator_contract_tests_failed"
goto :fail
:contract_marker_fail
set "FAIL=evaluator_contract_success_marker_missing"
goto :fail
:curl_missing
set "FAIL=curl_missing"
goto :fail
:registry_fail
set "FAIL=lemonade_registry_request_failed"
goto :fail
:checkpoint_fail
set "FAIL=lemonade_checkpoint_identity_mismatch"
goto :fail
:load_fail
set "FAIL=lemonade_http_load_failed"
goto :fail
:load_marker_fail
set "FAIL=lemonade_http_load_success_marker_missing"
goto :fail
:smoke_fail
set "FAIL=runtime_binding_smoke_failed"
goto :fail
:snapshot_fail
set "FAIL=runtime_snapshot_commit_mismatch"
goto :fail
:model_file_fail
set "FAIL=runtime_model_file_mismatch"
goto :fail
:smoke_output_fail
set "FAIL=runtime_smoke_output_missing"
goto :fail
:blind_incomplete
set "FAIL=blind_execution_not_frozen_after_six_resumable_passes"
goto :fail
:frozen_count_fail
set "FAIL=frozen_output_count_mismatch"
goto :fail
:fail_early
if not exist "%RUNROOT%" mkdir "%RUNROOT%" >nul 2>&1
if not defined SUMMARY set "SUMMARY=%RUNROOT%\A01-EXECUTION-SUMMARY.txt"
:fail
echo failure=!FAIL!>>"%SUMMARY%"
echo qualification=FAIL_BLIND_EXECUTION>>"%SUMMARY%"
type "%SUMMARY%"
exit /b 1
