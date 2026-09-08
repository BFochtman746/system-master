@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "MODEL=user.gpt-oss-120b-MXFP4"
set "EXPECTED_CHECKPOINT=ggml-org/gpt-oss-120b-GGUF:MXFP4"
set "EXPECTED_FILE=gpt-oss-120b-MXFP4.gguf"
set "EXPECTED_BYTES=63387346208"
set "API=http://127.0.0.1:13305"
set "EVIDENCE=%RUNNER_TEMP%\book-eval-model-artifact-%GITHUB_RUN_ID%"
if not exist "%EVIDENCE%" mkdir "%EVIDENCE%"
echo objective=BOOK-EVAL-LEMONADE-001-MODEL-ARTIFACT-PROBE>"%EVIDENCE%\summary.txt"
echo runner=%RUNNER_NAME%>>"%EVIDENCE%\summary.txt"
echo model_request_id=%MODEL%>>"%EVIDENCE%\summary.txt"
where curl.exe >"%EVIDENCE%\curl-path.txt" 2>&1 || goto :curlfail
curl.exe --fail --silent --show-error "%API%/v1/models/%MODEL%" -o "%EVIDENCE%\model-metadata.json" || goto :registryfail
findstr /c:"%EXPECTED_CHECKPOINT%" "%EVIDENCE%\model-metadata.json" >nul || goto :identityfail
echo checkpoint=%EXPECTED_CHECKPOINT%>>"%EVIDENCE%\summary.txt"
set "MATCHES=%EVIDENCE%\matching-model-paths.txt"
type nul >"%MATCHES%"
for /d %%U in (C:\Users\*) do (
  set "ROOT=%%U\.cache\huggingface\hub\models--ggml-org--gpt-oss-120b-GGUF\snapshots"
  if exist "!ROOT!" (
    for /f "delims=" %%F in ('dir /b /s /a-d "!ROOT!\%EXPECTED_FILE%" 2^>nul') do (
      for %%S in ("%%F") do if "%%~zS"=="%EXPECTED_BYTES%" echo %%F>>"%MATCHES%"
    )
  )
)
if defined HF_HUB_CACHE if exist "%HF_HUB_CACHE%\models--ggml-org--gpt-oss-120b-GGUF\snapshots" (
  for /f "delims=" %%F in ('dir /b /s /a-d "%HF_HUB_CACHE%\models--ggml-org--gpt-oss-120b-GGUF\snapshots\%EXPECTED_FILE%" 2^>nul') do (
    for %%S in ("%%F") do if "%%~zS"=="%EXPECTED_BYTES%" echo %%F>>"%MATCHES%"
  )
)
if defined HF_HOME if exist "%HF_HOME%\hub\models--ggml-org--gpt-oss-120b-GGUF\snapshots" (
  for /f "delims=" %%F in ('dir /b /s /a-d "%HF_HOME%\hub\models--ggml-org--gpt-oss-120b-GGUF\snapshots\%EXPECTED_FILE%" 2^>nul') do (
    for %%S in ("%%F") do if "%%~zS"=="%EXPECTED_BYTES%" echo %%F>>"%MATCHES%"
  )
)
sort /unique "%MATCHES%" /o "%MATCHES%"
for /f %%C in ('find /c /v "" ^< "%MATCHES%"') do set "COUNT=%%C"
echo matching_exact_size_candidates=!COUNT!>>"%EVIDENCE%\summary.txt"
if "!COUNT!"=="0" goto :notfound
if not "!COUNT!"=="1" goto :ambiguous
set /p "MODEL_PATH="<"%MATCHES%"
echo model_file=%EXPECTED_FILE%>>"%EVIDENCE%\summary.txt"
echo model_bytes=%EXPECTED_BYTES%>>"%EVIDENCE%\summary.txt"
echo model_path=!MODEL_PATH!>>"%EVIDENCE%\summary.txt"
echo hashing_started=true>>"%EVIDENCE%\summary.txt"
certutil -hashfile "!MODEL_PATH!" SHA256 >"%EVIDENCE%\model-sha256.txt" 2>&1 || goto :hashfail
for /f "usebackq tokens=*" %%H in (`findstr /r /i "^[0-9a-f][0-9a-f]*$" "%EVIDENCE%\model-sha256.txt"`) do set "MODEL_SHA=%%H"
if not defined MODEL_SHA goto :hashparse
set "MODEL_SHA=!MODEL_SHA: =!"
echo model_artifact_sha256=!MODEL_SHA!>>"%EVIDENCE%\summary.txt"
echo exact_model_artifact_bound=true>>"%EVIDENCE%\summary.txt"
echo qualification=PASS_MODEL_ARTIFACT_PROBE>>"%EVIDENCE%\summary.txt"
type "%EVIDENCE%\summary.txt"
exit /b 0
:curlfail
echo failure=curl_not_found>>"%EVIDENCE%\summary.txt"
goto :fail
:registryfail
echo failure=model_registry_unreachable>>"%EVIDENCE%\summary.txt"
goto :fail
:identityfail
echo failure=checkpoint_identity_mismatch>>"%EVIDENCE%\summary.txt"
goto :fail
:notfound
echo failure=exact_model_file_not_found_in_bounded_hf_roots>>"%EVIDENCE%\summary.txt"
goto :fail
:ambiguous
echo failure=multiple_exact_model_candidates>>"%EVIDENCE%\summary.txt"
goto :fail
:hashfail
echo failure=model_sha256_command_failed>>"%EVIDENCE%\summary.txt"
goto :fail
:hashparse
echo failure=model_sha256_parse_failed>>"%EVIDENCE%\summary.txt"
goto :fail
:fail
echo qualification=FAIL_MODEL_ARTIFACT_PROBE>>"%EVIDENCE%\summary.txt"
type "%EVIDENCE%\summary.txt"
exit /b 1
