$ErrorActionPreference = 'Stop'

$ExpectedJar = 'fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248'
$ExpectedCorpus = '30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53'
$ExpectedOntology = '3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6'
$ExpectedExecution = '7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06'
$ExpectedE4Sha = 'a5a5a3d25b36f50b8e667e22137fefea88a1b12e0d1c1812d6cc1cdd782e8b9c'
$ExpectedOldE5Sha = '693b218ba475f51a48eabb759694934b1275873d140da4bf68454fe5987925b3'
$ExpectedE4Fingerprint = '7e7e7588138081f9ac3eaca75229934c137307927ac5ea0529ea800d601e03fc'
$ExpectedE5Fingerprint = '3d275e96b5b231fdc2ab08eac70486cb7d4f858e25143fd404a5e039c431f598'

$Bundle = Split-Path -Parent $PSScriptRoot
$OldRoot = 'C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_A01_BLIND_RUN_GPT_OSS_120B'
$NewRoot = 'C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_A01_BLIND_RUN_GPT_OSS_120B_E5_REPAIR_V1'
$OldE4 = Join-Path $OldRoot 'E4-SPECIALIST-v2-FROZEN.jsonl'
$OldE5 = Join-Path $OldRoot 'E5-PANEL-v2-FROZEN.jsonl'
$OldIdentity = Join-Path $OldRoot 'LEMONADE-RUNTIME-IDENTITY.json'
$NewE4 = Join-Path $NewRoot 'E4-SPECIALIST-v2-FROZEN.jsonl'
$NewE5 = Join-Path $NewRoot 'E5-PANEL-v2-FROZEN.jsonl'
$NewIdentity = Join-Path $NewRoot 'LEMONADE-RUNTIME-IDENTITY.json'
$Evidence = Join-Path $env:RUNNER_TEMP ('book-eval-e5-repair-completion-' + $env:GITHUB_RUN_ID)
$Stage = Join-Path $Evidence 'frozen-inputs'
$Classes = Join-Path $Evidence 'repair-classes'
$Summary = Join-Path $Evidence 'completion-summary.txt'
$Stdout = Join-Path $Evidence 'campaign.stdout.log'
$Stderr = Join-Path $Evidence 'campaign.stderr.log'

New-Item -ItemType Directory -Force -Path $Evidence,$Stage,$Classes | Out-Null
"EVIDENCE_DIR=$Evidence" | Out-File -FilePath $env:GITHUB_ENV -Encoding ascii -Append

function Sha([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function CountLines([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return 0 }
  return @(Get-Content -LiteralPath $Path).Count
}

function Reconstruct([string]$Dir,[string]$Out,[string]$Expected) {
  $parts = @(Get-ChildItem -LiteralPath $Dir -File -Filter 'part-*' | Sort-Object Name)
  if ($parts.Count -eq 0) { throw "no transport parts in $Dir" }
  $b64 = [string]::Concat(@($parts | ForEach-Object { [IO.File]::ReadAllText($_.FullName,[Text.Encoding]::ASCII) }))
  [IO.File]::WriteAllBytes($Out,[Convert]::FromBase64String($b64))
  if ((Sha $Out) -ne $Expected) { throw "reconstructed hash mismatch for $Out" }
}

if (-not (Test-Path $OldE4) -or -not (Test-Path $OldE5) -or -not (Test-Path $OldIdentity)) {
  throw 'pre-repair evidence missing'
}
if ((CountLines $OldE4) -ne 160 -or (Sha $OldE4) -ne $ExpectedE4Sha) {
  throw 'pre-repair E4 authority mismatch'
}
if ((CountLines $OldE5) -ne 117 -or (Sha $OldE5) -ne $ExpectedOldE5Sha) {
  throw 'pre-repair E5 historical evidence mismatch'
}
$OldE4Before = Sha $OldE4
$OldE5Before = Sha $OldE5

if (Test-Path (Join-Path $OldRoot 'scoring-private')) { throw 'scoring-private material present in pre-repair run root' }
if (Test-Path (Join-Path $NewRoot 'scoring-private')) { throw 'scoring-private material present in repaired run root' }
if (Test-Path (Join-Path $Bundle 'scoring-private')) { throw 'scoring-private material present in repository bundle' }

Reconstruct (Join-Path $Bundle 'jar-base64-v2') (Join-Path $Stage 'book-eval-lemonade.jar') $ExpectedJar
Reconstruct (Join-Path $Bundle 'provider-visible-corpus-base64-v2') (Join-Path $Stage 'BOOK-EVAL-CORPUS-INPUT-v2.jsonl') $ExpectedCorpus
Reconstruct (Join-Path $Bundle 'provider-ontology-base64-v2') (Join-Path $Stage 'BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json') $ExpectedOntology
Reconstruct (Join-Path $Bundle 'runner-private-base64-v2') (Join-Path $Stage 'RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json') $ExpectedExecution
$Jar = Join-Path $Stage 'book-eval-lemonade.jar'
$Input = Join-Path $Stage 'BOOK-EVAL-CORPUS-INPUT-v2.jsonl'
$Ontology = Join-Path $Stage 'BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json'
$Execution = Join-Path $Stage 'RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json'

$RepairSource = Join-Path $Bundle 'repair-src\org\systemmaster\tools\booklab\LemonadeResponsesBookEvaluatorV2.java'
& javac -cp $Jar -d $Classes $RepairSource
if ($LASTEXITCODE -ne 0) { throw 'repair adapter compilation failed' }
$Classpath = $Classes + ';' + $Jar

if (-not (Test-Path $NewRoot)) {
  New-Item -ItemType Directory -Force -Path $NewRoot | Out-Null
  Copy-Item -LiteralPath $OldE4 -Destination $NewE4
  Copy-Item -LiteralPath $OldIdentity -Destination $NewIdentity
}
if ((CountLines $NewE4) -ne 160 -or (Sha $NewE4) -ne $ExpectedE4Sha) { throw 'new-run E4 seed mismatch' }
if ((Sha $NewIdentity) -ne (Sha $OldIdentity)) { throw 'runtime identity copy mismatch' }

$E5Before = CountLines $NewE5
if ($E5Before -lt 0 -or $E5Before -gt 160) { throw 'invalid repaired E5 starting count' }
if ($E5Before -gt 0) {
  $first = Get-Content -LiteralPath $NewE5 -TotalCount 1 | ConvertFrom-Json
  if ([string]$first.candidate_fingerprint -ne $ExpectedE5Fingerprint) {
    throw 'repaired E5 fingerprint mismatch before completion run'
  }
}

curl.exe --fail --silent --show-error -X POST 'http://127.0.0.1:13305/v1/load' -H 'Content-Type: application/json' --data-binary ('@' + (Join-Path $Bundle 'lemonade-load-request.json')) -o (Join-Path $Evidence 'model-load.json')
if ($LASTEXITCODE -ne 0) { throw 'model load failed' }

$env:BOOK_EVAL_PROVIDER_KIND = 'LEMONADE'
$env:BOOK_EVAL_MODEL = 'user.gpt-oss-120b-MXFP4'
$env:BOOK_EVAL_ENDPOINT = 'http://127.0.0.1:13305/v1/responses'
$env:BOOK_EVAL_RUNTIME_IDENTITY_FILE = $NewIdentity
$env:BOOK_EVAL_MAX_OUTPUT_TOKENS = '1200'
$env:BOOK_EVAL_TEMPERATURE = '0'
$env:BOOK_EVAL_MAX_ATTEMPTS = '3'
$env:BOOK_EVAL_MAX_PROVIDER_CALLS = '700'

$Java = (Get-Command java.exe -ErrorAction Stop).Source
$Args = @(
  '-cp', $Classpath,
  'org.systemmaster.tools.booklab.BookEvalProvider001AV2BlindRun',
  $Input, $Ontology, $Execution, $NewRoot
)
$process = Start-Process -FilePath $Java -ArgumentList $Args -Wait -PassThru -NoNewWindow -RedirectStandardOutput $Stdout -RedirectStandardError $Stderr
$JavaExit = $process.ExitCode
$E5After = CountLines $NewE5

if ((CountLines $NewE4) -ne 160 -or (Sha $NewE4) -ne $ExpectedE4Sha) { throw 'E4 changed during repaired E5 completion run' }
if ((Sha $OldE4) -ne $OldE4Before -or (Sha $OldE5) -ne $OldE5Before) { throw 'pre-repair historical evidence mutated' }
if ($E5After -lt $E5Before -or $E5After -gt 160) { throw 'repaired E5 count invalid after completion run' }

if ($E5After -gt 0) {
  $badFingerprints = 0
  Get-Content -LiteralPath $NewE5 | ForEach-Object {
    $row = $_ | ConvertFrom-Json
    if ([string]$row.candidate_fingerprint -ne $ExpectedE5Fingerprint) { $badFingerprints++ }
  }
  if ($badFingerprints -ne 0) { throw "repaired E5 contains $badFingerprints fingerprint mismatches" }
}

if ($JavaExit -ne 0) {
  $tail = @(Get-Content -LiteralPath $Stderr -Tail 40 -ErrorAction SilentlyContinue)
  $tail | ForEach-Object { Write-Host $_ }
  throw "repaired E5 completion process failed with exit $JavaExit after reaching $E5After/160"
}
if ($E5After -ne 160) { throw "repaired E5 completion exited cleanly but reached only $E5After/160" }

$StatusFile = Join-Path $NewRoot 'BLIND-RUN-STATUS.json'
if (-not (Test-Path $StatusFile)) { throw 'blind-run status missing after E5 completion' }
$Status = Get-Content -LiteralPath $StatusFile -Raw | ConvertFrom-Json
if ([string]$Status.state -ne 'BLIND_OUTPUTS_FROZEN') { throw "unexpected blind-run state $($Status.state)" }

$FirstE4 = Get-Content -LiteralPath $NewE4 -TotalCount 1 | ConvertFrom-Json
if ([string]$FirstE4.candidate_fingerprint -ne $ExpectedE4Fingerprint) { throw 'E4 candidate fingerprint drift' }

Copy-Item -LiteralPath $NewE5 -Destination (Join-Path $Evidence 'E5-PANEL-v2-REPAIRED-FROZEN.jsonl') -Force
Copy-Item -LiteralPath $StatusFile -Destination (Join-Path $Evidence 'BLIND-RUN-STATUS.json') -Force
$CandidateFreeze = Join-Path $NewRoot 'CANDIDATE-FREEZE-v2.json'
if (Test-Path $CandidateFreeze) { Copy-Item -LiteralPath $CandidateFreeze -Destination (Join-Path $Evidence 'CANDIDATE-FREEZE-v2.json') -Force }

@(
  'objective=BOOK-EVAL-LEMONADE-001-E5-REPAIR-REQUALIFICATION-COMPLETE',
  "repository=$env:GITHUB_REPOSITORY",
  "commit=$env:GITHUB_SHA",
  "runner=$env:RUNNER_NAME",
  'frozen_inputs_hash_verified=4/4',
  'e4_reused_cases=160',
  "e5_before_cases=$E5Before",
  "e5_after_cases=$E5After",
  "e5_added_cases=$($E5After-$E5Before)",
  "java_exit=$JavaExit",
  "e4_candidate_fingerprint=$ExpectedE4Fingerprint",
  "e5_candidate_fingerprint=$ExpectedE5Fingerprint",
  'pre_repair_e5_117_preserved=true',
  'scoring_private_accessed=false',
  'blind_outputs_frozen=true',
  'standing=PASS_REPAIRED_E5_160_OF_160'
) | Set-Content -Encoding UTF8 $Summary
Get-Content $Summary
