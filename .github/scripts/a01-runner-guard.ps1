param(
  [ValidateSet('preflight','postflight')]
  [string]$Mode = 'preflight',
  [string]$EvidenceDir = $env:A01_EVIDENCE_DIR
)

$ErrorActionPreference = 'Stop'

function Write-JsonFile([string]$Path, $Value) {
  $parent = Split-Path -Parent $Path
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  $Value | ConvertTo-Json -Depth 8 | Set-Content -Path $Path -Encoding UTF8
}

function Get-DriveSnapshot([string]$TargetPath) {
  if (-not $TargetPath) { return $null }
  $full = [System.IO.Path]::GetFullPath($TargetPath)
  $root = [System.IO.Path]::GetPathRoot($full)
  if (-not $root) { return $null }
  $drive = New-Object System.IO.DriveInfo($root)
  return [ordered]@{
    root = $drive.Name
    total_gb = [math]::Round($drive.TotalSize / 1GB, 2)
    free_gb = [math]::Round($drive.AvailableFreeSpace / 1GB, 2)
    free_percent = if ($drive.TotalSize -gt 0) { [math]::Round(($drive.AvailableFreeSpace / $drive.TotalSize) * 100, 2) } else { 0 }
  }
}

if (-not $EvidenceDir) {
  $baseTemp = $env:RUNNER_TEMP
  if (-not $baseTemp) { $baseTemp = $env:TEMP }
  $EvidenceDir = Join-Path $baseTemp ("a01-guard-" + $env:GITHUB_RUN_ID)
}
New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null

$controlRoot = $env:A01_CONTROL_ROOT
if (-not $controlRoot) { $controlRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$policyPath = Join-Path $controlRoot 'qualification\a01\a01-policy.json'
$policy = Get-Content -Raw -Path $policyPath | ConvertFrom-Json
$health = $policy.runner.health

$now = Get-Date
$os = Get-CimInstance Win32_OperatingSystem
$computer = Get-CimInstance Win32_ComputerSystem
$workspaceDrive = Get-DriveSnapshot $env:GITHUB_WORKSPACE
$tempDrive = Get-DriveSnapshot $env:RUNNER_TEMP
$availableMemoryGb = [math]::Round(($os.FreePhysicalMemory * 1KB) / 1GB, 2)
$totalMemoryGb = [math]::Round($computer.TotalPhysicalMemory / 1GB, 2)
$node = Get-Command node -ErrorAction SilentlyContinue
$git = Get-Command git -ErrorAction SilentlyContinue

$warnings = New-Object System.Collections.Generic.List[string]
$failures = New-Object System.Collections.Generic.List[string]

if ($env:RUNNER_NAME -ne $policy.runner.name) { $failures.Add("RUNNER_NAME expected=$($policy.runner.name) actual=$($env:RUNNER_NAME)") }
if ($env:RUNNER_OS -ne 'Windows') { $failures.Add("RUNNER_OS expected=Windows actual=$($env:RUNNER_OS)") }
if ($env:RUNNER_ARCH -ne 'X64') { $failures.Add("RUNNER_ARCH expected=X64 actual=$($env:RUNNER_ARCH)") }
if ($health.require_node -and -not $node) { $failures.Add('NODE_NOT_FOUND') }
if ($health.require_git -and -not $git) { $failures.Add('GIT_NOT_FOUND') }

$diskSnapshots = @($workspaceDrive, $tempDrive) | Where-Object { $_ -ne $null } | Group-Object root | ForEach-Object { $_.Group[0] }
foreach ($drive in $diskSnapshots) {
  if ($drive.free_gb -lt [double]$health.min_free_disk_gb) {
    $failures.Add("LOW_DISK root=$($drive.root) free_gb=$($drive.free_gb) required_gb=$($health.min_free_disk_gb)")
  }
}
if ($availableMemoryGb -lt [double]$health.min_available_memory_gb) {
  $failures.Add("LOW_MEMORY available_gb=$availableMemoryGb required_gb=$($health.min_available_memory_gb)")
}

$sleepGuardCapable = $false
if ($health.prevent_system_sleep_during_qualification) {
  try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class A01SleepGuardProbe {
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern uint SetThreadExecutionState(uint esFlags);
}
'@
    $ES_CONTINUOUS = [Convert]::ToUInt32('80000000', 16)
    $ES_SYSTEM_REQUIRED = [Convert]::ToUInt32('00000001', 16)
    $probe = [A01SleepGuardProbe]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED)
    if ($probe -eq 0) {
      $failures.Add('SLEEP_GUARD_UNAVAILABLE')
    } else {
      $sleepGuardCapable = $true
      [void][A01SleepGuardProbe]::SetThreadExecutionState($ES_CONTINUOUS)
    }
  } catch {
    $failures.Add("SLEEP_GUARD_PROBE_ERROR:$($_.Exception.Message)")
  }
}

$networkOk = $null
try {
  $networkOk = Test-NetConnection api.github.com -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
  if (-not $networkOk) { $warnings.Add('GITHUB_HTTPS_PROBE_FAILED') }
} catch {
  $warnings.Add("GITHUB_HTTPS_PROBE_ERROR:$($_.Exception.Message)")
}

$powerScheme = $null
try { $powerScheme = (& powercfg /getactivescheme 2>$null | Out-String).Trim() } catch { $warnings.Add('POWER_SCHEME_UNREADABLE') }

$cleanup = @()
if ($health.cleanup_stale_a01_temp_after_hours -and $env:RUNNER_TEMP) {
  $cutoff = $now.AddHours(-1 * [double]$health.cleanup_stale_a01_temp_after_hours)
  try {
    Get-ChildItem -Path $env:RUNNER_TEMP -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like 'a01-*' -and $_.FullName -ne $EvidenceDir -and $_.LastWriteTime -lt $cutoff } |
      ForEach-Object {
        $entry = [ordered]@{ path = $_.FullName; removed = $false; error = $null }
        try {
          Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
          $entry.removed = $true
        } catch {
          $entry.error = $_.Exception.Message
          $warnings.Add("STALE_TEMP_CLEANUP_FAILED:$($_.FullName)")
        }
        $script:cleanup += $entry
      }
  } catch {
    $warnings.Add("STALE_TEMP_ENUMERATION_FAILED:$($_.Exception.Message)")
  }
}

$snapshot = [ordered]@{
  guard_version = 3
  mode = $Mode
  captured_at = (Get-Date).ToUniversalTime().ToString('o')
  runner = [ordered]@{
    name = $env:RUNNER_NAME
    os = $env:RUNNER_OS
    arch = $env:RUNNER_ARCH
    computer_name = $env:COMPUTERNAME
  }
  tools = [ordered]@{
    node = if ($node) { $node.Source } else { $null }
    git = if ($git) { $git.Source } else { $null }
  }
  resources = [ordered]@{
    total_memory_gb = $totalMemoryGb
    available_memory_gb = $availableMemoryGb
    drives = @($diskSnapshots)
  }
  network = [ordered]@{ github_https_443 = $networkOk }
  power = [ordered]@{ active_scheme = $powerScheme; sleep_guard_capable = $sleepGuardCapable }
  cleanup = @($cleanup)
  warnings = @($warnings)
  failures = @($failures)
  standing = if ($failures.Count -eq 0) { 'PASS' } else { 'FAIL' }
}

$outName = if ($Mode -eq 'preflight') { 'runner-preflight.json' } else { 'runner-postflight.json' }
Write-JsonFile (Join-Path $EvidenceDir $outName) $snapshot

if ($env:GITHUB_OUTPUT) {
  "standing=$($snapshot.standing)" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append
  if ($snapshot.standing -eq 'FAIL') { 'result_class=INFRA_FAILURE' | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append }
}

if ($snapshot.standing -eq 'FAIL' -and $Mode -eq 'preflight') {
  ($failures -join [Environment]::NewLine) | Set-Content -Path (Join-Path $EvidenceDir 'runner-preflight-failure.txt') -Encoding UTF8
  Write-Error ("A01_RUNNER_PREFLIGHT_FAILED: " + ($failures -join '; '))
  exit 2
}

Write-Host "A01_RUNNER_GUARD=$($snapshot.standing) mode=$Mode memory_gb=$availableMemoryGb"
exit 0
