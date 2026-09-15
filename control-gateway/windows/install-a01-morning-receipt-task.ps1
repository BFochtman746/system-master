param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,

    [string]$DatabasePath = 'C:\SystemMaster\a01-supervisor.db',
    [string]$StateDir = 'C:\SystemMaster\a01-ingress',
    [string]$EvidenceDir = 'C:\SystemMaster\evidence\morning-receipts',
    [string]$TaskName = 'SystemMaster-A01-MorningReceipt',
    [string]$LocalTime = '07:15'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Install must run from elevated PowerShell because the task runs as LocalSystem.'
}

$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
$runner = Join-Path $repo 'control-gateway\windows\run-a01-morning-receipt.ps1'
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
    throw "P15 morning receipt runner not found: $runner"
}

try {
    $parsedTime = [DateTime]::ParseExact($LocalTime, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
}
catch {
    throw "LocalTime must use HH:mm format: $LocalTime"
}

$escapedRunner = $runner.Replace('"', '""')
$escapedRepo = $repo.Replace('"', '""')
$escapedDb = $DatabasePath.Replace('"', '""')
$escapedState = $StateDir.Replace('"', '""')
$escapedEvidence = $EvidenceDir.Replace('"', '""')
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$escapedRunner`" -RepoRoot `"$escapedRepo`" -DatabasePath `"$escapedDb`" -StateDir `"$escapedState`" -EvidenceDir `"$escapedEvidence`""

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At $parsedTime.ToString('HH:mm')
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -WakeToRun `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
    -MultipleInstances IgnoreNew

$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
    -Description 'System Master P15 read-only A-01 morning receipt. Exit 0 clean, 1 attention, 2 unreadable.'
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host "P15_TASK_NAME=$($registered.TaskName)"
Write-Host "P15_TASK_STATE=$($registered.State)"
Write-Host "P15_TASK_NEXT_RUN=$($info.NextRunTime.ToString('o'))"
Write-Host "P15_TASK_PRINCIPAL=$($registered.Principal.UserId)"
