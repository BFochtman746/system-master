param(
  [string]$Database = $env:A01_SUPERVISOR_DB,
  [string]$RepositoryRoot = "",
  [int]$PollSeconds = 5,
  [int]$LeaseSeconds = 300,
  [int]$RenewSeconds = 30,
  [switch]$Once
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Database)) {
  throw 'A01_SUPERVISOR_DB (or -Database) is required.'
}
if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
  $RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}
$worker = Join-Path $RepositoryRoot 'control-gateway\python\a01_execution_worker_hardened.py'
if (-not (Test-Path -LiteralPath $worker)) {
  throw "A-01 hardened execution worker not found: $worker"
}

$args = @(
  $worker,
  '--db', $Database,
  '--root', $RepositoryRoot,
  '--poll-seconds', [string]$PollSeconds,
  '--lease-seconds', [string]$LeaseSeconds,
  '--renew-seconds', [string]$RenewSeconds
)
if ($Once) { $args += '--once' }

& python @args
exit $LASTEXITCODE
