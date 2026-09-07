@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "OBJECTIVE=BOOK-EVAL-LEMONADE-001-REPO-BIND-001-PACKAGE-V2-REBUILD"
set "MODEL=user.gpt-oss-120b-MXFP4"
set "EXPECTED_CHECKPOINT=ggml-org/gpt-oss-120b-GGUF:MXFP4"
set "EXPECTED_MODEL_FILE=gpt-oss-120b-MXFP4.gguf"
set "EXPECTED_JAR_SHA=fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248"
set "EXPECTED_CORPUS_SHA=30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53"
set "EXPECTED_ONTOLOGY_SHA=3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6"
set "EXPECTED_EXEC_SHA=7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06"
set "EXPECTED_UPSTREAM_MODEL_SHA=582bd40f6886200101f4c4ed9f25f3fe80cc14c86e9e2b37746cd8904a0c622d"
set "API_BASE=http://127.0.0.1:13305"
set "BUNDLE=%GITHUB_WORKSPACE%\qualification\book-eval-lemonade-001"
set "EVIDENCE_DIR=%RUNNER_TEMP%\book-eval-lemonade-001-preflight-%GITHUB_RUN_ID%"
set "STAGE=%EVIDENCE_DIR%\frozen-inputs"

if not exist "%EVIDENCE_DIR%" mkdir "%EVIDENCE_DIR%"
if errorlevel 1 exit /b 1
if not exist "%STAGE%" mkdir "%STAGE%"
if errorlevel 1 exit /b 1

echo objective=%OBJECTIVE%>"%EVIDENCE_DIR%\preflight-summary.txt"
echo repository=%GITHUB_REPOSITORY%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo commit=%GITHUB_SHA%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo runner_name=%RUNNER_NAME%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo runner_os=%RUNNER_OS%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo runner_arch=%RUNNER_ARCH%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo source=repository_authoritative_package_v2>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo blind_e4_e5_executed=false>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo scoring_private_accessed=false>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo powershell_used=false>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo lemonade_cli_required=false>>"%EVIDENCE_DIR%\preflight-summary.txt"

if /I not "%RUNNER_OS%"=="Windows" (
  set "FAIL_REASON=runner_os_mismatch"
  goto :fail
)
if /I not "%RUNNER_ARCH%"=="X64" (
  set "FAIL_REASON=runner_arch_mismatch"
  goto :fail
)

if not exist "%BUNDLE%\PACKAGE-V2-REBUILD-MANIFEST.json" (
  set "FAIL_REASON=package_v2_manifest_missing"
  goto :fail
)
findstr /i /c:"%EXPECTED_JAR_SHA%" "%BUNDLE%\PACKAGE-V2-REBUILD-MANIFEST.json" >nul
if errorlevel 1 (
  set "FAIL_REASON=package_manifest_jar_identity"
  goto :fail
)
findstr /i /c:"%EXPECTED_CORPUS_SHA%" "%BUNDLE%\PACKAGE-V2-REBUILD-MANIFEST.json" >nul
if errorlevel 1 (
  set "FAIL_REASON=package_manifest_corpus_identity"
  goto :fail
)
findstr /i /c:"%EXPECTED_ONTOLOGY_SHA%" "%BUNDLE%\PACKAGE-V2-REBUILD-MANIFEST.json" >nul
if errorlevel 1 (
  set "FAIL_REASON=package_manifest_ontology_identity"
  goto :fail
)
findstr /i /c:"%EXPECTED_EXEC_SHA%" "%BUNDLE%\PACKAGE-V2-REBUILD-MANIFEST.json" >nul
if errorlevel 1 (
  set "FAIL_REASON=package_manifest_execution_identity"
  goto :fail
)

if exist "%BUNDLE%\scoring-private" (
  set "FAIL_REASON=repo_scoring_private_directory_present"
  goto :fail
)
if exist "%BUNDLE%\BOOK_EVAL_SCORING_PRIVATE_v2.zip" (
  set "FAIL_REASON=repo_scoring_private_zip_present"
  goto :fail
)
echo scoring_private_absent=true>>"%EVIDENCE_DIR%\preflight-summary.txt"

call :reconstruct "%BUNDLE%\jar-base64-v2" 41 "%STAGE%\book-eval-lemonade.jar" "%EXPECTED_JAR_SHA%" jar
if errorlevel 1 goto :fail
call :reconstruct "%BUNDLE%\provider-visible-corpus-base64-v2" 15 "%STAGE%\BOOK-EVAL-CORPUS-INPUT-v2.jsonl" "%EXPECTED_CORPUS_SHA%" corpus
if errorlevel 1 goto :fail
call :reconstruct "%BUNDLE%\provider-ontology-base64-v2" 1 "%STAGE%\BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json" "%EXPECTED_ONTOLOGY_SHA%" ontology
if errorlevel 1 goto :fail
call :reconstruct "%BUNDLE%\runner-private-base64-v2" 9 "%STAGE%\RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json" "%EXPECTED_EXEC_SHA%" execution_manifest
if errorlevel 1 goto :fail

echo frozen_inputs_hash_verified=true>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo frozen_inputs_source=repository_reconstruction_only>>"%EVIDENCE_DIR%\preflight-summary.txt"

where java.exe >"%EVIDENCE_DIR%\java-path.txt" 2>&1
if errorlevel 1 (
  set "FAIL_REASON=java_not_found"
  goto :fail
)
java -version >"%EVIDENCE_DIR%\java-version.txt" 2>&1
if errorlevel 1 (
  set "FAIL_REASON=java_version_failed"
  goto :fail
)
java -cp "%STAGE%\book-eval-lemonade.jar" org.systemmaster.tools.booklab.BookEvalLemonade001ContractTests >"%EVIDENCE_DIR%\contract-tests.txt" 2>&1
if errorlevel 1 (
  set "FAIL_REASON=contract_tests_exit"
  goto :fail
)
findstr /x /c:"BOOK-EVAL-LEMONADE-001 CONTRACT PASS 10/10" "%EVIDENCE_DIR%\contract-tests.txt" >nul
if errorlevel 1 (
  set "FAIL_REASON=contract_tests_expected_result"
  goto :fail
)
echo contract_tests=PASS_10_OF_10>>"%EVIDENCE_DIR%\preflight-summary.txt"

where curl.exe >"%EVIDENCE_DIR%\curl-path.txt" 2>&1
if errorlevel 1 (
  set "FAIL_REASON=curl_not_found"
  goto :fail
)

curl.exe --fail --silent --show-error "%API_BASE%/v1/models/%MODEL%" -o "%EVIDENCE_DIR%\model-metadata.json"
if errorlevel 1 (
  set "FAIL_REASON=model_metadata_request"
  goto :fail
)
findstr /c:"%EXPECTED_CHECKPOINT%" "%EVIDENCE_DIR%\model-metadata.json" >nul
if errorlevel 1 (
  set "FAIL_REASON=checkpoint_identity"
  goto :fail
)
findstr /c:"59.0" "%EVIDENCE_DIR%\model-metadata.json" >nul
if errorlevel 1 (
  set "FAIL_REASON=registry_size_identity"
  goto :fail
)
if not exist "%BUNDLE%\MODEL-ARTIFACT-REFERENCE.json" (
  set "FAIL_REASON=model_artifact_reference_missing"
  goto :fail
)
findstr /i /c:"%EXPECTED_UPSTREAM_MODEL_SHA%" "%BUNDLE%\MODEL-ARTIFACT-REFERENCE.json" >nul
if errorlevel 1 (
  set "FAIL_REASON=upstream_model_sha_reference"
  goto :fail
)

curl.exe --fail --silent --show-error -X POST "%API_BASE%/v1/load" -H "Content-Type: application/json" --data-binary "@%BUNDLE%\lemonade-load-request.json" -o "%EVIDENCE_DIR%\lemonade-load.json"
if errorlevel 1 (
  set "FAIL_REASON=lemonade_http_load_failed"
  goto :fail
)
findstr /i /c:"success" "%EVIDENCE_DIR%\lemonade-load.json" >nul
if errorlevel 1 (
  set "FAIL_REASON=lemonade_http_load_success_marker_missing"
  goto :fail
)
echo lemonade_http_load_verified=true>>"%EVIDENCE_DIR%\preflight-summary.txt"

curl.exe --fail --silent --show-error -X POST "%API_BASE%/v1/responses" -H "Content-Type: application/json" --data-binary "@%BUNDLE%\smoke-request.json" -o "%EVIDENCE_DIR%\smoke-response.json"
if errorlevel 1 (
  set "FAIL_REASON=responses_round_trip_failed"
  goto :fail
)
findstr /c:"completed" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (
  set "FAIL_REASON=response_completed_marker_missing"
  goto :fail
)
findstr /c:"output_text" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (
  set "FAIL_REASON=response_output_text_missing"
  goto :fail
)
findstr /c:"%EXPECTED_MODEL_FILE%" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (
  set "FAIL_REASON=response_model_identity_missing"
  goto :fail
)

echo model_request_id=%MODEL%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo checkpoint=%EXPECTED_CHECKPOINT%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo model_file=%EXPECTED_MODEL_FILE%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo upstream_model_sha256=%EXPECTED_UPSTREAM_MODEL_SHA%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo local_model_rehash=false>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo local_model_rehash_limitation=runner_service_identity_cannot_enumerate_interactive_user_cache>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo responses_round_trip_verified=true>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo qualification=PASS_A01_REPOSITORY_PACKAGE_V2_PREFLIGHT>>"%EVIDENCE_DIR%\preflight-summary.txt"
type "%EVIDENCE_DIR%\preflight-summary.txt"
exit /b 0

:reconstruct
set "PART_DIR=%~1"
set "EXPECTED_COUNT=%~2"
set "TARGET_FILE=%~3"
set "EXPECTED_SHA=%~4"
set "LABEL=%~5"
if not exist "%PART_DIR%" (
  set "FAIL_REASON=%LABEL%_parts_missing"
  exit /b 1
)
set "LIST_FILE=%EVIDENCE_DIR%\%LABEL%-parts.txt"
dir /b /a-d /on "%PART_DIR%\part-*" >"%LIST_FILE%" 2>nul
if errorlevel 1 (
  set "FAIL_REASON=%LABEL%_parts_list_failed"
  exit /b 1
)
for /f %%C in ('find /c /v "" ^< "%LIST_FILE%"') do set "ACTUAL_COUNT=%%C"
if not "%ACTUAL_COUNT%"=="%EXPECTED_COUNT%" (
  set "FAIL_REASON=%LABEL%_part_count"
  echo %LABEL%_part_count=%ACTUAL_COUNT%>>"%EVIDENCE_DIR%\preflight-summary.txt"
  exit /b 1
)
set "B64_FILE=%EVIDENCE_DIR%\%LABEL%.b64"
type nul >"%B64_FILE%"
for /f "usebackq delims=" %%F in ("%LIST_FILE%") do type "%PART_DIR%\%%F" >>"%B64_FILE%"
certutil -decode "%B64_FILE%" "%TARGET_FILE%" >"%EVIDENCE_DIR%\decode-%LABEL%.txt" 2>&1
if errorlevel 1 (
  set "FAIL_REASON=%LABEL%_decode"
  exit /b 1
)
certutil -hashfile "%TARGET_FILE%" SHA256 >"%EVIDENCE_DIR%\hash-%LABEL%.txt" 2>&1
if errorlevel 1 (
  set "FAIL_REASON=%LABEL%_hash_command"
  exit /b 1
)
findstr /i /c:"%EXPECTED_SHA%" "%EVIDENCE_DIR%\hash-%LABEL%.txt" >nul
if errorlevel 1 (
  set "FAIL_REASON=%LABEL%_hash_mismatch"
  exit /b 1
)
echo %LABEL%_part_count=%ACTUAL_COUNT%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo %LABEL%_sha256=%EXPECTED_SHA%>>"%EVIDENCE_DIR%\preflight-summary.txt"
exit /b 0

:fail
if not defined FAIL_REASON set "FAIL_REASON=unspecified"
echo failure_reason=%FAIL_REASON%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo qualification=FAIL_A01_REPOSITORY_PACKAGE_V2_PREFLIGHT>>"%EVIDENCE_DIR%\preflight-summary.txt"
type "%EVIDENCE_DIR%\preflight-summary.txt"
exit /b 1
