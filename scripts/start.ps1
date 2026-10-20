param([switch]$NoBrowser, [switch]$NoOverlay)
. "$PSScriptRoot\common.ps1"
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) {
    throw '接続設定がありません。setup.batを実行し、MySQLの接続情報を入力してください。'
}
Import-LocalSettings
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
. "$PSScriptRoot\database.ps1"
$mysqlBin = Get-KusakariEcMySqlBin -Portable:($env:KUSAKARI_EC_DATABASE_MODE -eq 'managed')
if ($env:KUSAKARI_EC_DATABASE_MODE -eq 'managed') {
    $stateRoot = if ($env:KUSAKARI_EC_MYSQL_HOME) { $env:KUSAKARI_EC_MYSQL_HOME } else { Join-Path $env:LOCALAPPDATA 'Kusakari\mysql' }
    $stateFile = Join-Path $stateRoot 'instance.json'
    if (Test-Path -LiteralPath $stateFile) {
        $null = Start-ManagedMySql
    } else {
        # A copied .env can exist before this machine has created its managed
        # instance. Prepare it from the already discovered MySQL binaries so
        # start.bat remains a one-step entry point.
        Write-Host '既存のMySQL実行ファイルでKusakari専用MySQLを初期化します。'
        Initialize-KusakariEcMySqlRuntime $mysqlBin
        $null = Initialize-ManagedMySql ([int]$env:KUSAKARI_EC_DB_PORT)
        # Provision the application user and schemas for this newly created DB.
        Initialize-Database 'managed' -reconfigure
    }
}
$null = Invoke-MySql $env:KUSAKARI_EC_DB_USER $env:KUSAKARI_EC_DB_PASSWORD ([int]$env:KUSAKARI_EC_DB_PORT) 'USE kusakari; SELECT 1;'

$jar = Join-Path $projectRoot 'backend\target\kusakari-ec-api-0.1.0.jar'
$vite = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $jar) -or -not (Test-Path -LiteralPath $vite)) {
    throw 'API または Web の依存がありません。setup.bat を実行してください。'
}

# Replace this checkout's old services on the same two ports. Ignore stale PID records.
Stop-OwnedServices
Assert-PortsAvailable
$stateFile = Join-Path $runtimeDir 'processes.json'
$apiRecord = $null
$webRecord = $null
try {
    $env:KUSAKARI_EC_API_PORT = '8086'
    $env:KUSAKARI_EC_WEB_ORIGIN = 'http://127.0.0.1:5186'
    $javaExecutable = Get-JavaExecutable
    # Keep JDK's AF_UNIX pipe sockets outside AppData; MSIX-packaged launchers (e.g. agent apps) make connects there fail.
    $javaSocketDir = Join-Path $runtimeDir 'java-tmp'
    New-Item -ItemType Directory -Path $javaSocketDir -Force | Out-Null
    $apiProcess = Start-Process -FilePath $javaExecutable -ArgumentList @("`"-Djdk.net.unixdomain.tmpdir=$javaSocketDir`"", '-jar', "`"$jar`"") `
        -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput "$runtimeDir\api.log" -RedirectStandardError "$runtimeDir\api-error.log"
    $apiRecord = @(Get-OwnedServiceProcesses | Where-Object Id -eq $apiProcess.Id | Select-Object -First 1)[0]
    if (-not $apiRecord) { throw '起動した API プロセスの所有を確認できません。' }
    $health = Wait-Endpoint 'http://127.0.0.1:8086/api/health'
    if ($health.application -ne 'kusakari-ec' -or $health.backend -ne 'spring-boot') {
        throw '起動した API の応答元が Kusakari ではありません。'
    }

    # Vite does not inherit database credentials.
    Remove-Item Env:KUSAKARI_EC_OPENAI_API_KEY, Env:KUSAKARI_EC_E2E_OPENAI_API_KEY, Env:KUSAKARI_EC_DB_PASSWORD, Env:KUSAKARI_EC_DB_USER, Env:KUSAKARI_EC_DB_URL, Env:KUSAKARI_EC_E2E_DB_URL -ErrorAction SilentlyContinue
    $env:KUSAKARI_EC_API_TARGET = 'http://127.0.0.1:8086'
    $webProcess = Start-Process -FilePath 'node' -ArgumentList @("`"$vite`"", '--host', '127.0.0.1', '--port', '5186', '--strictPort') `
        -WorkingDirectory "$projectRoot\frontend" -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput "$runtimeDir\web.log" -RedirectStandardError "$runtimeDir\web-error.log"
    $webRecord = @(Get-OwnedServiceProcesses | Where-Object Id -eq $webProcess.Id | Select-Object -First 1)[0]
    if (-not $webRecord) { throw '起動した Web プロセスの所有を確認できません。' }
    Assert-ServicesHealthy
    @{ Api = $apiRecord; Web = $webRecord } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
} catch {
    foreach ($record in @($apiRecord, $webRecord)) {
        if (Test-OwnedServiceProcess $record) { Stop-Process -Id $record.Id -Force -ErrorAction SilentlyContinue }
    }
    throw
}

Write-Host 'Kusakari Web: http://127.0.0.1:5186  API: http://127.0.0.1:8086'
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:5186' }
if (-not $NoOverlay) {
    & (Join-Path $projectRoot 'sysover-ray2\start.ps1')
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'SysOverRay の操作画面を確認できませんでした。' }
}
