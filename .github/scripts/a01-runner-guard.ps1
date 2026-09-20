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
$memoryPerf = $null
try { $memoryPerf = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory -ErrorAction Stop } catch {}
$committedMemoryGb = if ($memoryPerf -and $null -ne $memoryPerf.CommittedBytes) { [math]::Round(([double]$memoryPerf.CommittedBytes) / 1GB, 2) } else { $null }
$commitLimitGb = if ($memoryPerf -and $null -ne $memoryPerf.CommitLimit) { [math]::Round(([double]$memoryPerf.CommitLimit) / 1GB, 2) } else { $null }
$commitHeadroomGb = if ($null -ne $committedMemoryGb -and $null -ne $commitLimitGb) { [math]::Round([math]::Max(0, $commitLimitGb - $committedMemoryGb), 2) } else { $null }
$node = Get-Command node -ErrorAction SilentlyContinue
$git = Get-Command git -ErrorAction SilentlyContinue

$warnings = New-Object System.Collections.Generic.List[string]
$failures = New-Object System.Collections.Generic.List[string]

$topMemoryProcesses = @()
try {
  $topMemoryProcesses = @(Get-Process -ErrorAction SilentlyContinue |
    Sort-Object WorkingSet64 -Descending |
    Select-Object -First 10 |
    ForEach-Object {
      [ordered]@{
        name = $_.ProcessName
        id = $_.Id
        working_set_gb = [math]::Round($_.WorkingSet64 / 1GB, 2)
        private_memory_gb = [math]::Round($_.PrivateMemorySize64 / 1GB, 2)
      }
    })
} catch {
  $warnings.Add("TOP_MEMORY_PROCESS_SNAPSHOT_UNAVAILABLE:$($_.Exception.Message)")
}

$memoryProfile = $health.memory_profile
$memoryProfileMode = if ($memoryProfile -and $memoryProfile.mode) { [string]$memoryProfile.mode } else { 'GENERIC' }
$qualificationId = [string]$env:A01_QUALIFICATION_ID
$commitGateQualificationIds = @()
if ($memoryProfile -and $memoryProfile.commit_headroom_qualification_ids) {
  $commitGateQualificationIds = @($memoryProfile.commit_headroom_qualification_ids | ForEach-Object { [string]$_ })
}
$commitGateRequired = if ($commitGateQualificationIds.Count -gt 0) { $commitGateQualificationIds -contains $qualificationId } else { $true }
$lemonadeCleanup = [ordered]@{
  attempted = $false
  succeeded = $false
  endpoint = $null
  before_commit_headroom_gb = $commitHeadroomGb
  after_commit_headroom_gb = $commitHeadroomGb
  error = $null
}
$memoryProfileMatch = $false
$declaredUnifiedTotalGb = $null
$configuredVgmGb = $null
$unifiedTotalToleranceGb = $null
$estimatedUnifiedTotalGb = $null
$minCommitHeadroomGb = $null

if ($memoryProfileMode -eq 'UNIFIED_VGM_SPLIT') {
  $declaredUnifiedTotalGb = [double]$memoryProfile.unified_total_gb
  $configuredVgmGb = [double]$memoryProfile.configured_vgm_gb
  $unifiedTotalToleranceGb = [double]$memoryProfile.unified_total_tolerance_gb
  $minCommitHeadroomGb = [double]$memoryProfile.min_commit_headroom_gb

  if ($declaredUnifiedTotalGb -le 0 -or $configuredVgmGb -lt 0 -or $unifiedTotalToleranceGb -lt 0 -or $minCommitHeadroomGb -le 0) {
    $failures.Add('MEMORY_PROFILE_POLICY_INVALID')
  } else {
    $estimatedUnifiedTotalGb = [math]::Round($totalMemoryGb + $configuredVgmGb, 2)
    if ([math]::Abs($estimatedUnifiedTotalGb - $declaredUnifiedTotalGb) -gt $unifiedTotalToleranceGb) {
      $failures.Add("MEMORY_PROFILE_MISMATCH estimated_unified_gb=$estimatedUnifiedTotalGb expected_unified_gb=$declaredUnifiedTotalGb tolerance_gb=$unifiedTotalToleranceGb windows_visible_gb=$totalMemoryGb configured_vgm_gb=$configuredVgmGb")
    } else {
      $memoryProfileMatch = $true
      if ($null -eq $commitHeadroomGb) {
        if ($commitGateRequired) {
          $failures.Add('COMMIT_HEADROOM_UNAVAILABLE')
        } else {
          $warnings.Add("COMMIT_HEADROOM_UNAVAILABLE_NON_LLM qualification_id=$qualificationId")
        }
      } elseif ($commitHeadroomGb -lt $minCommitHeadroomGb) {
        if ($commitGateRequired) {
          $allowUnload = $Mode -eq 'preflight' -and
            $qualificationId -eq 'A01-LOCAL-INFERENCE-BASELINE-001' -and
            $memoryProfile.lemonade_unload_before_local_inference -eq $true

          if ($allowUnload) {
            $lemonadeCleanup.attempted = $true
            $baseUrl = [string]$memoryProfile.lemonade_base_url
            if (-not $baseUrl) { $baseUrl = 'http://127.0.0.1:13305/api/v1' }
            # One path, not a guess between two. lemonade_base_url carries the /api/v1
            # prefix, so the route below is appended to it verbatim. Trying several paths
            # until one answers hid the fact that the configured base was wrong.
            $paths = @('/unload')
            foreach ($path in $paths) {
              try {
                $uri = $baseUrl.TrimEnd('/') + $path
                $null = Invoke-RestMethod -Method Post -Uri $uri -TimeoutSec 10 -ErrorAction Stop
                $lemonadeCleanup.succeeded = $true
                $lemonadeCleanup.endpoint = $uri
                break
              } catch {
                $lemonadeCleanup.error = $_.Exception.Message
              }
            }

            if ($lemonadeCleanup.succeeded) {
              $waitSeconds = if ($memoryProfile.lemonade_unload_wait_seconds) { [int]$memoryProfile.lemonade_unload_wait_seconds } else { 15 }
              $deadline = (Get-Date).AddSeconds([math]::Max(1, $waitSeconds))
              do {
                Start-Sleep -Seconds 1
                $os = Get-CimInstance Win32_OperatingSystem
                $availableMemoryGb = [math]::Round(($os.FreePhysicalMemory * 1KB) / 1GB, 2)
                try { $memoryPerf = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory -ErrorAction Stop } catch { $memoryPerf = $null }
                $committedMemoryGb = if ($memoryPerf -and $null -ne $memoryPerf.CommittedBytes) { [math]::Round(([double]$memoryPerf.CommittedBytes) / 1GB, 2) } else { $null }
                $commitLimitGb = if ($memoryPerf -and $null -ne $memoryPerf.CommitLimit) { [math]::Round(([double]$memoryPerf.CommitLimit) / 1GB, 2) } else { $null }
                $commitHeadroomGb = if ($null -ne $committedMemoryGb -and $null -ne $commitLimitGb) { [math]::Round([math]::Max(0, $commitLimitGb - $committedMemoryGb), 2) } else { $null }
              } while ($null -ne $commitHeadroomGb -and $commitHeadroomGb -lt $minCommitHeadroomGb -and (Get-Date) -lt $deadline)
              $lemonadeCleanup.after_commit_headroom_gb = $commitHeadroomGb
            }
          }

          if ($null -eq $commitHeadroomGb) {
            $failures.Add('COMMIT_HEADROOM_UNAVAILABLE')
          } elseif ($commitHeadroomGb -lt $minCommitHeadroomGb) {
            $failures.Add("LOW_COMMIT_HEADROOM headroom_gb=$commitHeadroomGb required_gb=$minCommitHeadroomGb")
          } elseif ($lemonadeCleanup.succeeded) {
            $warnings.Add("LEMONADE_MODELS_UNLOADED_FOR_LOCAL_INFERENCE before_headroom_gb=$($lemonadeCleanup.before_commit_headroom_gb) after_headroom_gb=$commitHeadroomGb")
          }
        } else {
          $warnings.Add("LOW_COMMIT_HEADROOM_NON_LLM qualification_id=$qualificationId headroom_gb=$commitHeadroomGb local_inference_required_gb=$minCommitHeadroomGb")
        }
      }
    }
  }
} elseif ($memoryProfileMode -ne 'GENERIC') {
  $failures.Add("MEMORY_PROFILE_UNSUPPORTED mode=$memoryProfileMode")
}

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
  if ($memoryProfileMode -eq 'UNIFIED_VGM_SPLIT' -and $memoryProfileMatch) {
    if (-not $commitGateRequired -or ($null -ne $commitHeadroomGb -and $commitHeadroomGb -ge $minCommitHeadroomGb)) {
      $warnings.Add("LOW_CPU_PHYSICAL_MEMORY available_gb=$availableMemoryGb generic_required_gb=$($health.min_available_memory_gb) commit_headroom_gb=$commitHeadroomGb")
    }
  } else {
    $failures.Add("LOW_MEMORY available_gb=$availableMemoryGb required_gb=$($health.min_available_memory_gb)")
  }
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
  guard_version = 4
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
    committed_memory_gb = $committedMemoryGb
    commit_limit_gb = $commitLimitGb
    commit_headroom_gb = $commitHeadroomGb
    memory_profile = [ordered]@{
      mode = $memoryProfileMode
      declared_unified_total_gb = $declaredUnifiedTotalGb
      configured_vgm_gb = $configuredVgmGb
      unified_total_tolerance_gb = $unifiedTotalToleranceGb
      estimated_unified_total_gb = $estimatedUnifiedTotalGb
      profile_match = $memoryProfileMatch
      min_commit_headroom_gb = $minCommitHeadroomGb
      qualification_id = $qualificationId
      commit_gate_required = $commitGateRequired
      lemonade_cleanup = $lemonadeCleanup
    }
    top_memory_processes = @($topMemoryProcesses)
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

Write-Host "A01_RUNNER_GUARD=$($snapshot.standing) mode=$Mode qualification=$qualificationId memory_gb=$availableMemoryGb commit_headroom_gb=$commitHeadroomGb profile=$memoryProfileMode profile_match=$memoryProfileMatch commit_gate_required=$commitGateRequired lemonade_cleanup=$($lemonadeCleanup.succeeded)"
exit 0
