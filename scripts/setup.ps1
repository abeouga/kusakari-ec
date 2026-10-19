param(
    [switch]$SkipInstall,
    [switch]$Reconfigure,
    [switch]$ExistingMySql,
    [ValidateSet('auto','existing','managed')][string]$DatabaseMode = 'auto'
)
. "$PSScriptRoot\common.ps1"
. "$PSScriptRoot\database.ps1"
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Set-Location $projectRoot
$lock = $null
try {
    try { $lock = [IO.File]::Open((Join-Path $runtimeDir 'setup.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'このフォルダーで別のsetupが実行中です。終了してから再実行してください。' }
    Initialize-Toolchain
    Initialize-Database $DatabaseMode -reconfigure:$Reconfigure
    if (-not $SkipInstall) {
        # Windows locks a running JAR. Only stop this checkout's verified processes.
        Stop-OwnedServices
        foreach ($command in @(@('ci'), @('run','build:api'), @('run','build:web'))) {
            & npm.cmd @command
            if ($LASTEXITCODE -ne 0) { throw '依存復元またはビルドに失敗しました。上の診断を確認してください。' }
        }
        & npx.cmd playwright install chromium
        if ($LASTEXITCODE -ne 0) { throw 'Chromiumの導入に失敗しました。' }
        & (Join-Path $projectRoot 'sysover-ray2\setup.ps1')
        if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'SysOverRayのビルドに失敗しました。' }
    }
    $jar = Join-Path $projectRoot 'backend\target\kusakari-ec-api-0.1.0.jar'
    if (-not (Test-Path -LiteralPath $jar)) { throw 'APIのビルドがありません。-SkipInstallを外して再実行してください。' }
    # Exercise Spring/Flyway for both DBs; never reset application data.
    $previousUrl = $env:KUSAKARI_EC_DB_URL
    try {
        foreach ($db in @('kusakari','kusakari_e2e')) {
            $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
            $listener.Start(); $apiPort = $listener.LocalEndpoint.Port; $listener.Stop()
            $env:KUSAKARI_EC_API_PORT = [string]$apiPort
            if ($db -eq 'kusakari_e2e') { $env:KUSAKARI_EC_DB_URL = $env:KUSAKARI_EC_E2E_DB_URL }
            $process = Start-Process -FilePath (Get-JavaExecutable) -ArgumentList @('-jar', "`"$jar`"") -WorkingDirectory $projectRoot `
                -WindowStyle Hidden -PassThru -RedirectStandardOutput "$runtimeDir\setup-$db.log" -RedirectStandardError "$runtimeDir\setup-$db-error.log"
            try {
                $deadline = (Get-Date).AddSeconds(60)
                $ready = $false
                do {
                    if ($process.HasExited) { throw "API/Flyway初期化失敗: $db。.runtimeのsetupログを確認してください。" }
                    try {
                        $health = Invoke-RestMethod "http://127.0.0.1:$apiPort/api/health" -TimeoutSec 2
                        $ready = $health.application -eq 'kusakari-ec'
                    } catch { Start-Sleep -Milliseconds 400 }
                } while (-not $ready -and (Get-Date) -lt $deadline)
                if (-not $ready) { throw 'セットアップ用APIが起動しませんでした。' }
                $verification = "SELECT COUNT(*) FROM $db.flyway_schema_history WHERE success=1; SELECT COUNT(*) FROM $db.products;"
                $result = (Invoke-MySql $env:KUSAKARI_EC_DB_USER $env:KUSAKARI_EC_DB_PASSWORD ([int]$env:KUSAKARI_EC_DB_PORT) $verification).Output -split "`r?`n"
                if ($result.Count -lt 2 -or [int]$result[0] -lt 1 -or [int]$result[1] -lt 4) { throw 'Flyway履歴または初期カタログの検証に失敗しました。' }
                Write-Host "$db : 実API起動・Flyway・商品データを確認しました。"
            } finally {
                if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force; $null = $process.WaitForExit(5000) }
                $process.Dispose()
            }
        }
    } finally { $env:KUSAKARI_EC_DB_URL = $previousUrl; Remove-Item Env:KUSAKARI_EC_API_PORT -ErrorAction SilentlyContinue }
    if ($ExistingMySql) {
        Write-Host '既存MySQL向けセットアップが完了しました。script-for-mysql\start.batで起動してください。'
    } else {
        Write-Host 'セットアップが完了しました。start.batで起動してください。'
    }
} finally { if ($lock) { $lock.Dispose() } }
