$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$workspace = $env:GITHUB_WORKSPACE
if (-not $workspace) { $workspace = (Get-Location).Path }
$controlPath = Join-Path $workspace 'system-master\g-target-windows-reboot\control\QUALIFICATION-SUBJECT.json'
$control = Get-Content -Raw -Path $controlPath | ConvertFrom-Json
$qualificationId = [string]$control.qualification_id
$phase = [string]$control.phase
$baseCommit = [string]$control.base_closure_commit

$runnerWork = Split-Path $env:RUNNER_TEMP -Parent
$runnerRoot = Split-Path $runnerWork -Parent
$persistentRoot = Join-Path $runnerRoot '_qualification\continuity-target-windows-reboot'
$persistentDir = Join-Path $persistentRoot $qualificationId
$evidenceDir = Join-Path $env:RUNNER_TEMP ("system-master-continuity-target-windows-reboot-" + $env:GITHUB_RUN_ID)
New-Item -ItemType Directory -Force -Path $persistentDir | Out-Null
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

function Write-Evidence([string]$Name, [string]$Value) {
    $path = Join-Path $evidenceDir $Name
    Set-Content -Path $path -Value $Value -Encoding UTF8
}

function Invoke-Git([string[]]$Args) {
    $out = & git -c ("safe.directory=" + $workspace) @Args 2>&1
    if ($LASTEXITCODE -ne 0) { throw "GIT_FAILED:$($Args -join ' '):$out" }
    return ($out -join "`n")
}

function Compile-Qualification {
    $classes = Join-Path $evidenceDir 'classes'
    New-Item -ItemType Directory -Force -Path $classes | Out-Null
    $sourceDirs = @('g-wp-002','g-wp-015')
    $sources = New-Object System.Collections.Generic.List[string]
    foreach ($dirName in $sourceDirs) {
        $dir = Join-Path $workspace ("system-master\" + $dirName + '\src\main\java\org\systemmaster\continuity')
        Get-ChildItem -Path $dir -Filter '*.java' | Sort-Object FullName | ForEach-Object { [void]$sources.Add($_.FullName) }
    }
    $testFile = Join-Path $workspace 'system-master\g-target-windows-reboot\src\test\java\org\systemmaster\continuity\WindowsRebootRecoveryQualification.java'
    [void]$sources.Add($testFile)
    $argFile = Join-Path $evidenceDir 'javac-sources.txt'
    Set-Content -Path $argFile -Value ($sources -join "`r`n") -Encoding ASCII
    $compile = & javac -encoding UTF-8 -d $classes ("@" + $argFile) 2>&1
    Set-Content -Path (Join-Path $evidenceDir 'compile.txt') -Value ($compile -join "`n") -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw "JAVAC_FAILED:$($compile -join ' ')" }
    return $classes
}

function Invoke-Java([string]$Mode, [string]$Classes) {
    $out = & java -cp $Classes 'org.systemmaster.continuity.WindowsRebootRecoveryQualification' $Mode $persistentDir $qualificationId $env:GITHUB_SHA $env:GITHUB_RUN_ID 2>&1
    Set-Content -Path (Join-Path $evidenceDir ("java-" + $Mode.ToLowerInvariant() + '.txt')) -Value ($out -join "`n") -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw "JAVA_${Mode}_FAILED:$($out -join ' ')" }
    return ($out -join "`n")
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'TARGET_WINDOWS_REBOOT_REQUIRES_WINDOWS_NT' }
    Invoke-Git @('merge-base','--is-ancestor',$baseCommit,'HEAD') | Out-Null
    Write-Evidence 'subject.txt' ("objective=CONTINUITY-TARGET-WINDOWS-REBOOT-QUALIFICATION`nqualification_id=$qualificationId`nphase=$phase`ncommit=$env:GITHUB_SHA`nrun_id=$env:GITHUB_RUN_ID`nrunner=$env:RUNNER_NAME`nmachine=$env:COMPUTERNAME`nevidence_class=TARGET_WINDOWS_REBOOT")
    $classes = Compile-Qualification

    if ($phase -eq 'ARM') {
        $services = @(Get-CimInstance Win32_Service | Where-Object { $_.Name -like 'actions.runner.*' -or $_.PathName -like '*RunnerService.exe*' })
        $service = $services | Where-Object { $_.StartMode -eq 'Auto' } | Select-Object -First 1
        if (-not $service) {
            throw 'RUNNER_AUTO_START_NOT_PROVEN:no automatic actions.runner service found; reboot refused'
        }
        $pending = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') -or
                   (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired')
        if ($pending) { throw 'PREEXISTING_WINDOWS_REBOOT_PENDING:qualification reboot refused' }

        $armOut = Invoke-Java 'ARM' $classes
        $armPropsPath = Join-Path $persistentDir 'java-arm.properties'
        if (-not (Test-Path $armPropsPath)) { throw 'ARM_PROPERTIES_MISSING' }
        $journalLine = Get-Content $armPropsPath | Where-Object { $_ -like 'journal_path=*' } | Select-Object -First 1
        if (-not $journalLine) { throw 'JOURNAL_PATH_MISSING' }
        $journalPath = $journalLine.Substring('journal_path='.Length)
        if (-not (Test-Path $journalPath)) { throw "JOURNAL_FILE_MISSING:$journalPath" }
        $journalHash = (Get-FileHash -Algorithm SHA256 -Path $journalPath).Hash.ToLowerInvariant()
        $boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime()
        $armedAt = [DateTime]::UtcNow
        $pre = [ordered]@{
            qualification_id = $qualificationId
            arm_commit = $env:GITHUB_SHA
            arm_run_id = $env:GITHUB_RUN_ID
            runner_name = $env:RUNNER_NAME
            machine_name = $env:COMPUTERNAME
            runner_service_name = $service.Name
            runner_service_start_mode = $service.StartMode
            runner_service_start_name = $service.StartName
            boot_time_utc = $boot.ToString('o')
            armed_at_utc = $armedAt.ToString('o')
            journal_path = $journalPath
            journal_sha256_before_reboot = $journalHash
            evidence_class = 'TARGET_WINDOWS_REBOOT'
            reboot_command = 'shutdown.exe /r /t 0 (non-forced)'
        }
        $prePath = Join-Path $persistentDir 'pre-reboot.json'
        $pre | ConvertTo-Json -Depth 4 | Set-Content -Path $prePath -Encoding UTF8
        Set-Content -Path (Join-Path $persistentDir 'runner-service.txt') -Value ("name=$($service.Name)`nstart_mode=$($service.StartMode)`nstart_name=$($service.StartName)`npath=$($service.PathName)") -Encoding UTF8
        Copy-Item (Join-Path $evidenceDir 'compile.txt') (Join-Path $persistentDir 'arm-compile.txt') -Force
        Copy-Item (Join-Path $evidenceDir 'java-arm.txt') (Join-Path $persistentDir 'arm-java.txt') -Force
        Write-Evidence 'arm-result.txt' ("result=ARMED_FOR_REAL_WINDOWS_REBOOT`njava=$armOut`nrunner_auto_start=PROVEN`npreexisting_reboot_pending=false`njournal_sha256=$journalHash`nreboot_force=false")
        Write-Host "ARMED TARGET_WINDOWS_REBOOT qualification_id=$qualificationId runner_service=$($service.Name) journal_sha256=$journalHash"
        Write-Host 'Initiating non-forced Windows reboot now. This job is expected to disconnect.'
        & shutdown.exe /r /t 0 /d p:4:1 /c 'System Master TARGET_WINDOWS_REBOOT qualification'
        if ($LASTEXITCODE -ne 0) { throw "WINDOWS_REBOOT_COMMAND_FAILED:$LASTEXITCODE" }
        Start-Sleep -Seconds 90
        throw 'WINDOWS_REBOOT_NOT_OBSERVED_FROM_ARM_PROCESS'
    }

    if ($phase -eq 'VERIFY') {
        $prePath = Join-Path $persistentDir 'pre-reboot.json'
        if (-not (Test-Path $prePath)) { throw 'PRE_REBOOT_EVIDENCE_MISSING' }
        $pre = Get-Content -Raw -Path $prePath | ConvertFrom-Json
        if ([string]$pre.qualification_id -ne $qualificationId) { throw 'QUALIFICATION_ID_MISMATCH' }
        $armCommit = [string]$pre.arm_commit
        Invoke-Git @('merge-base','--is-ancestor',$armCommit,'HEAD') | Out-Null
        $changed = @(Invoke-Git @('diff','--name-only',$armCommit,'HEAD') -split "`r?`n" | Where-Object { $_ })
        $allowed = 'system-master/g-target-windows-reboot/control/QUALIFICATION-SUBJECT.json'
        $forbidden = @($changed | Where-Object { $_ -ne $allowed })
        if ($forbidden.Count -gt 0) { throw "QUALIFICATION_SUBJECT_CHANGED_AFTER_REBOOT_ARM:$($forbidden -join ',')" }

        $beforeBoot = [DateTime]::Parse([string]$pre.boot_time_utc).ToUniversalTime()
        $currentBoot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime()
        if ($currentBoot -le $beforeBoot) { throw "WINDOWS_REBOOT_NOT_PROVEN:before=$($beforeBoot.ToString('o')) current=$($currentBoot.ToString('o'))" }
        $journalPath = [string]$pre.journal_path
        if (-not (Test-Path $journalPath)) { throw 'POST_REBOOT_JOURNAL_MISSING' }
        $journalHashBeforeVerify = (Get-FileHash -Algorithm SHA256 -Path $journalPath).Hash.ToLowerInvariant()
        if ($journalHashBeforeVerify -ne [string]$pre.journal_sha256_before_reboot) {
            throw "DURABLE_JOURNAL_CHANGED_ACROSS_REBOOT_BEFORE_VERIFY:$journalHashBeforeVerify"
        }

        $verifyOut = Invoke-Java 'VERIFY' $classes
        Copy-Item $prePath (Join-Path $evidenceDir 'pre-reboot.json') -Force
        Copy-Item (Join-Path $persistentDir 'java-arm.properties') (Join-Path $evidenceDir 'java-arm.properties') -Force
        Copy-Item (Join-Path $persistentDir 'java-verify.properties') (Join-Path $evidenceDir 'java-verify.properties') -Force
        Copy-Item (Join-Path $persistentDir 'runner-service.txt') (Join-Path $evidenceDir 'runner-service.txt') -Force
        $post = [ordered]@{
            result = 'PASS'
            evidence_class = 'TARGET_WINDOWS_REBOOT'
            qualification_id = $qualificationId
            arm_commit = $armCommit
            verification_commit = $env:GITHUB_SHA
            arm_run_id = [string]$pre.arm_run_id
            verification_run_id = $env:GITHUB_RUN_ID
            boot_time_before_utc = $beforeBoot.ToString('o')
            boot_time_after_utc = $currentBoot.ToString('o')
            boot_time_changed = $true
            journal_sha256_before_reboot = [string]$pre.journal_sha256_before_reboot
            journal_sha256_after_reboot_before_verify = $journalHashBeforeVerify
            durable_journal_identical_across_reboot_before_verify = $true
            g_rq_004_target_windows_reboot = 'PASS'
            g_rq_072_target_windows_reboot = 'PASS'
            g_rq_072_target_ios_suspend_resume = 'NOT_STARTED'
            g_rq_072_implementation_satisfied = $false
            empirical_human_evidence = 'NOT_STARTED'
            production_authorized = $false
        }
        $post | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $evidenceDir 'post-reboot-result.json') -Encoding UTF8
        Write-Evidence 'result.txt' ("result=PASS`nevidence_class=TARGET_WINDOWS_REBOOT`ng_rq_004=PASS`ng_rq_072_windows=PASS`ng_rq_072_ios=NOT_STARTED`ng_rq_072_implementation_satisfied=false`nhuman_evidence=NOT_STARTED`nproduction_authorized=false`njava=$verifyOut")
        Write-Host "PASS TARGET_WINDOWS_REBOOT qualification_id=$qualificationId G-RQ-004=PASS G-RQ-072-WINDOWS=PASS IOS=NOT_STARTED"
        exit 0
    }

    throw "UNKNOWN_QUALIFICATION_PHASE:$phase"
}
catch {
    $detail = $_ | Out-String
    Write-Evidence 'failure.txt' $detail
    Write-Evidence 'result.txt' ("result=FAIL_OR_INCOMPLETE`nphase=$phase`nevidence_class=TARGET_WINDOWS_REBOOT")
    Write-Error $detail
    exit 1
}
