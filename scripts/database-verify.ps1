# setup.bat と DB-reset.bat の両方が使う。
# 開発用・E2E 用の DB それぞれに API を起動して Flyway を実行し、マイグレーション履歴・商品・会員テーブル・
# ログイン用 API を確かめる。アプリのデータは消さない。
function Invoke-SchemaVerification {
    $jar = Join-Path $projectRoot 'backend\target\kusakari-ec-api-0.1.0.jar'
    if (-not (Test-Path -LiteralPath $jar)) { throw 'APIのビルドがありません。-SkipInstallを外して再実行してください。' }
    $previousUrl = $env:KUSAKARI_EC_DB_URL
    $previousPort = $env:KUSAKARI_EC_API_PORT
    $latestMigration = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'backend\src\main\resources\db\migration') -Filter 'V*__*.sql').Count
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
                $verification = "SELECT COUNT(*) FROM $db.flyway_schema_history WHERE success=1; SELECT COUNT(*) FROM $db.products; SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='$db' AND table_name='auth_members' AND column_name IN ('id','issuer','subject','enabled','withdrawn_at');"
                $result = (Invoke-MySql $env:KUSAKARI_EC_DB_USER $env:KUSAKARI_EC_DB_PASSWORD ([int]$env:KUSAKARI_EC_DB_PORT) $verification).Output -split "`r?`n"
                if ($result.Count -ne 3 -or [int]$result[0] -ne $latestMigration -or [int]$result[1] -lt 4 -or [int]$result[2] -ne 5) { throw '最新Flyway履歴・商品・会員テーブルの検証に失敗しました。' }
                $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
                $me = Invoke-RestMethod "http://127.0.0.1:$apiPort/api/auth/me" -WebSession $session -TimeoutSec 10
                $csrf = Invoke-RestMethod "http://127.0.0.1:$apiPort/api/auth/csrf" -WebSession $session -TimeoutSec 10
                if ($me.authenticated -ne $false -or -not $csrf.token) { throw 'Cognitoログイン用APIの検証に失敗しました。' }
                Write-Host "$db : 最新Flyway・会員テーブル・実API・ログイン用APIを確認しました。"
            } finally {
                if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force; $null = $process.WaitForExit(5000) }
                $process.Dispose()
            }
        }
    } finally { $env:KUSAKARI_EC_DB_URL = $previousUrl; $env:KUSAKARI_EC_API_PORT = $previousPort }
}
