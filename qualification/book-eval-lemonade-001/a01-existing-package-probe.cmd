@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "EVIDENCE=%RUNNER_TEMP%\book-eval-existing-package-%GITHUB_RUN_ID%"
set "EXPECTED_JAR=fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248"
set "EXPECTED_CORPUS=30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53"
set "EXPECTED_ONTOLOGY=3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6"
set "EXPECTED_MANIFEST=7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06"
if not exist "%EVIDENCE%" mkdir "%EVIDENCE%"
echo objective=BOOK-EVAL-LEMONADE-001-EXISTING-PACKAGE-PROBE>"%EVIDENCE%\summary.txt"
echo runner=%RUNNER_NAME%>>"%EVIDENCE%\summary.txt"
whoami >"%EVIDENCE%\whoami.txt" 2>&1
where java.exe >"%EVIDENCE%\java-path.txt" 2>&1
where jar.exe >"%EVIDENCE%\jar-tool-path.txt" 2>&1
set "FOUND_ZIP="
set "FOUND_DIR="
for %%P in (
 "C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_RUNNER_JAVA25_HOTFIX.zip"
 "C:\AI Test Kit\BOOK_EVAL_LEMONADE_001_RUNNER_JAVA25_HOTFIX.zip"
 "C:\BOOK_EVAL_LEMONADE_001_RUNNER_JAVA25_HOTFIX.zip"
) do if not defined FOUND_ZIP if exist "%%~P" set "FOUND_ZIP=%%~P"
for /d %%U in (C:\Users\*) do if not defined FOUND_ZIP if exist "%%U\Downloads\BOOK_EVAL_LEMONADE_001_RUNNER_JAVA25_HOTFIX.zip" set "FOUND_ZIP=%%U\Downloads\BOOK_EVAL_LEMONADE_001_RUNNER_JAVA25_HOTFIX.zip"
for /d %%U in (C:\Users\*) do if not defined FOUND_ZIP if exist "%%U\Desktop\BOOK_EVAL_LEMONADE_001_RUNNER_JAVA25_HOTFIX.zip" set "FOUND_ZIP=%%U\Desktop\BOOK_EVAL_LEMONADE_001_RUNNER_JAVA25_HOTFIX.zip"
for %%D in (
 "C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_RUNNER_POWERSHELL_AUDITED\delivery"
 "C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_RUNNER_JAVA25_HOTFIX\delivery"
 "C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_RUNNER\delivery"
) do if not defined FOUND_DIR if exist "%%~D\book-eval-lemonade.jar" set "FOUND_DIR=%%~D"
if defined FOUND_ZIP (
 echo source_kind=zip>>"%EVIDENCE%\summary.txt"
 echo source_path=%FOUND_ZIP%>>"%EVIDENCE%\summary.txt"
 where jar.exe >nul 2>&1 || goto :nojar
 mkdir "%EVIDENCE%\extract" 2>nul
 pushd "%EVIDENCE%\extract"
 jar xf "%FOUND_ZIP%"
 if errorlevel 1 (popd & goto :extractfail)
 popd
 set "FOUND_DIR=%EVIDENCE%\extract\delivery"
)
if not defined FOUND_DIR goto :notfound
call :check "%FOUND_DIR%\book-eval-lemonade.jar" "%EXPECTED_JAR%" jar || goto :hashfail
call :check "%FOUND_DIR%\provider-visible\BOOK-EVAL-CORPUS-INPUT-v2.jsonl" "%EXPECTED_CORPUS%" corpus || goto :hashfail
call :check "%FOUND_DIR%\provider-visible\BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json" "%EXPECTED_ONTOLOGY%" ontology || goto :hashfail
call :check "%FOUND_DIR%\runner-private\RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json" "%EXPECTED_MANIFEST%" manifest || goto :hashfail
echo canonical_inputs_found=true>>"%EVIDENCE%\summary.txt"
echo source_dir=%FOUND_DIR%>>"%EVIDENCE%\summary.txt"
echo qualification=PASS_EXISTING_PACKAGE_PROBE>>"%EVIDENCE%\summary.txt"
type "%EVIDENCE%\summary.txt"
exit /b 0
:notfound
echo canonical_inputs_found=false>>"%EVIDENCE%\summary.txt"
echo failure=package_not_found_in_bounded_roots>>"%EVIDENCE%\summary.txt"
goto :fail
:nojar
echo failure=jar_tool_not_found>>"%EVIDENCE%\summary.txt"
goto :fail
:extractfail
echo failure=zip_extract_failed>>"%EVIDENCE%\summary.txt"
goto :fail
:hashfail
echo failure=canonical_hash_mismatch>>"%EVIDENCE%\summary.txt"
goto :fail
:check
if not exist "%~1" exit /b 1
certutil -hashfile "%~1" SHA256 >"%EVIDENCE%\hash-%~3.txt" 2>&1 || exit /b 1
findstr /i /c:"%~2" "%EVIDENCE%\hash-%~3.txt" >nul || exit /b 1
exit /b 0
:fail
echo qualification=FAIL_EXISTING_PACKAGE_PROBE>>"%EVIDENCE%\summary.txt"
type "%EVIDENCE%\summary.txt"
exit /b 1
