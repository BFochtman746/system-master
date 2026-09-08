param(
    [string]$Model = "user.gpt-oss-120b-MXFP4",
    [string]$Endpoint = "http://127.0.0.1:13305/v1/responses",
    [int]$ContextSize = 4096,
    [int]$MaxOutputTokens = 1200,
    [int]$MaxAttempts = 3,
    [string]$OutputRoot = ""
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$ScriptVersion = "BOOK-EVAL-LEMONADE-001-PS1-v1.2.0"

function Assert-Equal {
    param(
        [string]$Actual,
        [string]$Expected,
        [string]$Name
    )
    if ([string]::IsNullOrWhiteSpace($Actual)) {
        throw ("{0} SHA-256 is empty." -f $Name)
    }
    if ($Actual.ToLowerInvariant() -ne $Expected.ToLowerInvariant()) {
        throw ("{0} SHA-256 mismatch. Expected {1}, got {2}" -f $Name, $Expected, $Actual)
    }
}

function Get-Sha256 {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw ("Required file is missing: {0}" -f $Path)
    }
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Invoke-NativeCapture {
    param(
        [string]$FileName,
        [string[]]$Arguments
    )
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $text = (& $FileName @Arguments 2>&1 | Out-String).Trim()
        $code = $LASTEXITCODE
    }
    catch {
        throw ("Could not run {0}: {1}" -f $FileName, $_.Exception.Message)
    }
    finally {
        $ErrorActionPreference = $oldPreference
    }
    if ($null -eq $code) {
        $code = 1
    }
    return [pscustomobject]@{
        ExitCode = [int]$code
        Text = [string]$text
    }
}

function Invoke-NativeStreaming {
    param(
        [string]$FileName,
        [string[]]$Arguments
    )
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $FileName @Arguments
        $code = $LASTEXITCODE
    }
    catch {
        throw ("Could not run {0}: {1}" -f $FileName, $_.Exception.Message)
    }
    finally {
        $ErrorActionPreference = $oldPreference
    }
    if ($null -eq $code) {
        $code = 1
    }
    return [int]$code
}

function Get-StableBackendObservation {
    param([string[]]$RecentLog)
    $value = "UNKNOWN"
    $lines = @($RecentLog | Select-String -Pattern "Using LlamaCpp Backend:" | Select-Object -Last 1)
    if ($lines.Count -gt 0) {
        $m = [regex]::Match($lines[0].Line, 'Using LlamaCpp Backend:\s*(?<value>[A-Za-z0-9._-]+)')
        if ($m.Success) {
            $value = $m.Groups['value'].Value.ToLowerInvariant()
        }
    }
    return $value
}

function Get-StableDeviceObservation {
    param([string[]]$RecentLog)
    $value = "UNKNOWN"
    $lines = @($RecentLog | Select-String -Pattern "Vulkan[0-9]+ :|ROCm|HIP" | Select-Object -Last 1)
    if ($lines.Count -gt 0) {
        $line = $lines[0].Line
        $m = [regex]::Match($line, '-\s*(?<value>Vulkan[0-9]+\s*:\s*.+?)\s+\([0-9]+\s+MiB,')
        if ($m.Success) {
            $value = $m.Groups['value'].Value.Trim()
        }
        else {
            $m = [regex]::Match($line, '(?<value>(?:ROCm|HIP)[^\r\n]*)')
            if ($m.Success) {
                $value = $m.Groups['value'].Value.Trim()
            }
        }
    }
    return $value
}

function Assert-IdentityCompatible {
    param(
        [object]$Existing,
        [System.Collections.IDictionary]$Current
    )
    $fields = @(
        "runtime_identity_schema",
        "runner_script_version",
        "jar_sha256",
        "lemonade_version",
        "endpoint",
        "model_request_id",
        "registry_model_id",
        "checkpoint",
        "primary_file",
        "model_artifact_path",
        "model_artifact_sha256",
        "model_artifact_bytes",
        "recipe",
        "max_context_window",
        "qualification_context_size",
        "backend_observation",
        "device_observation",
        "max_output_tokens",
        "temperature",
        "max_attempts",
        "input_sha256",
        "ontology_sha256",
        "execution_manifest_sha256"
    )
    foreach ($field in $fields) {
        $existingProperty = $Existing.PSObject.Properties[$field]
        if ($null -eq $existingProperty) {
            throw ("Cannot resume: runtime identity is missing field {0}." -f $field)
        }
        $existingValue = [string]$existingProperty.Value
        $currentValue = [string]$Current[$field]
        if ($existingValue -ne $currentValue) {
            throw ("Cannot resume: runtime identity changed for {0}. Existing={1}; Current={2}" -f $field, $existingValue, $currentValue)
        }
    }
}

if ([string]::IsNullOrWhiteSpace($Model)) {
    throw "Model cannot be blank."
}
if ([string]::IsNullOrWhiteSpace($Endpoint)) {
    throw "Endpoint cannot be blank."
}
if ($ContextSize -lt 512) {
    throw "ContextSize must be at least 512."
}
if ($MaxOutputTokens -lt 256 -or $MaxOutputTokens -gt 4096) {
    throw "MaxOutputTokens must be between 256 and 4096."
}
if ($MaxAttempts -lt 1 -or $MaxAttempts -gt 5) {
    throw "MaxAttempts must be between 1 and 5."
}

try {
    $EndpointUri = [System.Uri]$Endpoint
}
catch {
    throw ("Endpoint is not a valid URI: {0}" -f $Endpoint)
}
if (-not $EndpointUri.IsAbsoluteUri) {
    throw ("Endpoint must be an absolute URI: {0}" -f $Endpoint)
}
if ($EndpointUri.Scheme -ne "http" -and $EndpointUri.Scheme -ne "https") {
    throw ("Endpoint must use http or https: {0}" -f $Endpoint)
}
$ApiBase = $EndpointUri.GetLeftPart([System.UriPartial]::Authority).TrimEnd('/')

$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $Base "runs"
}
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$InputFile = Join-Path $Base "provider-visible\BOOK-EVAL-CORPUS-INPUT-v2.jsonl"
$OntologyFile = Join-Path $Base "provider-visible\BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json"
$ExecutionFile = Join-Path $Base "runner-private\RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json"
$Jar = Join-Path $Base "book-eval-lemonade.jar"

$ExpectedJarSha = "fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248"
$ExpectedInputSha = "30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53"
$ExpectedOntologySha = "3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6"
$ExpectedExecutionSha = "7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06"

Write-Host "=== BOOK-EVAL-LEMONADE-001 ==="
Write-Host ("Runner: {0}" -f $ScriptVersion)
Write-Host "1/7 Verifying frozen runner and blind corpus..."
Assert-Equal (Get-Sha256 $Jar) $ExpectedJarSha "evaluator JAR"
Assert-Equal (Get-Sha256 $InputFile) $ExpectedInputSha "provider-visible corpus"
Assert-Equal (Get-Sha256 $OntologyFile) $ExpectedOntologySha "provider ontology"
Assert-Equal (Get-Sha256 $ExecutionFile) $ExpectedExecutionSha "runner-private execution manifest"

Write-Host "2/7 Verifying Java 21 or newer..."
$javaPsi = New-Object System.Diagnostics.ProcessStartInfo
$javaPsi.FileName = "java"
$javaPsi.Arguments = "-version"
$javaPsi.UseShellExecute = $false
$javaPsi.RedirectStandardOutput = $true
$javaPsi.RedirectStandardError = $true
$javaPsi.CreateNoWindow = $true
try {
    $javaProcess = [System.Diagnostics.Process]::Start($javaPsi)
}
catch {
    throw "Java is not available. Install or enable Java 21 or newer before running the Book evaluator."
}
$javaStdout = $javaProcess.StandardOutput.ReadToEnd()
$javaStderr = $javaProcess.StandardError.ReadToEnd()
$javaProcess.WaitForExit()
$javaText = ($javaStdout + [Environment]::NewLine + $javaStderr).Trim()
if ($javaProcess.ExitCode -ne 0) {
    throw ("Java version check failed with exit code {0}: {1}" -f $javaProcess.ExitCode, $javaText)
}
$javaMatch = [regex]::Match($javaText, 'version\s+"(?<major>\d+)')
if (-not $javaMatch.Success) {
    throw ("Could not determine Java major version from: {0}" -f $javaText)
}
$javaMajor = [int]$javaMatch.Groups['major'].Value
if ($javaMajor -lt 21) {
    throw ("Java 21 or newer is required. Detected Java {0}: {1}" -f $javaMajor, $javaText)
}
Write-Host ("    Detected Java {0} (compatible; evaluator JAR targets Java 21 bytecode)." -f $javaMajor)

Write-Host "3/7 Verifying Lemonade and loading exact model..."
$versionResult = Invoke-NativeCapture "lemonade" @("--version")
if ($versionResult.ExitCode -ne 0) {
    throw ("Lemonade CLI is unavailable or failed: {0}" -f $versionResult.Text)
}
$lemonadeVersion = $versionResult.Text.Trim()
if ([string]::IsNullOrWhiteSpace($lemonadeVersion)) {
    throw "Lemonade CLI returned an empty version string."
}

$modelsUri = $ApiBase + "/v1/models"
$null = Invoke-RestMethod -Uri $modelsUri -Method Get
$modelUri = $modelsUri + "/" + [System.Uri]::EscapeDataString($Model)
$modelInfo = Invoke-RestMethod -Uri $modelUri -Method Get

$maxContextProperty = $modelInfo.PSObject.Properties["max_context_window"]
if ($null -ne $maxContextProperty) {
    $maxContext = [int64]$maxContextProperty.Value
    if ($ContextSize -gt $maxContext) {
        throw ("Requested ContextSize {0} exceeds model max_context_window {1}." -f $ContextSize, $maxContext)
    }
}

$loadExit = Invoke-NativeStreaming "lemonade" @("load", $Model, "--ctx-size", [string]$ContextSize)
if ($loadExit -ne 0) {
    throw ("Lemonade failed to load model {0}; exit code {1}." -f $Model, $loadExit)
}
$modelInfo = Invoke-RestMethod -Uri $modelUri -Method Get

Write-Host "4/7 Binding exact model artifact and stable runtime identity..."
$checkpoint = [string]$modelInfo.checkpoint
if ([string]::IsNullOrWhiteSpace($checkpoint)) {
    throw "Lemonade model metadata did not contain a checkpoint."
}

$primaryFile = $null
$repo = $null
$variant = $null
$expectedModelBytes = $null
$colon = $checkpoint.LastIndexOf(':')
if ($colon -gt 0) {
    $repo = $checkpoint.Substring(0, $colon)
    $variant = $checkpoint.Substring($colon + 1)
    try {
        $variantsUri = $ApiBase + "/v1/pull/variants?checkpoint=" + [System.Uri]::EscapeDataString($repo)
        $variantInfo = Invoke-RestMethod -Uri $variantsUri -Method Get
        $match = @($variantInfo.variants | Where-Object { [string]$_.name -eq $variant })
        if ($match.Count -eq 1) {
            $primaryFile = [string]$match[0].primary_file
            if ($null -ne $match[0].size_bytes) {
                $expectedModelBytes = [int64]$match[0].size_bytes
            }
        }
    }
    catch {
        Write-Host ("    Variant metadata endpoint unavailable; will resolve artifact from the exact checkpoint and local cache: {0}" -f $_.Exception.Message)
    }
}

if ([string]::IsNullOrWhiteSpace($primaryFile)) {
    $modelProperty = $modelInfo.PSObject.Properties["model"]
    if ($null -ne $modelProperty) {
        $candidate = [string]$modelProperty.Value
        if (-not [string]::IsNullOrWhiteSpace($candidate) -and $candidate.EndsWith(".gguf", [System.StringComparison]::OrdinalIgnoreCase)) {
            $primaryFile = [System.IO.Path]::GetFileName($candidate)
        }
    }
}

if ([string]::IsNullOrWhiteSpace($repo) -or [string]::IsNullOrWhiteSpace($primaryFile)) {
    throw ("Could not resolve exact Hugging Face model artifact from checkpoint: {0}" -f $checkpoint)
}

$repoFolder = "models--" + $repo.Replace('/', '--')
$snapshotRoot = Join-Path (Join-Path $env:USERPROFILE ".cache\huggingface\hub") $repoFolder
$snapshotsDir = Join-Path $snapshotRoot "snapshots"
if (-not (Test-Path -LiteralPath $snapshotsDir -PathType Container)) {
    throw ("Hugging Face snapshot directory is missing: {0}" -f $snapshotsDir)
}

$modelPath = $null
$mainRef = Join-Path $snapshotRoot "refs\main"
if (Test-Path -LiteralPath $mainRef -PathType Leaf) {
    $revision = (Get-Content -LiteralPath $mainRef -Raw).Trim()
    if (-not [string]::IsNullOrWhiteSpace($revision)) {
        $refCandidate = Join-Path (Join-Path $snapshotsDir $revision) $primaryFile
        if (Test-Path -LiteralPath $refCandidate -PathType Leaf) {
            $modelPath = $refCandidate
        }
    }
}

if ([string]::IsNullOrWhiteSpace($modelPath)) {
    $candidates = @(Get-ChildItem -LiteralPath $snapshotsDir -Recurse -File -Filter $primaryFile -ErrorAction SilentlyContinue)
    if ($null -ne $expectedModelBytes) {
        $candidates = @($candidates | Where-Object { $_.Length -eq $expectedModelBytes })
    }
    if ($candidates.Count -ne 1) {
        throw ("Expected exactly one local artifact named {0} under {1}; found {2}." -f $primaryFile, $snapshotRoot, $candidates.Count)
    }
    $modelPath = $candidates[0].FullName
}

$modelItem = Get-Item -LiteralPath $modelPath
$modelBytes = [int64]$modelItem.Length
if ($null -ne $expectedModelBytes -and $modelBytes -ne $expectedModelBytes) {
    throw ("Model artifact size mismatch. Registry expected {0} bytes; local file has {1} bytes." -f $expectedModelBytes, $modelBytes)
}
Write-Host ("    Model artifact: {0}" -f $modelPath)
Write-Host "    Hashing the exact model weights once for this execution/resume identity..."
$modelSha = Get-Sha256 $modelPath

$backend = "UNKNOWN"
$device = "UNKNOWN"
$logPath = Join-Path $env:TEMP "lemonade-server.log"
if (Test-Path -LiteralPath $logPath -PathType Leaf) {
    $recent = @(Get-Content -LiteralPath $logPath -Tail 5000)
    $backend = Get-StableBackendObservation $recent
    $device = Get-StableDeviceObservation $recent
}

$safeModel = ($Model -replace '[^A-Za-z0-9._-]', '_')
$activeFile = Join-Path $OutputRoot ("BOOK_EVAL_LEMONADE_001_ACTIVE_" + $safeModel + ".txt")
$runDir = $null
$skipEvaluation = $false

if (Test-Path -LiteralPath $activeFile -PathType Leaf) {
    $runDir = (Get-Content -LiteralPath $activeFile -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($runDir) -or -not (Test-Path -LiteralPath $runDir -PathType Container)) {
        throw ("Active-run pointer is invalid: {0}. Do not delete prior run evidence; repair or remove the pointer only after review." -f $activeFile)
    }
    Write-Host ("    Resuming existing run: {0}" -f $runDir)
    $existingStatusFile = Join-Path $runDir "BLIND-RUN-STATUS.json"
    if (Test-Path -LiteralPath $existingStatusFile -PathType Leaf) {
        $existingStatus = Get-Content -LiteralPath $existingStatusFile -Raw | ConvertFrom-Json
        if ([string]$existingStatus.state -eq "BLIND_OUTPUTS_FROZEN") {
            $skipEvaluation = $true
            Write-Host "    Blind outputs were already frozen; evaluation will not be rerun. Packaging will resume."
        }
    }
}
else {
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $runDir = Join-Path $OutputRoot ("BOOK_EVAL_LEMONADE_001_" + $safeModel + "_" + $stamp)
    New-Item -ItemType Directory -Force -Path $runDir | Out-Null
    Set-Content -LiteralPath $activeFile -Encoding UTF8 -Value $runDir
    Write-Host ("    Created new run: {0}" -f $runDir)
}

$identityFile = Join-Path $runDir "LEMONADE-RUNTIME-IDENTITY.json"
$identity = [ordered]@{
    runtime_identity_schema = "BOOK-EVAL-LEMONADE-RUNTIME-IDENTITY-v1"
    runner_script_version = $ScriptVersion
    jar_sha256 = $ExpectedJarSha
    packet_id = "BOOK-EVAL-LEMONADE-001"
    lemonade_version = $lemonadeVersion
    endpoint = $Endpoint
    model_request_id = $Model
    registry_model_id = [string]$modelInfo.id
    checkpoint = $checkpoint
    primary_file = $primaryFile
    model_artifact_path = $modelPath
    model_artifact_sha256 = $modelSha
    model_artifact_bytes = $modelBytes
    recipe = [string]$modelInfo.recipe
    max_context_window = $modelInfo.max_context_window
    qualification_context_size = $ContextSize
    backend_observation = $backend
    device_observation = $device
    max_output_tokens = $MaxOutputTokens
    temperature = 0.0
    max_attempts = $MaxAttempts
    input_sha256 = $ExpectedInputSha
    ontology_sha256 = $ExpectedOntologySha
    execution_manifest_sha256 = $ExpectedExecutionSha
}

if (Test-Path -LiteralPath $identityFile -PathType Leaf) {
    $existingIdentity = Get-Content -LiteralPath $identityFile -Raw | ConvertFrom-Json
    Assert-IdentityCompatible $existingIdentity $identity
}
else {
    $identity | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $identityFile -Encoding UTF8
}

if (-not $skipEvaluation) {
    Write-Host "5/7 Running blind E4 + E5 evaluation. This is unattended and resumable."
    Write-Host "    One progress line appears after each committed case."
    $env:BOOK_EVAL_PROVIDER_KIND = "LEMONADE"
    $env:BOOK_EVAL_MODEL = $Model
    $env:BOOK_EVAL_ENDPOINT = $Endpoint
    $env:BOOK_EVAL_RUNTIME_IDENTITY_FILE = $identityFile
    $env:BOOK_EVAL_MAX_OUTPUT_TOKENS = [string]$MaxOutputTokens
    $env:BOOK_EVAL_TEMPERATURE = "0"
    $env:BOOK_EVAL_MAX_ATTEMPTS = [string]$MaxAttempts
    $env:BOOK_EVAL_MAX_PROVIDER_CALLS = "700"

    $javaExit = Invoke-NativeStreaming "java" @(
        "-cp",
        $Jar,
        "org.systemmaster.tools.booklab.BookEvalProvider001AV2BlindRun",
        $InputFile,
        $OntologyFile,
        $ExecutionFile,
        $runDir
    )
    if ($javaExit -ne 0) {
        throw ("The blind run stopped with exit code {0}. Evidence is preserved in {1}. Rerun this same script to resume that run." -f $javaExit, $runDir)
    }
}
else {
    Write-Host "5/7 Blind evaluation already frozen; skipping provider calls."
}

Write-Host "6/7 Verifying blind run closure..."
$statusFile = Join-Path $runDir "BLIND-RUN-STATUS.json"
if (-not (Test-Path -LiteralPath $statusFile -PathType Leaf)) {
    throw ("Blind-run status file is missing: {0}" -f $statusFile)
}
$status = Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json
if ([string]$status.state -ne "BLIND_OUTPUTS_FROZEN") {
    throw ("Blind run did not close. Current state: {0}" -f ([string]$status.state))
}

$e4File = Join-Path $runDir "E4-SPECIALIST-v2-FROZEN.jsonl"
$e5File = Join-Path $runDir "E5-PANEL-v2-FROZEN.jsonl"
if (-not (Test-Path -LiteralPath $e4File -PathType Leaf)) {
    throw ("Missing frozen E4 file: {0}" -f $e4File)
}
if (-not (Test-Path -LiteralPath $e5File -PathType Leaf)) {
    throw ("Missing frozen E5 file: {0}" -f $e5File)
}
$e4Content = @(Get-Content -LiteralPath $e4File | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$e5Content = @(Get-Content -LiteralPath $e5File | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$e4Lines = $e4Content.Count
$e5Lines = $e5Content.Count
if ($e4Lines -ne 160 -or $e5Lines -ne 160) {
    throw ("Expected 160/160 frozen cases; got E4={0} E5={1}." -f $e4Lines, $e5Lines)
}

$logicalProviderCalls = 0
foreach ($line in @($e4Content + $e5Content)) {
    $entry = $line | ConvertFrom-Json
    $memberCount = @($entry.members).Count
    if ($memberCount -lt 1) {
        throw ("Frozen output has no provider members for case {0}." -f ([string]$entry.case_id))
    }
    $logicalProviderCalls += $memberCount
}
if ($logicalProviderCalls -ne 664) {
    throw ("Expected 664 frozen logical provider calls across E4/E5; found {0}." -f $logicalProviderCalls)
}

$manifestFile = Join-Path $runDir "BLIND-OUTPUT-MANIFEST.json"
if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
    throw ("Blind-output manifest is missing: {0}" -f $manifestFile)
}
$blindManifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
if ([string]$blindManifest.state -ne "FROZEN_BLIND_OUTPUTS") {
    throw ("Blind-output manifest is not frozen. State={0}" -f ([string]$blindManifest.state))
}

$summaryFile = Join-Path $runDir "WINDOWS-RUNNER-SUMMARY.json"
$summary = [ordered]@{
    packet_id = "BOOK-EVAL-LEMONADE-001"
    runner_script_version = $ScriptVersion
    state = "BLIND_OUTPUTS_FROZEN_VERIFIED"
    run_directory = $runDir
    model = $Model
    checkpoint = $checkpoint
    model_artifact_sha256 = $modelSha
    e4_frozen_cases = $e4Lines
    e5_frozen_cases = $e5Lines
    frozen_logical_provider_calls = $logicalProviderCalls
    java_status_provider_calls_last_process = $status.provider_calls_completed
    e4_frozen_sha256 = (Get-Sha256 $e4File)
    e5_frozen_sha256 = (Get-Sha256 $e5File)
    blind_output_manifest_sha256 = (Get-Sha256 $manifestFile)
}
$summary | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $summaryFile -Encoding UTF8

Write-Host "7/7 Packaging blind outputs for scoring..."
$runLeaf = Split-Path -Leaf $runDir
$zip = Join-Path $OutputRoot ($runLeaf + "_BLIND_OUTPUTS.zip")
if (Test-Path -LiteralPath $zip -PathType Leaf) {
    Remove-Item -LiteralPath $zip -Force
}
Compress-Archive -Path (Join-Path $runDir "*") -DestinationPath $zip -CompressionLevel Optimal
$zipSha = Get-Sha256 $zip

if (Test-Path -LiteralPath $activeFile -PathType Leaf) {
    Remove-Item -LiteralPath $activeFile -Force
}

Write-Host ""
Write-Host "BLIND RUN COMPLETE" -ForegroundColor Green
Write-Host ("E4 frozen cases: {0}/160" -f $e4Lines)
Write-Host ("E5 frozen cases: {0}/160" -f $e5Lines)
Write-Host ("Frozen logical provider calls: {0}" -f $logicalProviderCalls)
Write-Host ("Output ZIP: {0}" -f $zip)
Write-Host ("ZIP SHA-256: {0}" -f $zipSha)
Write-Host "Upload that ZIP to ChatGPT. Gold scoring has NOT been performed on this computer."
