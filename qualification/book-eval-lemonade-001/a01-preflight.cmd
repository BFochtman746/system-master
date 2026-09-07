@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "OBJECTIVE=BOOK-EVAL-LEMONADE-001-REPO-BIND-001"
set "MODEL_ID=user.gpt-oss-120b-MXFP4"
set "EXPECTED_CHECKPOINT=ggml-org/gpt-oss-120b-GGUF:MXFP4"
set "EXPECTED_MODEL_FILE=gpt-oss-120b-MXFP4.gguf"
set "EXPECTED_MODEL_BYTES=63387346208"
set "API_BASE=http://127.0.0.1:13305"
set "RESPONSES_ENDPOINT=%API_BASE%/v1/responses"
set "BUNDLE=%GITHUB_WORKSPACE%\qualification\book-eval-lemonade-001"
set "EVIDENCE_DIR=%RUNNER_TEMP%\book-eval-lemonade-001-preflight-%GITHUB_RUN_ID%"

if not exist "%EVIDENCE_DIR%" mkdir "%EVIDENCE_DIR%"
if errorlevel 1 goto :fail

echo objective=%OBJECTIVE%>"%EVIDENCE_DIR%\preflight-summary.txt"
echo repository=%GITHUB_REPOSITORY%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo commit=%GITHUB_SHA%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo runner_os=%RUNNER_OS%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo runner_arch=%RUNNER_ARCH%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo model_request_id=%MODEL_ID%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo expected_checkpoint=%EXPECTED_CHECKPOINT%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo expected_model_file=%EXPECTED_MODEL_FILE%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo expected_model_bytes=%EXPECTED_MODEL_BYTES%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo scoring_private_present=false>>"%EVIDENCE_DIR%\preflight-summary.txt"

if /I not "%RUNNER_OS%"=="Windows" (echo ERROR: runner_os=%RUNNER_OS% & goto :fail)
if /I not "%RUNNER_ARCH%"=="X64" (echo ERROR: runner_arch=%RUNNER_ARCH% & goto :fail)

set "JAR_B64=%EVIDENCE_DIR%\book-eval-lemonade.jar.b64"
set "JAR_WORK=%EVIDENCE_DIR%\book-eval-lemonade.jar"
copy /b "%BUNDLE%\jar-base64\part-000.b64"+"%BUNDLE%\jar-base64\part-001.b64"+"%BUNDLE%\jar-base64\part-002.b64"+"%BUNDLE%\jar-base64\part-003.b64" "%JAR_B64%" >"%EVIDENCE_DIR%\jar-reconstruct-copy.txt" 2>&1
if errorlevel 1 (type "%EVIDENCE_DIR%\jar-reconstruct-copy.txt" & goto :fail)
certutil -decode "%JAR_B64%" "%JAR_WORK%" >"%EVIDENCE_DIR%\jar-reconstruct-decode.txt" 2>&1
if errorlevel 1 (type "%EVIDENCE_DIR%\jar-reconstruct-decode.txt" & goto :fail)
call :verify_sha "%JAR_WORK%" "fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248" "jar"
if errorlevel 1 goto :fail

where java.exe >"%EVIDENCE_DIR%\java-path.txt" 2>&1
if errorlevel 1 (echo ERROR: java.exe not found & goto :fail)
java -version >"%EVIDENCE_DIR%\java-version.txt" 2>&1
if errorlevel 1 (echo ERROR: java -version failed & goto :fail)
java -cp "%JAR_WORK%" org.systemmaster.tools.booklab.BookEvalLemonade001ContractTests >"%EVIDENCE_DIR%\java-contract-tests.txt" 2>&1
if errorlevel 1 (type "%EVIDENCE_DIR%\java-contract-tests.txt" & goto :fail)
findstr /x /c:"BOOK-EVAL-LEMONADE-001 CONTRACT PASS 10/10" "%EVIDENCE_DIR%\java-contract-tests.txt" >nul
if errorlevel 1 (echo ERROR: Java contract test success marker missing & goto :fail)
call :verify_sha "%BUNDLE%\provider-visible\BOOK-EVAL-CORPUS-INPUT-v2.jsonl" "30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53" "corpus"
if errorlevel 1 goto :fail
call :verify_sha "%BUNDLE%\provider-visible\BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json" "3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6" "ontology"
if errorlevel 1 goto :fail
call :verify_sha "%BUNDLE%\runner-private\RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json" "7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06" "execution-manifest"
if errorlevel 1 goto :fail

if exist "%BUNDLE%\scoring-private" (echo ERROR: scoring-private directory must not exist & goto :fail)
if exist "%BUNDLE%\BOOK_EVAL_SCORING_PRIVATE_v2.zip" (echo ERROR: scoring-private package must not exist & goto :fail)

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
if errorlevel 1 (echo ERROR: expected checkpoint not present in Lemonade registry response & goto :fail)
findstr /c:"59.0" "%EVIDENCE_DIR%\model-registry.json" >nul
if errorlevel 1 (echo ERROR: expected 59.0 GB registry size marker missing & goto :fail)

lemonade load %MODEL_ID% --ctx-size 4096 >"%EVIDENCE_DIR%\lemonade-load.txt" 2>&1
if errorlevel 1 (type "%EVIDENCE_DIR%\lemonade-load.txt" & goto :fail)
findstr /i /c:"loaded successfully" "%EVIDENCE_DIR%\lemonade-load.txt" >nul
if errorlevel 1 (echo ERROR: Lemonade load success marker missing & goto :fail)

set "MODEL_ROOT=%USERPROFILE%\.cache\huggingface\hub\models--ggml-org--gpt-oss-120b-GGUF\snapshots"
if not exist "%MODEL_ROOT%" (echo ERROR: expected bounded Hugging Face model root missing & goto :fail)
set "MODEL_PATH="
for /r "%MODEL_ROOT%" %%F in (%EXPECTED_MODEL_FILE%) do if not defined MODEL_PATH set "MODEL_PATH=%%F"
if not defined MODEL_PATH (echo ERROR: exact model GGUF not found under bounded model root & goto :fail)
for %%F in ("%MODEL_PATH%") do set "MODEL_BYTES=%%~zF"
if not "%MODEL_BYTES%"=="%EXPECTED_MODEL_BYTES%" (echo ERROR: model bytes=%MODEL_BYTES% expected=%EXPECTED_MODEL_BYTES% & goto :fail)

echo model_path=%MODEL_PATH%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo model_bytes=%MODEL_BYTES%>>"%EVIDENCE_DIR%\preflight-summary.txt"
certutil -hashfile "%MODEL_PATH%" SHA256 >"%EVIDENCE_DIR%\model-sha256.txt" 2>&1
if errorlevel 1 (type "%EVIDENCE_DIR%\model-sha256.txt" & goto :fail)

curl.exe --fail --silent --show-error -X POST "%RESPONSES_ENDPOINT%" -H "Content-Type: application/json" --data-binary "@%BUNDLE%\smoke-request.json" -o "%EVIDENCE_DIR%\smoke-response.json"
if errorlevel 1 (echo ERROR: Lemonade responses smoke request failed & goto :fail)
findstr /c:"status" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (echo ERROR: status field missing from smoke response & goto :fail)
findstr /c:"completed" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (echo ERROR: completed status missing from smoke response & goto :fail)
findstr /c:"output_text" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (echo ERROR: output_text missing from smoke response & goto :fail)
findstr /c:"%EXPECTED_MODEL_FILE%" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (echo ERROR: exact model filename missing from smoke response identity & goto :fail)

echo model_registry_verified=true>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo model_load_verified=true>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo exact_model_file_verified=true>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo exact_model_sha256_recorded=true>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo responses_output_text_verified=true>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo blind_e4_e5_executed=false>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo qualification=PASS_A01_PREFLIGHT>>"%EVIDENCE_DIR%\preflight-summary.txt"
type "%EVIDENCE_DIR%\preflight-summary.txt"
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
echo qualification=FAIL_A01_PREFLIGHT>>"%EVIDENCE_DIR%\preflight-summary.txt"
type "%EVIDENCE_DIR%\preflight-summary.txt"
exit /b 1
