function Assert-MySqlCompatibility([string]$user, [string]$password, [int]$port) {
    $result = (Invoke-MySql $user $password $port "SELECT VERSION(); SHOW COLLATION LIKE 'utf8mb4_0900_ai_ci'; SET time_zone='+00:00';").Output
    $version = ($result -split "`r?`n")[0]
    if ($version -notmatch '^8\.' -or $version -match '(?i)mariadb' -or $result -notmatch 'utf8mb4_0900_ai_ci') {
        throw 'MySQL 8.0/8.4とutf8mb4_0900_ai_ciが必要です。script\mysql-environment\setup-mysql.bat -DatabaseMode managedで専用DBを準備できます。'
    }
    Write-Host "MySQL $version : 照合順序・UTCセッションを確認しました。"
}

function Assert-KusakariSchema([string]$user, [string]$password, [int]$port, [string]$db) {
    $tables = (Invoke-MySql $user $password $port "SELECT table_name FROM information_schema.tables WHERE table_schema='$db';").Output
    if (-not $tables) { return }
    $actual = @($tables -split "`r?`n")
    if ($actual -notcontains 'flyway_schema_history') { throw "$db はFlyway管理DBではありません。変更せず停止します。" }
    $history = (Invoke-MySql $user $password $port "SELECT version,script,success FROM $db.flyway_schema_history ORDER BY installed_rank;").Output
    $migrations = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'backend\src\main\resources\db\migration') -Filter 'V*__*.sql' |
        Sort-Object { [int]([regex]::Match($_.Name, '^V(\d+)__').Groups[1].Value) })
    $rows = @($history -split "`r?`n")
    $expected = @('flyway_schema_history')
    $index = 0
    foreach ($row in $rows) {
        $fields = $row -split "`t"
        if ($index -ge $migrations.Count -or $fields.Count -ne 3) { throw "$db のFlyway履歴が未対応です。変更せず停止します。" }
        $migration = $migrations[$index]
        $version = [regex]::Match($migration.Name, '^V(\d+)__').Groups[1].Value
        if ($fields[0] -ne $version -or $fields[1] -cne $migration.Name -or $fields[2] -ne '1') {
            throw "$db のFlyway履歴がソースと一致しません。変更せず停止します。"
        }
        $sql = [IO.File]::ReadAllText($migration.FullName)
        foreach ($match in [regex]::Matches($sql, '(?im)^\s*CREATE\s+TABLE\s+`?([a-z_]+)`?\b')) { $expected += $match.Groups[1].Value }
        $index++
    }
    if (@(Compare-Object ($expected | Sort-Object -Unique) ($actual | Sort-Object -Unique)).Count -gt 0) {
        throw "$db のテーブル構成がFlyway履歴と一致しません。変更せず停止します。"
    }
    # Flyway validates checksums and Hibernate validates columns at API startup.
}

function Save-DatabaseSettings([string]$path, [string[]]$databaseLines) {
    $retained = @()
    if (Test-Path -LiteralPath $path) {
        Set-PrivateFile (Join-Path $runtimeDir 'env.previous') ([IO.File]::ReadAllText($path))
        $retained = @(Get-Content -LiteralPath $path | Where-Object {
            $_ -notmatch '^KUSAKARI_EC_(DATABASE_MODE|DB_PORT|DB_USER|DB_PASSWORD|DB_URL|E2E_DB_URL)='
        })
    }
    $retained += @(Get-MissingPublicLoginSettings $retained)
    Set-PrivateFile $path ((@($databaseLines) + $retained -join "`n") + "`n")
}

# Tracked public login defaults absent from $lines; local overrides are retained.
function Get-MissingPublicLoginSettings([string[]]$lines) {
    $public = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'config\cognito.development.json') | ConvertFrom-Json
    foreach ($property in $public.PSObject.Properties) {
        if (-not @($lines | Where-Object { $_ -match ('^' + [regex]::Escape($property.Name) + '=') }).Count) {
            "$($property.Name)=$($property.Value)"
        }
    }
}

# A .env saved before the Cognito defaults existed is reused without rewriting
# its DB settings; only the missing public login settings are appended.
function Add-MissingPublicLoginSettings([string]$path) {
    $lines = @(Get-Content -LiteralPath $path)
    $missing = @(Get-MissingPublicLoginSettings $lines)
    if (-not $missing.Count) { return }
    $text = [IO.File]::ReadAllText($path)
    Set-PrivateFile (Join-Path $runtimeDir 'env.previous') $text
    $separator = if ($text -and -not $text.EndsWith("`n")) { "`n" } else { '' }
    Set-PrivateFile $path ($text + $separator + ($missing -join "`n") + "`n")
    Write-Host "保存済みの.envに不足していたCognito公開設定を追加しました: $(($missing | ForEach-Object { $_.Split('=')[0] }) -join ', ')"
}
