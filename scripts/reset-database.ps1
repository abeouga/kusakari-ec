[CmdletBinding()]
param(
    # 対象を表示するだけで、何も変更しない。
    [switch]$DryRun,
    # 消す前のバックアップを取らない。
    [switch]$NoBackup,
    # 確認の文字を引数で渡す（検証用）。指定しないときは画面で入力を求める。
    [string]$ConfirmText
)
. "$PSScriptRoot\common.ps1"
. "$PSScriptRoot\database.ps1"
. "$PSScriptRoot\database-verify.ps1"

# 消してよい DB は、この2つだけ。入力や .env の値からは決めない。
$resetDatabases = @('kusakari', 'kusakari_e2e')
$confirmPhrase = 'RESET kusakari'
$exitCancelled = 2

function Get-ManagedStateRoot {
    if ($env:KUSAKARI_EC_MYSQL_HOME) { return $env:KUSAKARI_EC_MYSQL_HOME }
    return (Join-Path $env:LOCALAPPDATA 'Kusakari\mysql')
}

function Get-QueryLines([object]$target, [string]$sql) {
    $output = (Invoke-MySql $target.User $target.Password $target.Port $sql).Output
    return @($output -split "`r?`n" | Where-Object { $_ -ne '' })
}

# .env の接続先が、この PC で動いている1つの MySQL だと確かめる。確かめられないときは例外にして、何も変更しない。
function Get-ResetTarget {
    Import-LocalSettings
    $port = [int]$env:KUSAKARI_EC_DB_PORT
    $mode = $env:KUSAKARI_EC_DATABASE_MODE
    $script:mysqlBin = Get-KusakariEcMySqlBin -Portable:($mode -eq 'managed')

    $stateRoot = Get-ManagedStateRoot
    $stateFile = Join-Path $stateRoot 'instance.json'
    $state = $null
    if (Test-Path -LiteralPath $stateFile) {
        try { $state = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json }
        catch { throw "専用MySQLの記録を読めません: $stateFile" }
    }
    if ($mode -eq 'managed') {
        if (-not $state) { throw "専用MySQLの記録がありません: $stateFile。setup.bat を実行してください。" }
        if ([int]$state.Port -ne $port) { throw ".env のポート ($port) と専用MySQLの記録のポート ($($state.Port)) が一致しません。" }
        if (-not (Test-LocalPort $port)) {
            Write-Host '専用MySQLが停止しているので起動します。'
            $null = Start-ManagedMySql
        }
    }
    if (-not (Test-LocalPort $port)) { throw "MySQL が TCP $port で応答していません。MySQL を起動してから再実行してください。" }

    $owners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
    if ($owners.Count -ne 1) { throw "TCP $port を待ち受けているプロセスを1つに特定できません（$($owners.Count) 個）。" }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($owners[0])" -ErrorAction SilentlyContinue
    if (-not $process) { throw "TCP $port を待ち受けているプロセス (PID $($owners[0])) の情報を取得できません。" }
    if ($process.Name -notmatch '(?i)^mysqld\.exe$') { throw "TCP $port を待ち受けているのは mysqld.exe ではありません（$($process.Name)）。" }

    $target = [pscustomobject]@{
        Mode = $mode; Port = $port; User = $env:KUSAKARI_EC_DB_USER; Password = $env:KUSAKARI_EC_DB_PASSWORD
        ProcessId = [int]$process.ProcessId; Executable = [string]$process.ExecutablePath
        Version = ''; DataDirectory = ''; BaseDirectory = ''; ServerId = ''
    }
    # 接続した先のサーバー自身に、ポートとデータの場所を答えさせる。
    $facts = @(Get-QueryLines $target 'SELECT @@port; SELECT @@datadir; SELECT @@basedir; SELECT VERSION(); SELECT @@server_uuid;')
    if ($facts.Count -ne 5) { throw 'MySQL からサーバーの情報を取得できません。' }
    if ([int]$facts[0] -ne $port) { throw "接続した MySQL のポート ($($facts[0])) が .env のポート ($port) と一致しません。" }
    # mysql.exe の --batch は \ を \\ で出力する。
    $target.DataDirectory = $facts[1].Replace('\\', '\')
    $target.BaseDirectory = $facts[2].Replace('\\', '\')
    $target.Version = $facts[3]
    $target.ServerId = $facts[4]
    if (-not $target.Executable) { $target.Executable = Join-Path $target.BaseDirectory 'bin\mysqld.exe' }

    $managedData = Join-Path $stateRoot 'data'
    $isManagedData = $state -and (Test-MySqlDataDirectory $target.DataDirectory $managedData)
    if ($mode -eq 'managed' -and -not $isManagedData) {
        throw "接続した MySQL のデータの場所 ($($target.DataDirectory)) が、専用MySQLのデータの場所 ($managedData) と一致しません。"
    }
    if ($mode -eq 'existing' -and $isManagedData) {
        throw ".env は既存の MySQL (existing) を指していますが、接続先は専用MySQLです。setup.bat -Reconfigure で設定し直してください。"
    }
    return $target
}

function Get-DatabaseSummary([object]$target, [string]$db) {
    $exists = [int]@(Get-QueryLines $target "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$db';")[0] -eq 1
    $tables = @()
    if ($exists) { $tables = @(Get-QueryLines $target "SELECT table_name FROM information_schema.tables WHERE table_schema='$db' ORDER BY table_name;") }
    if ($tables.Count -gt 0 -and $tables -notcontains 'flyway_schema_history') {
        throw "$db に Kusakari EC のマイグレーション履歴 (flyway_schema_history) がありません。別の用途の DB の可能性があるので、変更せず停止します。"
    }
    $counts = [ordered]@{}
    $migrations = 0
    if ($tables.Count -gt 0) {
        $migrations = [int]@(Get-QueryLines $target "SELECT COUNT(*) FROM ``$db``.flyway_schema_history WHERE success=1;")[0]
        foreach ($table in @('auth_members', 'members', 'organizations', 'stores', 'products', 'carts', 'orders')) {
            if ($tables -contains $table) { $counts[$table] = [int]@(Get-QueryLines $target "SELECT COUNT(*) FROM ``$db``.``$table``;")[0] }
        }
    }
    return [pscustomobject]@{ Name = $db; Exists = $exists; TableCount = $tables.Count; Migrations = $migrations; Rows = $counts }
}

# DB の削除と作成に必要な権限を、消す前に確かめる。途中で止まって DB がない状態を残さないため。
function Assert-ResetPrivileges([object]$target) {
    $grants = @(Get-QueryLines $target 'SHOW GRANTS FOR CURRENT_USER;' | ForEach-Object { $_.Replace('\', '') })
    foreach ($db in $resetDatabases) {
        $covered = $false
        foreach ($line in $grants) {
            if ($line -notmatch (' ON (\*\.\*|`' + [regex]::Escape($db) + '`\.\*) TO ')) { continue }
            $privileges = (($line -replace '^GRANT ', '') -replace ' ON .*$', '') -split ',\s*'
            if ($privileges -contains 'ALL PRIVILEGES' -or ($privileges -contains 'CREATE' -and $privileges -contains 'DROP')) { $covered = $true }
        }
        if (-not $covered) {
            throw "DB ユーザー $($target.User) に、$db を作り直す権限 (CREATE と DROP) がありません。setup.bat -Reconfigure で権限を付け直してください。"
        }
    }
}

function Show-ResetPlan([object]$target, [object[]]$summaries) {
    $modeLabel = if ($target.Mode -eq 'managed') { 'Kusakari 専用の MySQL (managed)' } else { 'この PC に元からある MySQL (existing)' }
    Write-Host ''
    Write-Host '=== 初期化の対象 ==='
    Write-Host "MySQL の方式     : $modeLabel"
    Write-Host "ポート           : $($target.Port)"
    Write-Host "プロセス         : mysqld.exe (PID $($target.ProcessId))"
    Write-Host "実行ファイル     : $($target.Executable)"
    Write-Host "データの場所     : $($target.DataDirectory)"
    Write-Host "バージョン       : $($target.Version)"
    Write-Host "接続するユーザー : $($target.User)"
    Write-Host ''
    Write-Host '=== 消して作り直す DB（この2つだけ） ==='
    foreach ($summary in $summaries) {
        if (-not $summary.Exists) { Write-Host "$($summary.Name) : まだありません（新しく作ります）"; continue }
        $rows = @($summary.Rows.Keys | ForEach-Object { "$_ $($summary.Rows[$_]) 行" }) -join '、'
        if (-not $rows) { $rows = 'なし' }
        Write-Host "$($summary.Name) : テーブル $($summary.TableCount) 個、適用済みマイグレーション $($summary.Migrations) 件"
        Write-Host "  主なテーブルの行数 : $rows"
    }
    Write-Host ''
    Write-Host '同じ MySQL にあるほかの DB（Canvas の DB を含む）には触れません。'
    Write-Host '消した DB のデータは元に戻せません。会員・店舗・商品・注文がすべて消えます。'
}

function Backup-Databases([object]$target, [object[]]$summaries) {
    $folder = Join-Path $runtimeDir ('backups\db-reset-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    foreach ($summary in @($summaries | Where-Object { $_.TableCount -gt 0 })) {
        $file = Join-Path $folder "$($summary.Name).sql"
        # 会員の情報を含むので、実行した人だけが読めるファイルにしてから書き込む。
        Set-PrivateFile $file ''
        $options = Join-Path (Get-MySqlDefaultsDirectory) ('kusakari-ec-' + [guid]::NewGuid().ToString('N') + '.cnf')
        $escaped = $target.Password.Replace('\', '\\').Replace('"', '\"')
        try {
            Set-PrivateFile $options "[client]`nhost=127.0.0.1`nport=$($target.Port)`nuser=$($target.User)`npassword=`"$escaped`"`nprotocol=TCP`n"
            $arguments = "--defaults-file=`"$options`" --default-character-set=utf8mb4 --single-transaction --skip-lock-tables --no-tablespaces --hex-blob --result-file=`"$(ConvertTo-MySqlCompatiblePath $file)`" $($summary.Name)"
            $dump = Start-Process -FilePath (Join-Path $mysqlBin 'mysqldump.exe') -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
            if ($dump.ExitCode -ne 0 -or (Get-Item -LiteralPath $file).Length -eq 0) {
                throw "$($summary.Name) のバックアップに失敗しました。何も変更していません。バックアップなしで進めるときは -NoBackup を付けてください。"
            }
        } finally { Remove-Item -LiteralPath $options -Force -ErrorAction SilentlyContinue }
    }
    return $folder
}

# 初期化の間にほかのプロセスが対象の DB を使っていると、そのプロセスが壊れた状態で動き続ける。
function Assert-NoOtherConnections([object]$target) {
    $deadline = (Get-Date).AddSeconds(8)
    do {
        $busy = @(Get-QueryLines $target 'SHOW PROCESSLIST;' | Where-Object {
            $fields = $_ -split "`t"
            $fields.Count -ge 4 -and $resetDatabases -contains $fields[3]
        })
        if ($busy.Count -eq 0) { return }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    throw "対象の DB に接続中のプロセスが $($busy.Count) 個あります。ほかの作業フォルダーの API や E2E を停止してから再実行してください。何も変更していません。"
}

$script:exitCode = 0
$lock = $null
$dropped = $false
$backupFolder = $null
try {
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    Set-Location $projectRoot
    try { $lock = [IO.File]::Open((Join-Path $runtimeDir 'setup.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'このフォルダーで setup または DB の初期化が実行中です。終了してから再実行してください。' }

    $target = Get-ResetTarget
    $summaries = @($resetDatabases | ForEach-Object { Get-DatabaseSummary $target $_ })
    Assert-ResetPrivileges $target
    Show-ResetPlan $target $summaries

    if ($DryRun) {
        Write-Host ''
        Write-Host '-DryRun のため、表示だけで終了します。何も変更していません。'
    } else {
        $jar = Join-Path $projectRoot 'backend\target\kusakari-ec-api-0.1.0.jar'
        if (-not (Test-Path -LiteralPath $jar)) { throw 'API のビルドがありません。先に setup.bat を実行してください。何も変更していません。' }
        Write-Host ''
        Write-Host "初期化するには、次の文字をそのまま入力してください: $confirmPhrase"
        $answer = if ($PSBoundParameters.ContainsKey('ConfirmText')) { $ConfirmText } else { Read-Host '入力' }
        if ($answer -cne $confirmPhrase) {
            Write-Host '入力が一致しないため中止しました。何も変更していません。'
            $script:exitCode = $exitCancelled
        } else {
            # このフォルダーから起動した API と Web だけを止める。別プロジェクトのプロセスは止めない。
            Stop-OwnedServices
            Assert-NoOtherConnections $target
            if (-not $NoBackup -and @($summaries | Where-Object { $_.TableCount -gt 0 }).Count -gt 0) {
                $backupFolder = Backup-Databases $target $summaries
                Write-Host "バックアップを保存しました: $backupFolder"
            }
            foreach ($db in $resetDatabases) {
                if ($db -notmatch '^kusakari(_e2e)?$') { throw "初期化できない DB 名です: $db" }
                $null = Invoke-MySql $target.User $target.Password $target.Port ('DROP DATABASE IF EXISTS `{0}`; CREATE DATABASE `{0}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;' -f $db)
                $dropped = $true
                Write-Host "$db を作り直しました。"
            }
            Invoke-SchemaVerification
            Write-Host ''
            Write-Host 'EC の DB の初期化が完了しました。start.bat で起動してください。'
            Write-Host 'Canvas の庭は、作り直した EC の会員と結び付きません。Canvas 側の DB も続けて初期化してください。'
        }
    }
} catch {
    Write-Host ''
    Write-Host "エラー: $($_.Exception.Message)"
    if ($dropped) {
        Write-Host 'DB は空の状態で作り直されています。原因を直してから setup.bat を実行すると、テーブルが作られます。'
        if ($backupFolder) { Write-Host "消す前のバックアップ: $backupFolder" }
    } else {
        Write-Host 'DB は変更していません。'
    }
    $script:exitCode = 1
} finally { if ($lock) { $lock.Dispose() } }
exit $script:exitCode
