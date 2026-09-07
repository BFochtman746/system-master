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

if /I not "%RUNNER_OS%"=="Windows" (echo ERROR: runner_os=%RUNNER_OS% & goto :fail)
if /I not "%RUNNER_ARCH%"=="X64" (echo ERROR: runner_arch=%RUNNER_ARCH% & goto :fail)

set "JAR_B64=%EVIDENCE_DIR%\book-eval-lemonade.jar.b64"
set "JAR_WORK=%EVIDENCE_DIR%\book-eval-lemonade.jar"
copy /b "%BUNDLE%\jar-base64\chunk-00"+"%BUNDLE%\jar-base64\chunk-01"+"%BUNDLE%\jar-base64\chunk-02"+"%BUNDLE%\jar-base64\chunk-03"+"%BUNDLE%\jar-base64\chunk-04"+"%BUNDLE%\jar-base64\chunk-05"+"%BUNDLE%\jar-base64\chunk-06"+"%BUNDLE%\jar-base64\chunk-07"+"%BUNDLE%\jar-base64\chunk-08"+"%BUNDLE%\jar-base64\chunk-09"+"%BUNDLE%\jar-base64\chunk-10"+"%BUNDLE%\jar-base64\chunk-11"+"%BUNDLE%\jar-base64\chunk-12"+"%BUNDLE%\jar-base64\chunk-13"+"%BUNDLE%\jar-base64\chunk-14"+"%BUNDLE%\jar-base64\chunk-15"+"%BUNDLE%\jar-base64\chunk-16"+"%BUNDLE%\jar-base64\chunk-17"+"%BUNDLE%\jar-base64\chunk-18"+"%BUNDLE%\jar-base64\chunk-19"+"%BUNDLE%\jar-base64\chunk-20" "%JAR_B64%" >"%EVIDENCE_DIR%\jar-copy.txt" 2>&1
if errorlevel 1 (type "%EVIDENCE_DIR%\jar-copy.txt" & goto :fail)
certutil -decode "%JAR_B64%" "%JAR_WORK%" >"%EVIDENCE_DIR%\jar-decode.txt" 2>&1
if errorlevel 1 (type "%EVIDENCE_DIR%\jar-decode.txt" & goto :fail)
call :verify_sha "%JAR_WORK%" "fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248" "jar"
if errorlevel 1 goto :fail

where java.exe >"%EVIDENCE_DIR%\java-path.txt" 2>&1
if errorlevel 1 (echo ERROR: java.exe not found & goto :fail)
java -version >"%EVIDENCE_DIR%\java-version.txt" 2>&1
if errorlevel 1 (echo ERROR: java -version failed & goto :fail)
java -cp "%JAR_WORK%" org.systemmaster.tools.booklab.BookEvalLemonade001ContractTests >"%EVIDENCE_DIR%\java-contract-tests.txt" 2>&1
if errorlevel 1 (type "%EVIDENCE_DIR%\java-contract-tests.txt" & goto :fail)
findstr /x /c:"BOOK-EVAL-LEMONADE-001 CONTRACT PASS 10/10" "%EVIDENCE_DIR%\java-contract-tests.txt" >nul
if errorlevel 1 (echo ERROR: Java contract success marker missing & goto :fail)

echo java_contract_10_of_10=true>>"%EVIDENCE_DIR%\route-smoke-summary.txt"

where lemonade.exe >"%EVIDENCE_DIR%\lemonade-path.txt" 2>&1
if errorlevel 1 where lemonade >"%EVIDENCE_DIR%\lemonade-path.txt" 2>&1
if errorlevel 1 (echo ERROR: Lemonade CLI not found & goto :fail)
lemonade --version >"%EVIDENCE_DIR%\lemonade-version.txt" 2>&1
if errorlevel 1 (type "%EVIDENCE_DIR%\lemonade-version.txt" & goto :fail)

where curl.exe >"%EVIDENCE_DIR%\curl-path.txt" 2>&1
if errorlevel 1 (echo ERROR: curl.exe not found & goto :fail)
curl.exe --fail --silent --show-error "%API_BASE%/v1/models/%MODEL_ID%" -o "%EVIDENCE_DIR%\model-registry.json"
if errorlevel 1 (echo ERROR: Lemonade model registry query failed & goto :fail)
findstr /c:"%EXPECTED_CHECKPOINT%" "%EVIDENCE_DIR%\model-registry.json" >nul
if errorlevel 1 (echo ERROR: exact checkpoint missing from Lemonade registry response & goto :fail)

lemonade load %MODEL_ID% --ctx-size 4096 >"%EVIDENCE_DIR%\lemonade-load.txt" 2>&1
if errorlevel 1 (type "%EVIDENCE_DIR%\lemonade-load.txt" & goto :fail)

set "MODEL_REPO_ROOT=%USERPROFILE%\.cache\huggingface\hub\models--ggml-org--gpt-oss-120b-GGUF"
set "MODEL_REF_FILE=%MODEL_REPO_ROOT%\refs\main"
if not exist "%MODEL_REF_FILE%" (echo ERROR: bounded Hugging Face refs\main missing & goto :fail)
set /p MODEL_SNAPSHOT=<"%MODEL_REF_FILE%"
if not defined MODEL_SNAPSHOT (echo ERROR: Hugging Face refs\main empty & goto :fail)
set "MODEL_PATH=%MODEL_REPO_ROOT%\snapshots\%MODEL_SNAPSHOT%\%EXPECTED_MODEL_FILE%"
if not exist "%MODEL_PATH%" (echo ERROR: exact model GGUF missing from active snapshot & goto :fail)
for %%F in ("%MODEL_PATH%") do set "MODEL_BYTES=%%~zF"
if not "%MODEL_BYTES%"=="%EXPECTED_MODEL_BYTES%" (echo ERROR: model bytes=%MODEL_BYTES% expected=%EXPECTED_MODEL_BYTES% & goto :fail)
certutil -hashfile "%MODEL_PATH%" SHA256 >"%EVIDENCE_DIR%\model-sha256.txt" 2>&1
if errorlevel 1 (type "%EVIDENCE_DIR%\model-sha256.txt" & goto :fail)

echo model_request_id=%MODEL_ID%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo checkpoint=%EXPECTED_CHECKPOINT%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo model_snapshot=%MODEL_SNAPSHOT%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo model_file=%EXPECTED_MODEL_FILE%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo model_bytes=%MODEL_BYTES%>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo exact_model_sha256_recorded=true>>"%EVIDENCE_DIR%\route-smoke-summary.txt"

curl.exe --fail --silent --show-error -X POST "%API_BASE%/v1/responses" -H "Content-Type: application/json" --data-binary "@%BUNDLE%\smoke-request.json" -o "%EVIDENCE_DIR%\smoke-response.json"
if errorlevel 1 (echo ERROR: Lemonade Responses smoke failed & goto :fail)
findstr /c:"completed" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (echo ERROR: completed status missing & goto :fail)
findstr /c:"output_text" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (echo ERROR: output_text missing & goto :fail)
findstr /c:"%EXPECTED_MODEL_FILE%" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (echo ERROR: exact model filename missing from response identity & goto :fail)

echo lemonade_registry_verified=true>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo lemonade_load_verified=true>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo responses_round_trip_verified=true>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
echo qualification=PASS_ROUTE_SMOKE>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
type "%EVIDENCE_DIR%\route-smoke-summary.txt"
exit /b 0

:verify_sha
set "HASH_FILE=%~1"
set "HASH_EXPECTED=%~2"
set "HASH_LABEL=%~3"
if not exist "%HASH_FILE%" (echo ERROR: missing %HASH_LABEL% file & exit /b 1)
certutil -hashfile "%HASH_FILE%" SHA256 >"%EVIDENCE_DIR%\hash-%HASH_LABEL%.txt" 2>&1
if errorlevel 1 (type "%EVIDENCE_DIR%\hash-%HASH_LABEL%.txt" & exit /b 1)
findstr /i /x /c:"%HASH_EXPECTED%" "%EVIDENCE_DIR%\hash-%HASH_LABEL%.txt" >nul
if errorlevel 1 (echo ERROR: SHA-256 mismatch for %HASH_LABEL% & type "%EVIDENCE_DIR%\hash-%HASH_LABEL%.txt" & exit /b 1)
exit /b 0

:fail
echo qualification=FAIL_ROUTE_SMOKE>>"%EVIDENCE_DIR%\route-smoke-summary.txt"
type "%EVIDENCE_DIR%\route-smoke-summary.txt"
exit /b 1
