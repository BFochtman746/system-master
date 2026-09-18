# a01-lemonade-probe.ps1 — read A-01's real local inference topology off the box.
#
# WHY THIS EXISTS
#   `ModelDispatch` must call a verified endpoint, not a convention invented in a chat
#   session. The repository records the doctrine (governance/PLATFORM-DISPOSITION-DECISIONS-001.md
#   lines 76-78: "A-01 runs Lemonade Server on the Nimo box with a verified OpenAI-compatible
#   contract, under a standing doctrine of Lemonade primary and never Ollama because of the
#   gfx1151 silent-fallback bug") but records NO endpoint, NO port and NO model list. A repo-wide
#   search for any `localhost:<port>` returns zero matches. So the fact has to be read here.
#
# WHAT IS A SECRET AND WHAT IS NOT
#   An endpoint, a port and a model list on the owner's own machine are TOPOLOGY facts, and
#   committing them is what stops the next session from guessing. An API key, token or bearer
#   credential is NOT, and this script never prints one: responses are projected onto known
#   safe fields (model id / owner / created) and any value matching a credential shape is
#   replaced with "[redacted]" before it can reach a log.
#
# BOUNDED BY CONSTRUCTION
#   Every HTTP call carries -TimeoutSec. A server that is down, or a port that black-holes,
#   fails fast and visibly. The script never blocks waiting for a service.

$ErrorActionPreference = 'Continue'
$ProgressPreference    = 'SilentlyContinue'

$REQUEST_TIMEOUT_SEC = 5

function Redact-Value {
    param([string]$Value)
    if ([string]::IsNullOrEmpty($Value)) { return $Value }
    # Credential shapes: long opaque runs, or anything self-describing as a key/token/secret.
    if ($Value -match '(?i)(api[-_ ]?key|secret|token|bearer|password|authorization)') { return '[redacted]' }
    if ($Value -match '^[A-Za-z0-9_\-]{32,}$') { return '[redacted]' }
    return $Value
}

function Probe-OpenAiModels {
    param([string]$BaseUrl)
    $result = [ordered]@{
        base_url     = $BaseUrl
        reachable    = $false
        http_status  = $null
        contract_ok  = $false
        model_ids    = @()
        error        = $null
    }
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/models" -TimeoutSec $REQUEST_TIMEOUT_SEC -UseBasicParsing
        $result.reachable   = $true
        $result.http_status = [int]$resp.StatusCode
        $payload = $null
        try { $payload = $resp.Content | ConvertFrom-Json } catch { $result.error = 'response was not JSON'; return $result }
        # OpenAI-compatible contract: { "object": "list", "data": [ { "id": ... } ] }
        if ($null -ne $payload.data) {
            $ids = @()
            foreach ($m in $payload.data) { if ($m.id) { $ids += (Redact-Value ([string]$m.id)) } }
            $result.model_ids   = $ids
            $result.contract_ok = ($payload.object -eq 'list') -or ($ids.Count -gt 0)
        } else {
            $result.error = 'no data[] array — not an OpenAI-compatible /models response'
        }
    } catch {
        $result.error = (Redact-Value ($_.Exception.Message -replace '\s+', ' ')).Substring(0, [Math]::Min(200, ($_.Exception.Message -replace '\s+', ' ').Length))
    }
    return $result
}

Write-Host '=== 1. LISTENING PORTS (discover the real port, do not assume 8000) ==='
$listening = @()
try {
    $conns = Get-NetTCPConnection -State Listen -ErrorAction Stop
    foreach ($c in $conns) {
        $pname = '?'
        try { $pname = (Get-Process -Id $c.OwningProcess -ErrorAction Stop).ProcessName } catch { $pname = 'unknown' }
        $listening += [pscustomobject]@{ port = $c.LocalPort; process = $pname }
    }
    $listening = $listening | Sort-Object port -Unique
    foreach ($l in $listening) { Write-Host ("  port={0,-6} process={1}" -f $l.port, $l.process) }
} catch {
    Write-Host "  could not enumerate listening ports: $($_.Exception.Message)"
}

Write-Host ''
Write-Host '=== 2. INFERENCE-LIKE PROCESSES ==='
$procNames = @()
try {
    $procNames = (Get-Process -ErrorAction Stop | Where-Object { $_.ProcessName -match '(?i)lemonade|ollama|llama|vllm|lmstudio|localai' } | Select-Object -ExpandProperty ProcessName -Unique)
    if ($procNames.Count -eq 0) { Write-Host '  none matching lemonade|ollama|llama|vllm|lmstudio|localai' }
    else { foreach ($p in $procNames) { Write-Host "  process: $p" } }
} catch { Write-Host "  could not enumerate processes" }

# Candidate bases: ports owned by an inference-like process first, then documented defaults.
$candidates = New-Object System.Collections.Generic.List[string]
foreach ($l in $listening) {
    if ($l.process -match '(?i)lemonade|llama|localai|python|node') {
        $candidates.Add("http://localhost:$($l.port)/api/v1")
        $candidates.Add("http://localhost:$($l.port)/v1")
    }
}
foreach ($d in @('http://localhost:8000/api/v1','http://localhost:8000/v1','http://127.0.0.1:8000/api/v1','http://localhost:8020/api/v1','http://localhost:1234/v1')) {
    $candidates.Add($d)
}
$candidates = $candidates | Select-Object -Unique

Write-Host ''
Write-Host '=== 3. LEMONADE / OPENAI-COMPATIBLE CONTRACT PROBE ==='
$probes = @()
foreach ($c in $candidates) {
    $r = Probe-OpenAiModels -BaseUrl $c
    $probes += $r
    $status = if ($r.contract_ok) { 'CONTRACT OK' } elseif ($r.reachable) { 'reachable, contract NOT confirmed' } else { 'unreachable' }
    Write-Host ("  {0,-42} {1}" -f $c, $status)
    if ($r.model_ids.Count -gt 0) { Write-Host ("      models: {0}" -f ($r.model_ids -join ', ')) }
    if ($r.error) { Write-Host ("      error: {0}" -f $r.error) }
}

Write-Host ''
Write-Host '=== 4. OLLAMA CHECK (doctrine: never Ollama — gfx1151 silent fallback) ==='
$ollama = [ordered]@{ live = $false; port = 11434; detail = $null }
try {
    $o = Invoke-WebRequest -Uri 'http://localhost:11434/api/tags' -TimeoutSec $REQUEST_TIMEOUT_SEC -UseBasicParsing
    $ollama.live = $true
    $ollama.detail = "HTTP $([int]$o.StatusCode) on /api/tags"
    Write-Host '  *** OLLAMA IS LIVE — this contradicts the standing doctrine ***'
} catch {
    $ollama.detail = 'not reachable on 11434'
    Write-Host '  ollama not reachable on 11434 (consistent with doctrine)'
}
if ($procNames -match '(?i)ollama') {
    $ollama.live = $true
    Write-Host '  *** an ollama PROCESS is running ***'
}

$primary = $probes | Where-Object { $_.contract_ok } | Select-Object -First 1

Write-Host ''
Write-Host '=== 5. VERDICT ==='
if ($primary) {
    Write-Host "  lemonade_reachable=true  base_url=$($primary.base_url)  models=$($primary.model_ids.Count)"
} else {
    Write-Host '  lemonade_reachable=false — no OpenAI-compatible /models endpoint answered'
}

$summary = [ordered]@{
    probe                  = 'A01-LEMONADE-TOPOLOGY-001'
    runner                 = $env:RUNNER_NAME
    lemonade_reachable     = [bool]$primary
    lemonade_base_url      = if ($primary) { $primary.base_url } else { $null }
    openai_contract_ok     = if ($primary) { $primary.contract_ok } else { $false }
    models_loaded          = if ($primary) { $primary.model_ids } else { @() }
    model_count            = if ($primary) { $primary.model_ids.Count } else { 0 }
    ollama                 = $ollama
    inference_processes    = $procNames
    candidates_probed      = $candidates.Count
    listening_port_count   = $listening.Count
}

Write-Host ''
Write-Host 'LEMONADE-PROBE-JSON-BEGIN'
Write-Host ($summary | ConvertTo-Json -Depth 6 -Compress)
Write-Host 'LEMONADE-PROBE-JSON-END'

# The probe REPORTS. An absent server is a finding to record, not a reason to fail the run,
# so the exit code reflects only whether the probe itself completed.
exit 0
