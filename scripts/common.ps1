$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
# A .bat launched from PowerShell 7 can inherit its incompatible core modules.
if ($PSVersionTable.PSVersion.Major -eq 5) { $env:PSModulePath = "$PSHOME\Modules;$env:PSModulePath" }
$runtimeDir = Join-Path $projectRoot '.runtime'
$servicePorts = @(8086, 5186)
. "$PSScriptRoot\toolchain.ps1"
Import-Toolchain

function Import-LocalSettings {
    $settingsFile = Join-Path $projectRoot '.env'
    if (-not (Test-Path -LiteralPath $settingsFile)) { throw '.env がありません。.env.example から作成してください。' }
    $allowed = @('KUSAKARI_EC_DB_USER','KUSAKARI_EC_DB_PASSWORD','KUSAKARI_EC_DB_URL','KUSAKARI_EC_E2E_DB_URL','KUSAKARI_EC_DB_PORT','KUSAKARI_EC_DATABASE_MODE','VITE_KUSAKARI_CANVAS_URL','KUSAKARI_CANVAS_API_URL','KUSAKARI_EC_OPENAI_API_KEY','KUSAKARI_EC_PLANT_SUGGESTION_MODEL','KUSAKARI_EC_E2E_OPENAI_API_KEY')
    foreach ($key in $allowed) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
    $seen = @{}
    foreach ($line in Get-Content -LiteralPath $settingsFile) {
        if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') {
            $key = $matches[1]
            if ($key -notin $allowed -or $seen.ContainsKey($key)) { throw '.envに未対応または重複する設定があります。setup.bat -Reconfigureで設定してください。' }
            $seen[$key] = $true
            $value = $matches[2].Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith("'") -and $value.EndsWith("'")) -or
                ($value.StartsWith('"') -and $value.EndsWith('"')))) { $value = $value.Substring(1, $value.Length - 2) }
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
    if (-not $env:KUSAKARI_EC_DB_PORT) { $env:KUSAKARI_EC_DB_PORT = '3306' }
    if (-not $env:KUSAKARI_EC_DATABASE_MODE) { $env:KUSAKARI_EC_DATABASE_MODE = 'existing' }
    foreach ($key in @('VITE_KUSAKARI_CANVAS_URL','KUSAKARI_CANVAS_API_URL')) {
        $value = [Environment]::GetEnvironmentVariable($key, 'Process')
        if ($value -and $value -notmatch '^http://127\.0\.0\.1:\d{1,5}/?$') {
            throw 'Windows起動のCanvas連携先は127.0.0.1のHTTP URLで指定してください。'
        }
    }
    if ($env:KUSAKARI_EC_DB_USER -notmatch '^[A-Za-z0-9_]{1,32}$' -or $env:KUSAKARI_EC_DB_USER -eq 'root') { throw 'アプリ用DBユーザー設定が不正です。setup.bat -Reconfigureで設定してください。' }
    if ($env:KUSAKARI_EC_DB_PORT -notmatch '^\d{1,5}$' -or [int]$env:KUSAKARI_EC_DB_PORT -lt 1 -or [int]$env:KUSAKARI_EC_DB_PORT -gt 65535) { throw 'DBポート設定が不正です。' }
    if ($env:KUSAKARI_EC_DATABASE_MODE -notin @('existing','managed')) { throw 'MySQL方式の設定が不正です。' }
    if (-not $env:KUSAKARI_EC_DB_PASSWORD -or $env:KUSAKARI_EC_DB_PASSWORD.Length -gt 128 -or $env:KUSAKARI_EC_DB_PASSWORD -match "['\r\n\x00]") { throw 'アプリ用DBパスワード設定が不正です。setup.bat -Reconfigureで設定してください。' }
    foreach ($pair in @(@('KUSAKARI_EC_DB_URL','kusakari'), @('KUSAKARI_EC_E2E_DB_URL','kusakari_e2e'))) {
        $url = [Environment]::GetEnvironmentVariable($pair[0], 'Process')
        $pattern = '^jdbc:mysql://127\.0\.0\.1:' + [regex]::Escape($env:KUSAKARI_EC_DB_PORT) + '/' + $pair[1] + '\?connectionTimeZone=UTC$'
        if ($url -notmatch $pattern) { throw 'DB設定は127.0.0.1のKusakari専用DBに限定しています。setup.bat -Reconfigureで設定してください。' }
    }
}

function Get-JavaExecutable {
    # The Oracle PATH launcher can spawn a second JVM. Start the actual JDK binary.
    $probe = New-Object System.Diagnostics.Process
    $probe.StartInfo.FileName = (Get-Command java.exe).Source
    $probe.StartInfo.Arguments = '-XshowSettings:properties -version'
    $probe.StartInfo.UseShellExecute = $false
    $probe.StartInfo.CreateNoWindow = $true
    $probe.StartInfo.RedirectStandardError = $true
    $null = $probe.Start()
    $settings = $probe.StandardError.ReadToEnd()
    $probe.WaitForExit()
    $javaMatch = [regex]::Match($settings, '(?m)^\s*java.home = (.+)\r?$')
    if (-not $javaMatch.Success) { throw 'Java の実行ファイルを特定できません。' }
    $executable = Join-Path $javaMatch.Groups[1].Value.Trim() 'bin\java.exe'
    if (-not (Test-Path -LiteralPath $executable)) { throw 'Java の実行ファイルが見つかりません。' }
    return $executable
}

function Get-NormalizedCommandPaths([string]$commandLine) {
    # Compare complete path arguments after resolving . and ..; never match a
    # checkout name as a substring of another project's command line.
    foreach ($argument in [regex]::Matches($commandLine, '"[^"\r\n]*"|[^\s"]+')) {
        $path = $argument.Value.Trim('"')
        if (-not [IO.Path]::IsPathRooted($path)) { continue }
        try { [IO.Path]::GetFullPath($path).ToLowerInvariant() }
        catch { continue }
    }
}

function Get-OwnedServiceProcesses {
    $apiMarkers = @(
        (Join-Path $projectRoot 'backend\target\kusakari-ec-api-0.1.0.jar'),
        # A process started before the identifier migration may still hold the old JAR open.
        (Join-Path $projectRoot 'backend\target\kusakari-api-0.1.0.jar')
    ) | ForEach-Object { $_.Replace('/', '\').ToLowerInvariant() }
    $webMarker = (Join-Path $projectRoot 'node_modules\vite\bin\vite.js').ToLowerInvariant()
    @(Get-CimInstance Win32_Process -Filter "Name='java.exe' OR Name='node.exe'" | ForEach-Object {
        $commandPaths = @(Get-NormalizedCommandPaths ([string]$_.CommandLine))
        $apiOwned = @($apiMarkers | Where-Object { $commandPaths -contains $_ }).Count -gt 0
        $kind = if ($_.Name -ieq 'java.exe' -and $apiOwned) { 'Api' }
            elseif ($_.Name -ieq 'node.exe' -and ($commandPaths -contains $webMarker)) { 'Web' }
            else { $null }
        if ($kind) {
            [pscustomobject]@{
                Id = [int]$_.ProcessId
                Created = $_.CreationDate.ToUniversalTime().ToString('o')
                Kind = $kind
            }
        }
    })
}

function Test-OwnedServiceProcess($record) {
    if (-not $record) { return $false }
    $current = @(Get-OwnedServiceProcesses | Where-Object {
        $_.Id -eq $record.Id -and $_.Created -eq $record.Created -and $_.Kind -eq $record.Kind
    })
    return $current.Count -eq 1
}

function Stop-OwnedServices {
    $deadline = (Get-Date).AddSeconds(20)
    do {
        $owned = @(Get-OwnedServiceProcesses)
        if ($owned.Count -eq 0) { return }
        foreach ($record in $owned) {
            if (-not (Test-OwnedServiceProcess $record)) { continue }
            $process = Get-Process -Id $record.Id -ErrorAction SilentlyContinue
            if (-not $process) { continue }
            Stop-Process -Id $record.Id -Force -ErrorAction Stop
            if (-not $process.WaitForExit(5000)) { throw "Kusakari $($record.Kind) を停止できません (PID $($record.Id))。" }
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    throw 'Kusakari の Web/API プロセスが残っています。'
}

function Assert-PortsAvailable {
    foreach ($port in $servicePorts) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        if ($listeners.Count -gt 0) {
            $ids = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ','
            throw "固定ポート $port は別プロセスが使用中です (PID $ids)。対象を確認してください。代替ポートでは起動しません。"
        }
    }
}

function Wait-Endpoint([string]$url, [int]$seconds = 60) {
    $deadline = (Get-Date).AddSeconds($seconds)
    do {
        try { return Invoke-RestMethod -Uri $url -TimeoutSec 2 }
        catch { Start-Sleep -Milliseconds 500 }
    } while ((Get-Date) -lt $deadline)
    throw "起動確認がタイムアウトしました: $url。 .runtime のログを確認してください。"
}

function Assert-ServicesHealthy {
    $api = Wait-Endpoint 'http://127.0.0.1:8086/api/health' 60
    if ($api.application -ne 'kusakari-ec' -or $api.backend -ne 'spring-boot') { throw 'API の応答元が Kusakari EC ではありません。' }
    $page = Wait-Endpoint 'http://127.0.0.1:5186/' 30
    if ([string]$page -notlike '*Kusakari*') { throw 'Web 画面の応答元が Kusakari ではありません。' }
    $proxy = Wait-Endpoint 'http://127.0.0.1:5186/api/health' 15
    if ($proxy.application -ne 'kusakari-ec') { throw 'Web から API への接続が機能していません。' }
}
