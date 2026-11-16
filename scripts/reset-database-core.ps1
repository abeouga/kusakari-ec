# DB の初期化の本体。scripts/reset-database.ps1 が、Web と API を止めて依存と API のビルドを準備してから呼ぶ。
# 実行したらそのまま最後まで進める（確認の入力や、対象の確かめで止まらない。2026-11-16 の決定、docs/database-reset.md）。
[CmdletBinding()]
param(
    # 対象を表示するだけで、何も変更しない。
    [switch]$DryRun,
    # 消す前のバックアップを取らない。
    [switch]$NoBackup
)
. "$PSScriptRoot\common.ps1"
. "$PSScriptRoot\database.ps1"
. "$PSScriptRoot\database-verify.ps1"
. "$PSScriptRoot\member-role.ps1"
. "$PSScriptRoot\set-test-accounts.ps1"

# 消してよい DB は、この2つだけ。入力や .env の値からは決めない（.env の書き間違いでほかの DB を消さないため）。
$resetDatabases = @('kusakari', 'kusakari_e2e')

function Get-ManagedStateRoot {
    if ($env:KUSAKARI_EC_MYSQL_HOME) { return $env:KUSAKARI_EC_MYSQL_HOME }
    return (Join-Path $env:LOCALAPPDATA 'Kusakari\mysql')
}

function Get-QueryLines([object]$target, [string]$sql) {
    $output = (Invoke-MySql $target.User $target.Password $target.Port $sql).Output
    return @($output -split "`r?`n" | Where-Object { $_ -ne '' })
}

# .env の接続先をそのまま使う。専用の MySQL が止まっていれば起動する。
function Get-ResetTarget {
    Import-LocalSettings
    $port = [int]$env:KUSAKARI_EC_DB_PORT
    $mode = $env:KUSAKARI_EC_DATABASE_MODE
    $script:mysqlBin = Get-KusakariEcMySqlBin -Portable:($mode -eq 'managed')
    if ($mode -eq 'managed' -and -not (Test-LocalPort $port) -and (Test-Path -LiteralPath (Join-Path (Get-ManagedStateRoot) 'instance.json'))) {
        Write-Host '専用MySQLが停止しているので起動します。'
        $null = Start-ManagedMySql
    }
    return [pscustomobject]@{ Mode = $mode; Port = $port; User = $env:KUSAKARI_EC_DB_USER; Password = $env:KUSAKARI_EC_DB_PASSWORD }
}

function Get-DatabaseSummary([object]$target, [string]$db) {
    $tables = @(Get-QueryLines $target "SELECT table_name FROM information_schema.tables WHERE table_schema='$db' ORDER BY table_name;")
    $counts = [ordered]@{}
    foreach ($table in @('members', 'organizations', 'stores', 'products', 'carts', 'orders')) {
        if ($tables -contains $table) { $counts[$table] = [int]@(Get-QueryLines $target "SELECT COUNT(*) FROM ``$db``.``$table``;")[0] }
    }
    return [pscustomobject]@{ Name = $db; TableCount = $tables.Count; Rows = $counts }
}

function Show-ResetPlan([object]$target, [object[]]$summaries) {
    $modeLabel = if ($target.Mode -eq 'managed') { 'Kusakari 専用の MySQL (managed)' } else { 'この PC に元からある MySQL (existing)' }
    Write-Host ''
    Write-Host "=== 作り直す DB（$modeLabel、ポート $($target.Port)、ユーザー $($target.User)） ==="
    foreach ($summary in $summaries) {
        if ($summary.TableCount -eq 0) { Write-Host "$($summary.Name) : テーブルなし"; continue }
        $rows = @($summary.Rows.Keys | ForEach-Object { "$_ $($summary.Rows[$_]) 行" }) -join '、'
        if ($rows) { $rows = "（$rows）" }
        Write-Host "$($summary.Name) : テーブル $($summary.TableCount) 個$rows"
    }
    Write-Host '同じ MySQL にあるほかの DB（Canvas の DB を含む）には触れません。'
}

# 失敗しても止めない。バックアップできなかったことを表示して、作り直しを続ける。
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
                Write-Host "$($summary.Name) のバックアップに失敗しました。バックアップなしで作り直します。"
            }
        } catch {
            Write-Host "$($summary.Name) のバックアップに失敗しました。バックアップなしで作り直します。"
        } finally { Remove-Item -LiteralPath $options -Force -ErrorAction SilentlyContinue }
    }
    return $folder
}

# 対象の DB に接続しているほかのプロセス（別の作業フォルダーの API や E2E など）の接続を切る。
# 切れなかった接続は、DROP DATABASE がその接続の処理の終わりを待つだけなので、止めずに続ける。
function Stop-DatabaseConnections([object]$target) {
    $names = ($resetDatabases | ForEach-Object { "'$_'" }) -join ','
    $ids = @(Get-QueryLines $target "SELECT id FROM information_schema.processlist WHERE db IN ($names) AND id <> CONNECTION_ID();")
    foreach ($id in $ids) {
        if ($id -match '^\d+$') { $null = Invoke-MySql $target.User $target.Password $target.Port "KILL $id;" -AllowFailure }
    }
    if ($ids.Count -gt 0) { Write-Host "対象の DB への接続を $($ids.Count) 個切りました。" }
}

$script:exitCode = 0
$lock = $null
$dropped = $false
try {
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    Set-Location $projectRoot
    # 同じフォルダーで setup と DB の初期化が同時に DB を作り直すと壊れるので、これだけは止める。
    try { $lock = [IO.File]::Open((Join-Path $runtimeDir 'setup.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'このフォルダーで setup または DB の初期化が実行中です。終了してから再実行してください。' }

    $target = Get-ResetTarget
    $summaries = @($resetDatabases | ForEach-Object { Get-DatabaseSummary $target $_ })
    Show-ResetPlan $target $summaries

    if ($DryRun) {
        Write-Host ''
        Write-Host '-DryRun のため、表示だけで終了します。何も変更していません。'
    } else {
        Stop-OwnedServices
        Stop-DatabaseConnections $target
        if (-not $NoBackup -and @($summaries | Where-Object { $_.TableCount -gt 0 }).Count -gt 0) {
            $backupFolder = Backup-Databases $target $summaries
            Write-Host "バックアップの保存先: $backupFolder"
        }
        foreach ($db in $resetDatabases) {
            if ($db -notmatch '^kusakari(_e2e)?$') { throw "初期化できない DB 名です: $db" }
            $null = Invoke-MySql $target.User $target.Password $target.Port ('DROP DATABASE IF EXISTS `{0}`; CREATE DATABASE `{0}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;' -f $db)
            $dropped = $true
            Write-Host "$db を作り直しました。"
        }
        Invoke-SchemaVerification
        # テスト用アカウント9つですぐにログインできるようにする（#157）。失敗しても、作り直した DB はそのまま使える。
        try { Set-TestAccounts } catch { Write-Host "テスト用アカウントをそろえられませんでした: $($_.Exception.Message)" }
        Write-Host ''
        Write-Host 'EC の DB の初期化が完了しました。start.bat で起動してください。'
        Write-Host 'Canvas の庭は、作り直した EC の会員と結び付きません。Canvas 側の DB も続けて初期化してください。'
    }
} catch {
    Write-Host ''
    Write-Host "エラー: $($_.Exception.Message)"
    if ($dropped) {
        Write-Host 'DB は空の状態で作り直されています。原因を直してから setup.bat を実行すると、テーブルが作られます。'
    } else {
        Write-Host 'DB は変更していません。'
    }
    $script:exitCode = 1
} finally { if ($lock) { $lock.Dispose() } }
exit $script:exitCode
