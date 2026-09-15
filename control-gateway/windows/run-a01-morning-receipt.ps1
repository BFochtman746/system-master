param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,

    [string]$DatabasePath = 'C:\SystemMaster\a01-supervisor.db',
    [string]$StateDir = 'C:\SystemMaster\a01-ingress',
    [string]$EvidenceDir = 'C:\SystemMaster\evidence\morning-receipts'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
$module = Join-Path $repo 'control-gateway\python\a01_morning_receipt.py'
if (-not (Test-Path -LiteralPath $module -PathType Leaf)) {
    throw "P15 morning receipt module not found: $module"
}
if (-not (Test-Path -LiteralPath $DatabasePath -PathType Leaf)) {
    throw "A-01 supervisor database not found: $DatabasePath"
}

New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$receiptPath = Join-Path $EvidenceDir "a01-morning-receipt-$stamp.json"

$oldPythonPath = $env:PYTHONPATH
try {
    $env:PYTHONPATH = "$repo\control-gateway\python;$repo"
    & python -m a01_morning_receipt `
        --db $DatabasePath `
        --state-dir $StateDir `
        --json `
        --out $receiptPath
    $receiptExit = $LASTEXITCODE
}
finally {
    $env:PYTHONPATH = $oldPythonPath
}

if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) {
    throw "P15 morning receipt did not produce evidence: $receiptPath"
}

$latestPath = Join-Path $EvidenceDir 'LATEST.json'
Copy-Item -LiteralPath $receiptPath -Destination $latestPath -Force
Write-Host "P15_MORNING_RECEIPT_PATH=$receiptPath"
Write-Host "P15_MORNING_RECEIPT_EXIT=$receiptExit"
exit $receiptExit
