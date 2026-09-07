@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "OBJECTIVE=BOOK-EVAL-LEMONADE-001-ROUTE-SMOKE"
set "MODEL_ID=user.gpt-oss-120b-MXFP4"
set "EXPECTED_CHECKPOINT=ggml-org/gpt-oss-120b-GGUF:MXFP4"
set "EXPECTED_MODEL_FILE=gpt-oss-120b-MXFP4.gguf"
set "EXPECTED_MODEL_BYTES=63387346208"
set "API_BASE=http://127.0.0.1:13305"
set "BUNDLE=%GITHUB_WORKSPACE%\qualification\book-eval-lemonade-001"
set "EVIDENCE_DIR=%RUNNER_TEMP%\book-eval-lemonade-001-route-smoke-%GITHUB_RUN_ID%"

if not exist "%EVIDENCE_DIR%" mkdir "%EVIDENCE_DIR%"
if errorlevel 1 exit /b 1

echo objective=%OBJECTIVE%>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo repository=%GITHUB_REPOSITORY%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo commit=%GITHUB_SHA%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo workflow_sha=%GITHUB_WORKFLOW_SHA%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo runner_os=%RUNNER_OS%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo runner_arch=%RUNNER_ARCH%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo scoring_private_present=false>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo blind_e4_e5_executed=false>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo jar_contract_executed=false>>"%EVIDENCE_DIR%\route-smoke-summary.txt"

if /I not "%RUNNER_OS%"=="Windows" goto :bad_os
if /I not "%RUNNER_ARCH%"=="X64" goto :bad_arch

where java.exe >"%EVIDENCE_DIR%\java-path.txt" 2>&1
if errorlevel 1 goto :java_missing
java -version >"%EVIDENCE_DIR%\java-version.txt" 2>&1
if errorlevel 1 goto :java_failed
echo java_available=true>>"%EVIDENCE_DIR%\route-smoke-summary.txt"

where lemonade.exe >"%EVIDENCE_DIR%\lemonade-path.txt" 2>&1
if errorlevel 1 where lemonade >"%EVIDENCE_DIR%\lemonade-path.txt" 2>&1
if errorlevel 1 goto :lemonade_missing
lemonade --version >"%EVIDENCE_DIR%\lemonade-version.txt" 2>&1
if errorlevel 1 goto :lemonade_version_failed

where curl.exe >"%EVIDENCE_DIR%\curl-path.txt" 2>&1
if errorlevel 1 goto :curl_missing
curl.exe --fail --silent --show-error "%API_BASE%/v1/models/%MODEL_ID%" -o "%EVIDENCE_DIR%\model-registry.json"
if errorlevel 1 goto :registry_failed
findstr /c:"%EXPECTED_CHECKPOINT%" "%EVIDENCE_DIR%\model-registry.json" >nul
if errorlevel 1 goto :checkpoint_missing

echo lemonade_registry_verified=true>>"%EVIDENCE_DIR%\route-smoke-summary.txt"

lemonade load %MODEL_ID% --ctx-size 4096 >"%EVIDENCE_DIR%\lemonade-load.txt" 2>&1
if errorlevel 1 goto :load_failed
echo lemonade_load_verified=true>>"%EVIDENCE_DIR%\route-smoke-summary.txt"

set "MODEL_REPO_ROOT=%USERPROFILE%\.cache\huggingface\hub\models--ggml-org--gpt-oss-120b-GGUF"
set "MODEL_REF_FILE=%MODEL_REPO_ROOT%\refs\main"
if not exist "%MODEL_REF_FILE%" goto :model_ref_missing
set /p MODEL_SNAPSHOT=<"%MODEL_REF_FILE%"
if not defined MODEL_SNAPSHOT goto :model_ref_empty
set "MODEL_PATH=%MODEL_REPO_ROOT%\snapshots\%MODEL_SNAPSHOT%\%EXPECTED_MODEL_FILE%"
if not exist "%MODEL_PATH%" goto :model_file_missing
for %%F in ("%MODEL_PATH%") do set "MODEL_BYTES=%%~zF"
if not "%MODEL_BYTES%"=="%EXPECTED_MODEL_BYTES%" goto :model_size_wrong
certutil -hashfile "%MODEL_PATH%" SHA256 >"%EVIDENCE_DIR%\model-sha256.txt" 2>&1
if errorlevel 1 goto :model_hash_failed

echo model_request_id=%MODEL_ID%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo checkpoint=%EXPECTED_CHECKPOINT%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo model_snapshot=%MODEL_SNAPSHOT%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo model_file=%EXPECTED_MODEL_FILE%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo model_bytes=%MODEL_BYTES%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo exact_model_sha256_recorded=true>>"%EVIDENCE_DIR%\route-smoke-summary.txt"

curl.exe --fail --silent --show-error -X POST "%API_BASE%/v1/responses" -H "Content-Type: application/json" --data-binary "@%BUNDLE%\smoke-request.json" -o "%EVIDENCE_DIR%\smoke-response.json"
if errorlevel 1 goto :response_failed
findstr /c:"completed" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 goto :completed_missing
findstr /c:"output_text" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 goto :output_missing
findstr /c:"%EXPECTED_MODEL_FILE%" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 goto :response_identity_missing

echo responses_round_trip_verified=true>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo qualification=PASS_ROUTE_SMOKE>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
type "%EVIDENCE_DIR%\route-smoke-summary.txt"
exit /b 0

:bad_os
set "FAIL_REASON=runner_os_mismatch"
goto :fail
:bad_arch
set "FAIL_REASON=runner_arch_mismatch"
goto :fail
:java_missing
set "FAIL_REASON=java_not_found"
goto :fail
:java_failed
set "FAIL_REASON=java_version_failed"
goto :fail
:lemonade_missing
set "FAIL_REASON=lemonade_cli_not_found"
goto :fail
:lemonade_version_failed
set "FAIL_REASON=lemonade_version_failed"
goto :fail
:curl_missing
set "FAIL_REASON=curl_not_found"
goto :fail
:registry_failed
set "FAIL_REASON=lemonade_registry_query_failed"
goto :fail
:checkpoint_missing
set "FAIL_REASON=exact_checkpoint_missing"
goto :fail
:load_failed
set "FAIL_REASON=lemonade_model_load_failed"
goto :fail
:model_ref_missing
set "FAIL_REASON=bounded_hf_ref_missing"
goto :fail
:model_ref_empty
set "FAIL_REASON=bounded_hf_ref_empty"
goto :fail
:model_file_missing
set "FAIL_REASON=exact_model_file_missing"
goto :fail
:model_size_wrong
set "FAIL_REASON=exact_model_size_mismatch"
goto :fail
:model_hash_failed
set "FAIL_REASON=model_sha256_failed"
goto :fail
:response_failed
set "FAIL_REASON=responses_round_trip_failed"
goto :fail
:completed_missing
set "FAIL_REASON=response_completed_marker_missing"
goto :fail
:output_missing
set "FAIL_REASON=response_output_text_missing"
goto :fail
:response_identity_missing
set "FAIL_REASON=response_model_identity_missing"
goto :fail

:fail
echo failure_reason=%FAIL_REASON%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo qualification=FAIL_ROUTE_SMOKE>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
type "%EVIDENCE_DIR%\route-smoke-summary.txt"
exit /b 1
