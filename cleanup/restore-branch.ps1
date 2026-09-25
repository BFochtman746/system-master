# Restore one branch removed by the 2026-09-25 cleanup. PowerShell 5.1 safe.
# Usage:  .\cleanup\restore-branch.ps1 -Branch learning/some-branch
param([Parameter(Mandatory=$true)][string]$Branch)
$row = Get-Content cleanup\BRANCH-MANIFEST-2026-09-25.tsv | Where-Object { ($_ -split "`t")[1] -eq $Branch } | Select-Object -First 1
if (-not $row) { throw "RESTORE_BRANCH_NOT_IN_MANIFEST: $Branch" }
$sha = ($row -split "`t")[2]
Write-Host "Restoring $Branch at $sha"
git fetch origin "refs/tags/archive/$Branch" 2>$null
git fetch origin $sha 2>$null
git push origin "$($sha):refs/heads/$Branch"
if ($LASTEXITCODE -ne 0) { throw "RESTORE_PUSH_FAILED:$LASTEXITCODE" }
