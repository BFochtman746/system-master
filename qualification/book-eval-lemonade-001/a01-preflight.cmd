@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "OBJECTIVE=BOOK-EVAL-LEMONADE-001-REPO-BIND-001"
set "MODEL=user.gpt-oss-120b-MXFP4"
set "EXPECTED_CHECKPOINT=ggml-org/gpt-oss-120b-GGUF:MXFP4"
set "EXPECTED_MODEL_FILE=gpt-oss-120b-MXFP4.gguf"
set "EXPECTED_MODEL_BYTES=63387346208"
set "EXPECTED_JAR_SHA=fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248"
set "EXPECTED_CORPUS_SHA=30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53"
set "EXPECTED_ONTOLOGY_SHA=3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6"
set "EXPECTED_EXEC_SHA=7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06"
set "API_BASE=http://127.0.0.1:13305"
set "RESPONSES_ENDPOINT=%API_BASE%/v1/responses"
set "SOURCE_DIR="
set "SOURCE_CANDIDATE_1=C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_RUNNER_POWERSHELL_AUDITED\delivery"
set "SOURCE_CANDIDATE_2=C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_RUNNER_JAVA25_HOTFIX\delivery"
set "SOURCE_CANDIDATE_3=C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_RUNNER\delivery"
set "BUNDLE=%GITHUB_WORKSPACE%\qualification\book-eval-lemonade-001"
set "EVIDENCE_DIR=%RUNNER_TEMP%\book-eval-lemonade-001-preflight-%GITHUB_RUN_ID%"
set "STAGE=%EVIDENCE_DIR%\frozen-inputs"

if not exist "%EVIDENCE_DIR%" mkdir "%EVIDENCE_DIR%"
if errorlevel 1 goto :fail
if not exist "%STAGE%" mkdir "%STAGE%"
if errorlevel 1 goto :fail

echo objective=%OBJECTIVE%>"%EVIDENCE_DIR%\preflight-summary.txt"
echo repository=%GITHUB_REPOSITORY%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo commit=%GITHUB_SHA%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo runner_name=%RUNNER_NAME%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo runner_os=%RUNNER_OS%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo runner_arch=%RUNNER_ARCH%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo source_candidates_checked=3>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo blind_e4_e5_executed=false>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo scoring_private_accessed=false>>"%EVIDENCE_DIR%\preflight-summary.txt"

if /I not "%RUNNER_OS%"=="Windows" (
  echo failure=runner_os>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
if /I not "%RUNNER_ARCH%"=="X64" (
  echo failure=runner_arch>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)

rem These exact source paths are user-approved Book-evaluator material previously used in this chat.
rem Do not enumerate parent directories. Select only a known delivery path containing all four frozen inputs.
call :select_source "%SOURCE_CANDIDATE_1%"
if not defined SOURCE_DIR call :select_source "%SOURCE_CANDIDATE_2%"
if not defined SOURCE_DIR call :select_source "%SOURCE_CANDIDATE_3%"
if not defined SOURCE_DIR (
  echo failure=no_known_book_evaluator_source>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
echo source_dir=%SOURCE_DIR%>>"%EVIDENCE_DIR%\preflight-summary.txt"
if not exist "%SOURCE_DIR%\book-eval-lemonade.jar" (
  echo failure=source_jar_missing>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
if not exist "%SOURCE_DIR%\provider-visible\BOOK-EVAL-CORPUS-INPUT-v2.jsonl" (
  echo failure=source_corpus_missing>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
if not exist "%SOURCE_DIR%\provider-visible\BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json" (
  echo failure=source_ontology_missing>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
if not exist "%SOURCE_DIR%\runner-private\RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json" (
  echo failure=source_execution_manifest_missing>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)

copy /y "%SOURCE_DIR%\book-eval-lemonade.jar" "%STAGE%\book-eval-lemonade.jar" >nul
if errorlevel 1 goto :fail
copy /y "%SOURCE_DIR%\provider-visible\BOOK-EVAL-CORPUS-INPUT-v2.jsonl" "%STAGE%\BOOK-EVAL-CORPUS-INPUT-v2.jsonl" >nul
if errorlevel 1 goto :fail
copy /y "%SOURCE_DIR%\provider-visible\BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json" "%STAGE%\BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json" >nul
if errorlevel 1 goto :fail
copy /y "%SOURCE_DIR%\runner-private\RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json" "%STAGE%\RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json" >nul
if errorlevel 1 goto :fail

call :verify_sha "%STAGE%\book-eval-lemonade.jar" "%EXPECTED_JAR_SHA%" jar
if errorlevel 1 goto :fail
call :verify_sha "%STAGE%\BOOK-EVAL-CORPUS-INPUT-v2.jsonl" "%EXPECTED_CORPUS_SHA%" corpus
if errorlevel 1 goto :fail
call :verify_sha "%STAGE%\BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json" "%EXPECTED_ONTOLOGY_SHA%" ontology
if errorlevel 1 goto :fail
call :verify_sha "%STAGE%\RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json" "%EXPECTED_EXEC_SHA%" execution_manifest
if errorlevel 1 goto :fail

echo frozen_inputs_hash_verified=true>>"%EVIDENCE_DIR%\preflight-summary.txt"

rem Fail closed if scoring-private material is present in the bounded source or objective bundle.
if exist "%SOURCE_DIR%\scoring-private" (
  echo failure=scoring_private_directory_present>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
if exist "%SOURCE_DIR%\BOOK_EVAL_SCORING_PRIVATE_v2.zip" (
  echo failure=scoring_private_zip_present>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
if exist "%BUNDLE%\scoring-private" (
  echo failure=repo_scoring_private_directory_present>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
if exist "%BUNDLE%\BOOK_EVAL_SCORING_PRIVATE_v2.zip" (
  echo failure=repo_scoring_private_zip_present>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
echo scoring_private_absent=true>>"%EVIDENCE_DIR%\preflight-summary.txt"

where java.exe >"%EVIDENCE_DIR%\java-path.txt" 2>&1
if errorlevel 1 (
  echo failure=java_not_found>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
java -version >"%EVIDENCE_DIR%\java-version.txt" 2>&1
if errorlevel 1 goto :fail
java -cp "%STAGE%\book-eval-lemonade.jar" org.systemmaster.tools.booklab.BookEvalLemonade001ContractTests >"%EVIDENCE_DIR%\contract-tests.txt" 2>&1
if errorlevel 1 (
  echo failure=contract_tests_exit>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
findstr /x /c:"BOOK-EVAL-LEMONADE-001 CONTRACT PASS 10/10" "%EVIDENCE_DIR%\contract-tests.txt" >nul
if errorlevel 1 (
  echo failure=contract_tests_expected_result>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
echo contract_tests=PASS_10_OF_10>>"%EVIDENCE_DIR%\preflight-summary.txt"

where lemonade.exe >"%EVIDENCE_DIR%\lemonade-path.txt" 2>&1
if errorlevel 1 (
  where lemonade >"%EVIDENCE_DIR%\lemonade-path.txt" 2>&1
  if errorlevel 1 (
    echo failure=lemonade_not_found>>"%EVIDENCE_DIR%\preflight-summary.txt"
    goto :fail
  )
)
lemonade --version >"%EVIDENCE_DIR%\lemonade-version.txt" 2>&1
if errorlevel 1 goto :fail

where curl.exe >"%EVIDENCE_DIR%\curl-path.txt" 2>&1
if errorlevel 1 (
  echo failure=curl_not_found>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)

curl.exe --fail --silent --show-error "%API_BASE%/v1/models/%MODEL%" >"%EVIDENCE_DIR%\model-metadata.json"
if errorlevel 1 (
  echo failure=model_metadata_request>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
findstr /c:"%EXPECTED_CHECKPOINT%" "%EVIDENCE_DIR%\model-metadata.json" >nul
if errorlevel 1 (
  echo failure=checkpoint_identity>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
findstr /c:"59.0" "%EVIDENCE_DIR%\model-metadata.json" >nul
if errorlevel 1 (
  echo failure=registry_size_identity>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)

lemonade load %MODEL% --ctx-size 4096 >"%EVIDENCE_DIR%\model-load.txt" 2>&1
if errorlevel 1 (
  echo failure=model_load>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
findstr /i /c:"loaded successfully" "%EVIDENCE_DIR%\model-load.txt" >nul
if errorlevel 1 (
  echo failure=model_load_confirmation>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)

set "MODEL_ROOT=%USERPROFILE%\.cache\huggingface\hub\models--ggml-org--gpt-oss-120b-GGUF\snapshots"
if not exist "%MODEL_ROOT%" (
  echo failure=model_snapshot_root_missing>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
dir /b /s "%MODEL_ROOT%\%EXPECTED_MODEL_FILE%" >"%EVIDENCE_DIR%\model-paths.txt" 2>nul
if errorlevel 1 (
  echo failure=model_file_missing>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
for /f %%C in ('find /c /v "" ^< "%EVIDENCE_DIR%\model-paths.txt"') do set "MODEL_PATH_COUNT=%%C"
if not "%MODEL_PATH_COUNT%"=="1" (
  echo failure=model_file_not_unique>>"%EVIDENCE_DIR%\preflight-summary.txt"
  echo model_path_count=%MODEL_PATH_COUNT%>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
set /p "MODEL_PATH="<"%EVIDENCE_DIR%\model-paths.txt"
for %%A in ("%MODEL_PATH%") do set "MODEL_BYTES=%%~zA"
if not "%MODEL_BYTES%"=="%EXPECTED_MODEL_BYTES%" (
  echo failure=model_bytes>>"%EVIDENCE_DIR%\preflight-summary.txt"
  echo model_bytes=%MODEL_BYTES%>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
echo model_path=%MODEL_PATH%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo model_bytes=%MODEL_BYTES%>>"%EVIDENCE_DIR%\preflight-summary.txt"
certutil -hashfile "%MODEL_PATH%" SHA256 >"%EVIDENCE_DIR%\model-sha256.txt" 2>&1
if errorlevel 1 (
  echo failure=model_hash>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)

curl.exe --fail --silent --show-error -H "Content-Type: application/json" --data-binary "@%BUNDLE%\smoke-request.json" "%RESPONSES_ENDPOINT%" >"%EVIDENCE_DIR%\smoke-response.json"
if errorlevel 1 (
  echo failure=smoke_request>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
findstr /c:"\"status\"" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (
  echo failure=smoke_status_key>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
findstr /c:"completed" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (
  echo failure=smoke_status_completed>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
findstr /c:"output_text" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (
  echo failure=smoke_output_text>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)
findstr /c:"%EXPECTED_MODEL_FILE%" "%EVIDENCE_DIR%\smoke-response.json" >nul
if errorlevel 1 (
  echo failure=smoke_model_artifact_identity>>"%EVIDENCE_DIR%\preflight-summary.txt"
  goto :fail
)

echo model_request_id=%MODEL%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo checkpoint=%EXPECTED_CHECKPOINT%>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo qualification_context_size=4096>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo smoke_response_completed=true>>"%EVIDENCE_DIR%\preflight-summary.txt"
echo qualification=PASS_A01_PREFLIGHT>>"%EVIDENCE_DIR%\preflight-summary.txt"
type "%EVIDENCE_DIR%\preflight-summary.txt"
exit /b 0

:select_source
set "SOURCE_TEST=%~1"
if not exist "%SOURCE_TEST%\book-eval-lemonade.jar" exit /b 0
if not exist "%SOURCE_TEST%\provider-visible\BOOK-EVAL-CORPUS-INPUT-v2.jsonl" exit /b 0
if not exist "%SOURCE_TEST%\provider-visible\BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json" exit /b 0
if not exist "%SOURCE_TEST%\runner-private\RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json" exit /b 0
set "SOURCE_DIR=%SOURCE_TEST%"
exit /b 0

:verify_sha
set "HASH_FILE=%~1"
set "HASH_EXPECTED=%~2"
set "HASH_NAME=%~3"
certutil -hashfile "%HASH_FILE%" SHA256 >"%EVIDENCE_DIR%\hash-%HASH_NAME%.txt" 2>&1
if errorlevel 1 exit /b 1
findstr /i /c:"%HASH_EXPECTED%" "%EVIDENCE_DIR%\hash-%HASH_NAME%.txt" >nul
if errorlevel 1 exit /b 1
exit /b 0

:fail
echo qualification=FAIL_A01_PREFLIGHT>>"%EVIDENCE_DIR%\preflight-summary.txt"
type "%EVIDENCE_DIR%\preflight-summary.txt"
exit /b 1
