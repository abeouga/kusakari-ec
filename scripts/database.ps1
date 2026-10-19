. "$PSScriptRoot\mysql-tools.ps1"

function Set-PrivateFile([string]$path, [string]$content) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if (-not (Test-Path -LiteralPath $path)) { New-Item -ItemType File -Path $path -Force | Out-Null }
    $acl = [IO.File]::GetAccessControl($path, [Security.AccessControl.AccessControlSections]::Access)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { $null = $acl.RemoveAccessRuleSpecific($rule) }
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')))
    [IO.File]::SetAccessControl($path, $acl)
    [IO.File]::WriteAllText($path, $content, [Text.UTF8Encoding]::new($false))
}

function ConvertTo-MySqlCompatiblePath([string]$path) {
    if ([string]::IsNullOrWhiteSpace($path)) { throw 'MySQLのパスが空です。' }
    $fullPath = [IO.Path]::GetFullPath($path)
    if ($fullPath -notmatch '[^\x00-\x7F]' -and $fullPath -notmatch '\s') { return $fullPath }

    if (-not ('KusakariEcShortPath' -as [type])) {
        Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
using System.Text;
public static class KusakariEcShortPath {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern uint GetShortPathName(string longPath, StringBuilder shortPath, uint bufferLength);
}
'@
    }

    $buffer = New-Object Text.StringBuilder 32768
    $length = [KusakariEcShortPath]::GetShortPathName($fullPath, $buffer, [uint32]$buffer.Capacity)
    if ($length -gt 0 -and $length -lt $buffer.Capacity) {
        $shortPath = $buffer.ToString()
        if ($shortPath -notmatch '[^\x00-\x7F]' -and $shortPath -notmatch '\s') { return $shortPath }
    }

    # The log file may not exist yet. Shorten its existing parent and retain
    # the ASCII filename so MySQL can create it after startup.
    $parent = Split-Path -Parent $fullPath
    $leaf = Split-Path -Leaf $fullPath
    $buffer.Clear() | Out-Null
    $length = [KusakariEcShortPath]::GetShortPathName($parent, $buffer, [uint32]$buffer.Capacity)
    if ($length -gt 0 -and $length -lt $buffer.Capacity) {
        $shortParent = $buffer.ToString()
        if ($shortParent -notmatch '[^\x00-\x7F]' -and $shortParent -notmatch '\s') {
            $shortPath = Join-Path $shortParent $leaf
            if ($shortPath -notmatch '[^\x00-\x7F]' -and $shortPath -notmatch '\s') { return $shortPath }
        }
    }

    throw '専用MySQLの保存先に空白や日本語を含まないパスを作れません。KUSAKARI_EC_MYSQL_HOMEをASCII文字のみで空白を含まないフォルダーに設定してください。'
}

function Test-MySqlDataDirectory([string]$actualPath, [string]$expectedPath) {
    if ([string]::IsNullOrWhiteSpace($actualPath) -or [string]::IsNullOrWhiteSpace($expectedPath)) { return $false }
    $actual = (ConvertTo-MySqlCompatiblePath $actualPath).TrimEnd('\')
    $expected = (ConvertTo-MySqlCompatiblePath $expectedPath).TrimEnd('\')
    return $actual -ieq $expected
}

function Get-MySqlDefaultsDirectory {
    $candidates = @()
    if ($env:TEMP) { $candidates += $env:TEMP }
    if ($env:SystemRoot) { $candidates += Join-Path $env:SystemRoot 'Temp' }
    $candidates += $runtimeDir

    foreach ($candidate in $candidates) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Container)) { continue }
        $probe = $null
        try {
            $directory = ConvertTo-MySqlCompatiblePath $candidate
            if (-not (Test-Path -LiteralPath $directory -PathType Container)) { continue }
            $probe = Join-Path $directory ('kusakari-ec-' + [guid]::NewGuid().ToString('N') + '.tmp')
            Set-PrivateFile $probe ''
            Remove-Item -LiteralPath $probe -Force -ErrorAction Stop
            if (Test-Path -LiteralPath $probe) { continue }
            return $directory
        } catch {
            if ($probe -and (Test-Path -LiteralPath $probe)) {
                Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
            }
        }
    }

    throw 'MySQL接続用の一時ファイルを安全に作成できるWindows一時フォルダーがありません。書き込み可能なASCIIパスを確認してください。'
}

function Read-Setting([string]$label, [string]$default) {
    $answer = Read-Host "$label [$default]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $default }
    return $answer.Trim()
}

function Read-Password([string]$label) {
    $secure = Read-Host $label -AsSecureString
    return (New-Object Management.Automation.PSCredential('input', $secure)).GetNetworkCredential().Password
}

function Invoke-MySql([string]$user, [string]$password, [int]$port, [string]$sql, [switch]$AllowFailure) {
    $options = Join-Path (Get-MySqlDefaultsDirectory) ('kusakari-ec-' + [guid]::NewGuid().ToString('N') + '.cnf')
    $escaped = $password.Replace('\','\\').Replace('"','\"').Replace("`r",'\r').Replace("`n",'\n')
    try {
        Set-PrivateFile $options "[client]`nhost=127.0.0.1`nport=$port`nuser=$user`npassword=`"$escaped`"`nprotocol=TCP`n"
        $process = New-Object Diagnostics.Process
        $process.StartInfo.FileName = Join-Path $mysqlBin 'mysql.exe'
        $process.StartInfo.Arguments = "--defaults-file=`"$options`" --default-character-set=utf8mb4 --batch --skip-column-names --connect-timeout=5"
        $process.StartInfo.UseShellExecute = $false
        $process.StartInfo.CreateNoWindow = $true
        $process.StartInfo.RedirectStandardInput = $true
        $process.StartInfo.RedirectStandardOutput = $true
        $process.StartInfo.RedirectStandardError = $true
        $null = $process.Start()
        $outputTask = $process.StandardOutput.ReadToEndAsync()
        $errorTask = $process.StandardError.ReadToEndAsync()
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($sql + "`n")
        $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
        $process.StandardInput.BaseStream.Flush()
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(60000)) { $process.Kill(); throw 'MySQL操作がタイムアウトしました。' }
        $output = $outputTask.GetAwaiter().GetResult().Trim()
        $errorText = $errorTask.GetAwaiter().GetResult()
        $code = [regex]::Match($errorText, 'ERROR (\d+)').Groups[1].Value
        if ($process.ExitCode -ne 0 -and -not $AllowFailure) {
            $hint = switch ($code) {
                '1045' { 'ユーザー名・パスワードを確認してください。Kusakariのアプリユーザーはpasswordで接続します。' }
                '1044' { '対象DBへの権限が不足しています。管理者ユーザーを確認してください。' }
                '2003' { 'MySQLの起動状態・ポートを確認してください。' }
                default { '接続設定・権限・DB構造を確認してください。' }
            }
            throw "MySQL処理失敗 (code $code)。$hint"
        }
        return [pscustomobject]@{ Success = $process.ExitCode -eq 0; Output = $output; Code = $code }
    } finally {
        if ($process) { $process.Dispose() }
        Remove-Item -LiteralPath $options -Force -ErrorAction SilentlyContinue
    }
}

function Test-LocalPort([int]$port) {
    $client = New-Object Net.Sockets.TcpClient
    try { $task = $client.ConnectAsync('127.0.0.1', $port); return $task.Wait(1000) -and $client.Connected }
    catch { return $false } finally { $client.Dispose() }
}

function Test-ManagedMySqlProcess([int]$processId, [string]$executable, [string]$config) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
    if (-not $process -or [string]::IsNullOrWhiteSpace($process.ExecutablePath) -or [string]::IsNullOrWhiteSpace($process.CommandLine)) { return $false }
    try {
        $sameExecutable = [IO.Path]::GetFullPath($process.ExecutablePath) -ieq [IO.Path]::GetFullPath($executable)
        $sameConfig = ([string]$process.CommandLine) -match [regex]::Escape([IO.Path]::GetFullPath($config))
        return $sameExecutable -and $sameConfig
    } catch { return $false }
}

function Set-ManagedMySqlReady([string]$stateRoot, [object]$state, [string]$executable) {
    $state.Executable = $executable
    $state.Ready = $true
    Set-PrivateFile (Join-Path $stateRoot 'instance.json') ($state | ConvertTo-Json)
    return [pscustomobject]$state
}

function Recover-ManagedMySqlCore([string]$stateRoot, [object]$state) {
    $config = Join-Path $stateRoot 'my.ini'
    $data = Join-Path $stateRoot 'data'
    if (-not (Test-Path -LiteralPath $config -PathType Leaf) -or -not (Test-Path -LiteralPath $data -PathType Container)) {
        throw '専用MySQLの設定またはデータ保存先がありません。自動削除せず停止しました。'
    }
    $executable = if ($state.Executable -and (Test-Path -LiteralPath $state.Executable)) {
        [IO.Path]::GetFullPath($state.Executable)
    } else {
        Join-Path $script:mysqlBin 'mysqld.exe'
    }
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw '専用MySQLの実行ファイルが見つかりません。' }
    $port = [int]$state.Port
    if ($port -lt 1 -or $port -gt 65535) { throw '専用MySQLのポート設定が不正です。' }
    $expectedData = $data
    $password = Get-ManagedPassword $stateRoot
    $process = $null
    $startedHere = $false
    try {
        if (-not (Test-LocalPort $port)) {
            $mysqlConfig = ConvertTo-MySqlCompatiblePath $config
            $process = Start-Process -FilePath $executable -ArgumentList "--defaults-file=$mysqlConfig --console" -WindowStyle Hidden -PassThru
            $startedHere = $true
            $deadline = (Get-Date).AddSeconds(40)
            do {
                if ($process.HasExited) { throw '専用MySQLの再開に失敗しました。Kusakari/mysqlのmysql-error.logを確認してください。' }
                if (Test-LocalPort $port) { break }
                Start-Sleep -Milliseconds 300
            } while ((Get-Date) -lt $deadline)
            if (-not (Test-LocalPort $port)) { throw '専用MySQLの再開確認がタイムアウトしました。' }
        }
        $probe = Invoke-MySql 'root' $password $port 'SELECT @@datadir;' -AllowFailure
        $actualData = if ($probe.Success) { $probe.Output } else { '' }
        if (-not $probe.Success -or -not (Test-MySqlDataDirectory $actualData $expectedData)) {
            # The reset script may have stopped an instance immediately after
            # its insecure initialization. Complete that private transition
            # only when the server proves it owns Kusakari's data directory.
            $emptyProbe = Invoke-MySql 'root' '' $port 'SELECT @@datadir;' -AllowFailure
            $emptyData = if ($emptyProbe.Success) { $emptyProbe.Output } else { '' }
            if ($emptyProbe.Success -and (Test-MySqlDataDirectory $emptyData $expectedData)) {
                $literal = $password.Replace("'", "''")
                $null = Invoke-MySql 'root' '' $port "SET SESSION sql_mode='NO_BACKSLASH_ESCAPES'; ALTER USER 'root'@'localhost' IDENTIFIED BY '$literal';"
                $probe = Invoke-MySql 'root' $password $port 'SELECT @@datadir;' -AllowFailure
                $actualData = if ($probe.Success) { $probe.Output } else { '' }
            }
        }
        if (-not $probe.Success -or -not (Test-MySqlDataDirectory $actualData $expectedData)) {
            throw '専用MySQLのroot/password認証またはデータ保存先を確認できません。'
        }
        return Set-ManagedMySqlReady $stateRoot $state $executable
    } catch {
        if ($startedHere -and $process -and -not $process.HasExited) { try { Stop-Process -Id $process.Id -Force } catch {} }
        throw
    }
}

function Start-ManagedMySqlCore {
    $stateRoot = if ($env:KUSAKARI_EC_MYSQL_HOME) { $env:KUSAKARI_EC_MYSQL_HOME } else { Join-Path $env:LOCALAPPDATA 'Kusakari\mysql' }
    $stateFile = Join-Path $stateRoot 'instance.json'
    if (-not (Test-Path -LiteralPath $stateFile)) { throw '専用MySQLが未準備です。setup.batを実行してください。' }
    $state = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
    if (-not $state.Ready) { return Recover-ManagedMySqlCore $stateRoot $state }
    if (Test-LocalPort $state.Port) {
        $result = Invoke-MySql 'root' (Get-ManagedPassword $stateRoot) $state.Port 'SELECT @@datadir;' -AllowFailure
        $actual = if ($result.Success) { $result.Output } else { '' }
        $expectedData = Join-Path $stateRoot 'data'
        if ($result.Success -and (Test-MySqlDataDirectory $actual $expectedData)) { return $state }
        $config = Join-Path $stateRoot 'my.ini'
        $listener = @(Get-NetTCPConnection -LocalPort $state.Port -State Listen -ErrorAction SilentlyContinue |
            Where-Object { Test-ManagedMySqlProcess ([int]$_.OwningProcess) $state.Executable $config })
        if ($listener.Count -gt 0) { return $state }
        throw '専用MySQLのポートを別サーバーが使用中です。'
    }
    $config = Join-Path $stateRoot 'my.ini'
    $mysqlConfig = ConvertTo-MySqlCompatiblePath $config
    $process = Start-Process -FilePath $state.Executable -ArgumentList "--defaults-file=$mysqlConfig --console" -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(40)
    do {
        if ($process.HasExited) { throw '専用MySQLが終了しました。Kusakari/mysqlのmysql-error.logを確認してください。' }
        if (Test-LocalPort $state.Port) { return $state }
        Start-Sleep -Milliseconds 300
    } while ((Get-Date) -lt $deadline)
    throw '専用MySQLの起動確認がタイムアウトしました。'
}

function Get-ManagedPassword([string]$directory) {
    $secure = Get-Content -Raw -LiteralPath (Join-Path $directory 'admin.secret') | ConvertTo-SecureString
    return (New-Object Management.Automation.PSCredential('root', $secure)).GetNetworkCredential().Password
}

function Initialize-ManagedMySqlCore([int]$port) {
    $stateRoot = if ($env:KUSAKARI_EC_MYSQL_HOME) { $env:KUSAKARI_EC_MYSQL_HOME } else { Join-Path $env:LOCALAPPDATA 'Kusakari\mysql' }
    New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
    if (Test-Path -LiteralPath (Join-Path $stateRoot 'instance.json')) { return Start-ManagedMySqlCore }
    if (Test-LocalPort $port) {
        # A failed first setup can leave the Kusakari data directory running
        # without its state file. Stop it only after verifying the server's
        # datadir; never shut down an unrelated MySQL on the same port.
        $expectedData = Join-Path $stateRoot 'data'
        $managedPassword = 'password'
        $secret = Join-Path $stateRoot 'admin.secret'
        if (Test-Path -LiteralPath $secret -PathType Leaf) {
            try { $managedPassword = Get-ManagedPassword $stateRoot } catch {}
        }
        $probe = Invoke-MySql 'root' $managedPassword $port 'SELECT @@datadir;' -AllowFailure
        $actualData = if ($probe.Success) { $probe.Output } else { '' }
        if ($probe.Success -and (Test-MySqlDataDirectory $actualData $expectedData)) {
            Write-Host '既存のKusakari専用MySQLを停止して初期化を続行します。'
            $null = Invoke-MySql 'root' $managedPassword $port 'SHUTDOWN;' -AllowFailure
            $deadline = (Get-Date).AddSeconds(20)
            while (Test-LocalPort $port) {
                if ((Get-Date) -gt $deadline) { throw '既存のKusakari専用MySQLを停止できません。' }
                Start-Sleep -Milliseconds 300
            }
        } else {
            $config = Join-Path $stateRoot 'my.ini'
            $listener = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                Where-Object { Test-ManagedMySqlProcess ([int]$_.OwningProcess) (Join-Path $mysqlBin 'mysqld.exe') $config })
            foreach ($entry in $listener) { Stop-Process -Id $entry.OwningProcess -Force -ErrorAction Stop }
            $deadline = (Get-Date).AddSeconds(20)
            while ($listener.Count -gt 0 -and (Test-LocalPort $port)) {
                if ((Get-Date) -gt $deadline) { throw '既存のKusakari専用MySQLを停止できません。' }
                Start-Sleep -Milliseconds 300
            }
        }
    }
    if (Test-LocalPort $port) { throw '専用MySQL用ポートが使用中です。空いているポートを指定してください。' }
    $data = Join-Path $stateRoot 'data'
    if (Test-Path -LiteralPath $data) {
        $config = Join-Path $stateRoot 'my.ini'
        $secret = Join-Path $stateRoot 'admin.secret'
        if ((Test-Path -LiteralPath $config -PathType Leaf) -and (Test-Path -LiteralPath $secret -PathType Leaf)) {
            # Recover a valid Kusakari data directory when only instance.json
            # was lost. Existing data is retained and the server is restarted.
            $state = @{ Executable = Join-Path $mysqlBin 'mysqld.exe'; Port = $port; Ready = $true }
            Set-PrivateFile (Join-Path $stateRoot 'instance.json') ($state | ConvertTo-Json)
            return Start-ManagedMySqlCore
        }
        throw '初期化途中のMySQLデータがあります。既存データを自動削除しません。保存先を確認してください。'
    }
    # MySQL on Windows requires the empty data directory to exist before
    # --initialize-insecure can populate it.
    New-Item -ItemType Directory -Path $data -Force | Out-Null
    # A managed instance is Kusakari-owned, so its credentials are generated
    # automatically. No setup prompt is needed for this path.
    $adminPassword = 'password'
    $secure = ConvertTo-SecureString $adminPassword -AsPlainText -Force
    Set-PrivateFile (Join-Path $stateRoot 'admin.secret') ($secure | ConvertFrom-SecureString)
    $baseDirectory = (ConvertTo-MySqlCompatiblePath (Split-Path $mysqlBin -Parent)).Replace('\','/')
    $dataDirectory = (ConvertTo-MySqlCompatiblePath $data).Replace('\','/')
    $errorLog = (ConvertTo-MySqlCompatiblePath (Join-Path $stateRoot 'mysql-error.log')).Replace('\','/')
    $ini = "[mysqld]`nbasedir=`"$baseDirectory`"`ndatadir=`"$dataDirectory`"`nbind-address=127.0.0.1`nport=$port`nmysqlx=0`nskip-log-bin`nlog-error=`"$errorLog`"`n"
    Set-PrivateFile (Join-Path $stateRoot 'my.ini') $ini
    $mysqlConfig = ConvertTo-MySqlCompatiblePath (Join-Path $stateRoot 'my.ini')
    $initialize = Start-Process -FilePath (Join-Path $mysqlBin 'mysqld.exe') -ArgumentList "--defaults-file=$mysqlConfig --initialize-insecure" -WindowStyle Hidden -Wait -PassThru
    if ($initialize.ExitCode -ne 0) { throw 'MySQL初期化に失敗しました。mysql-error.logを確認してください。' }
    $state = @{ Executable = Join-Path $mysqlBin 'mysqld.exe'; Port = $port; Ready = $false }
    Set-PrivateFile (Join-Path $stateRoot 'instance.json') ($state | ConvertTo-Json)
    # The empty root credential is used only for this newly initialized instance.
    $process = Start-Process -FilePath $state.Executable -ArgumentList "--defaults-file=$mysqlConfig --console" -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(40)
    while (-not (Test-LocalPort $port)) {
        if ($process.HasExited -or (Get-Date) -gt $deadline) {
            if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
            throw '初期MySQL起動に失敗しました。'
        }
        Start-Sleep -Milliseconds 300
    }
    $literal = $adminPassword.Replace("'", "''")
    try { $null = Invoke-MySql 'root' '' $port "SET SESSION sql_mode='NO_BACKSLASH_ESCAPES'; ALTER USER 'root'@'localhost' IDENTIFIED BY '$literal';" }
    catch { if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }; throw }
    $state.Ready = $true
    Set-PrivateFile (Join-Path $stateRoot 'instance.json') ($state | ConvertTo-Json)
    return [pscustomobject]$state
}

function Invoke-ManagedLifecycle([int]$port, [switch]$Initialize) {
    $root = if ($env:KUSAKARI_EC_MYSQL_HOME) { $env:KUSAKARI_EC_MYSQL_HOME } else { Join-Path $env:LOCALAPPDATA 'Kusakari\mysql' }
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    try { $lock = [IO.File]::Open((Join-Path $root 'instance.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw '専用MySQLを別プロセスが準備中です。終了後に再実行してください。' }
    try {
        if ($Initialize) { return Initialize-ManagedMySqlCore $port }
        return Start-ManagedMySqlCore
    } finally { $lock.Dispose() }
}

function Start-ManagedMySql { return Invoke-ManagedLifecycle }
function Initialize-ManagedMySql([int]$port) { return Invoke-ManagedLifecycle $port -Initialize }

function Initialize-Database([string]$mode, [switch]$reconfigure) {
    $settings = Join-Path $projectRoot '.env'
    if ($reconfigure -and $mode -eq 'auto' -and (Test-Path -LiteralPath $settings)) {
        $savedMode = Select-String -LiteralPath $settings -Pattern '^KUSAKARI_EC_DATABASE_MODE=(existing|managed)$' | Select-Object -First 1
        if ($savedMode) { $mode = $savedMode.Matches[0].Groups[1].Value }
    }
    if ((Test-Path -LiteralPath $settings) -and -not $reconfigure) {
        Import-LocalSettings
        $port = [int]$env:KUSAKARI_EC_DB_PORT
        $script:mysqlBin = Get-KusakariEcMySqlBin -Portable:($env:KUSAKARI_EC_DATABASE_MODE -eq 'managed')
        if ($env:KUSAKARI_EC_DATABASE_MODE -eq 'managed') {
            $stateRoot = if ($env:KUSAKARI_EC_MYSQL_HOME) { $env:KUSAKARI_EC_MYSQL_HOME } else { Join-Path $env:LOCALAPPDATA 'Kusakari\mysql' }
            $stateFile = Join-Path $stateRoot 'instance.json'
            if (Test-Path -LiteralPath $stateFile) {
                $state = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
                if ($state.Ready) {
                    $null = Start-ManagedMySql
                } else {
                    $recoveryError = $null
                    try {
                        $null = Start-ManagedMySql
                        Write-Host '未完了の専用MySQLを再開し、root/password認証を確認しました。'
                    } catch {
                        $recoveryError = $_.Exception.Message
                    }
                    if (-not $recoveryError) {
                        # The managed instance was recovered in place. Continue
                        # with the saved managed connection settings below.
                        $state = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
                    } else {
                        # A copied or interrupted setup can leave Ready=false.
                        # If the reset script prepared an existing MySQL on
                        # 3306, reuse that verified server instead of trusting
                        # the stale managed state. Never switch without a
                        # successful probe.
                        $existingProbe = $null
                        if (Test-LocalPort 3306) {
                            $existingProbe = Invoke-MySql 'root' 'password' 3306 'SELECT VERSION();' -AllowFailure
                        }
                        if ($existingProbe -and $existingProbe.Success) {
                            Write-Host '未完了の専用MySQLを検出しました。root/passwordで確認できた既存MySQL (3306) を使用します。'
                            return Initialize-Database 'existing' -reconfigure
                        }
                        throw "専用MySQLの初期化が未完了です。$recoveryError 3306の既存MySQLもroot/passwordで確認できませんでした。"
                    }
                }
            } else {
                # An older or copied .env may point to the managed mode before
                # this machine has created its Kusakari-owned instance. Reuse
                # the discovered MySQL binaries and initialize it automatically.
                Write-Host '既存のMySQL実行ファイルでKusakari専用MySQLを初期化します。'
                Initialize-KusakariEcMySqlRuntime $script:mysqlBin
                $null = Initialize-ManagedMySql $port
                # The new instance has no application user or schemas yet.
                # Re-enter the provisioning path without asking for settings.
                return Initialize-Database 'managed' -reconfigure
            }
        }
        $user = $env:KUSAKARI_EC_DB_USER; $password = $env:KUSAKARI_EC_DB_PASSWORD
        Write-Host '保存済みのDB接続設定を検証します。変更する場合は setup.bat -Reconfigure を実行してください。'
    } else {
        # Automatic local defaults: use an already-running MySQL on 3306;
        # otherwise create/reuse a Kusakari-owned instance on 3307.
        $existing = Test-LocalPort 3306
        if ($mode -eq 'managed') { $existing = $false }
        if ($mode -eq 'existing') { $existing = $true }
        if ($existing) {
            $mode = 'existing'
            $port = 3306
            $script:mysqlBin = Get-KusakariEcMySqlBin
            $adminUser = 'root'
            # The local convention is password. Ask only when an existing
            # server has a different root credential.
            $fixedAdminPassword = if ($env:KUSAKARI_EC_EXISTING_MYSQL_PASSWORD) { $env:KUSAKARI_EC_EXISTING_MYSQL_PASSWORD } else { $null }
            $adminPassword = if ($fixedAdminPassword) { $fixedAdminPassword } else { 'password' }
            $probe = Invoke-MySql $adminUser $adminPassword $port 'SELECT VERSION();' -AllowFailure
            if (-not $probe.Success) {
                if ($fixedAdminPassword) {
                    throw '既存MySQLへroot/passwordで接続できません。MySQLのrootパスワードをpasswordに変更してから再実行してください。'
                }
                $adminPassword = Read-Password 'MySQL rootパスワード（非表示）'
                $null = Invoke-MySql $adminUser $adminPassword $port 'SELECT VERSION();'
            }
        } else {
            $mode = 'managed'
            $script:mysqlBin = Get-KusakariEcMySqlBin -Portable
            Initialize-KusakariEcMySqlRuntime $mysqlBin
            $port = 3307
            if (Test-Path -LiteralPath $settings) {
                $savedManaged = Select-String -LiteralPath $settings -Pattern '^KUSAKARI_EC_DATABASE_MODE=managed$' | Select-Object -First 1
                $savedPort = Select-String -LiteralPath $settings -Pattern '^KUSAKARI_EC_DB_PORT=(\d+)$' | Select-Object -First 1
                if ($savedManaged -and $savedPort -and [int]$savedPort.Matches[0].Groups[1].Value -ge 1 -and [int]$savedPort.Matches[0].Groups[1].Value -le 65535) {
                    $port = [int]$savedPort.Matches[0].Groups[1].Value
                }
            }
            $stateRoot = if ($env:KUSAKARI_EC_MYSQL_HOME) { $env:KUSAKARI_EC_MYSQL_HOME } else { Join-Path $env:LOCALAPPDATA 'Kusakari\mysql' }
            if (Test-Path -LiteralPath (Join-Path $stateRoot 'instance.json')) {
                $null = Start-ManagedMySql
            } else {
                $null = Initialize-ManagedMySql $port
            }
            $adminUser = 'root'
            $adminPassword = Get-ManagedPassword $stateRoot
        }
        $user = 'kusakari'
        # This is a local demo account. Keep the application credential
        # deterministic so another PC needs no extra DB-password prompt.
        $password = 'password'
        # Reject unrelated existing schemas before provisioning users or grants.
        foreach ($db in @('kusakari','kusakari_e2e')) {
            $tables = (Invoke-MySql $adminUser $adminPassword $port "SELECT table_name FROM information_schema.tables WHERE table_schema='$db';").Output
            if ($tables) {
                $expectedV1 = @('products','stores','inventory','material_products','carts','cart_items','orders','order_items','flyway_schema_history')
                $expectedV2 = @($expectedV1 + @('product_images','cart_details','order_details'))
                $actual = @($tables -split "`r?`n")
                $isV1 = @(Compare-Object $expectedV1 $actual).Count -eq 0
                $isV2 = @(Compare-Object $expectedV2 $actual).Count -eq 0
                if (-not $isV1 -and -not $isV2) { throw "$db は既知のKusakari Flywayスキーマと一致しません。変更せず停止します。" }
                $historyV1 = (Invoke-MySql $adminUser $adminPassword $port "SELECT COUNT(*) FROM $db.flyway_schema_history WHERE version='1' AND script='V1__catalog_and_commerce.sql' AND success=1;").Output
                $historyV2 = (Invoke-MySql $adminUser $adminPassword $port "SELECT COUNT(*) FROM $db.flyway_schema_history WHERE version='2' AND script='V2__mockup_crud.sql' AND success=1;").Output
                if ($historyV1 -ne '1' -or ($isV1 -and $historyV2 -ne '0') -or ($isV2 -and $historyV2 -ne '1')) {
                    throw "$db はFlyway履歴とテーブル構成が一致しません。変更せず停止します。"
                }
            }
        }
        $literal = $password.Replace("'", "''")
        $sql = "SET SESSION sql_mode='NO_BACKSLASH_ESCAPES'; CREATE USER IF NOT EXISTS '$user'@'localhost' IDENTIFIED BY '$literal'; ALTER USER '$user'@'localhost' IDENTIFIED BY '$literal';"
        foreach ($db in @('kusakari','kusakari_e2e')) {
            $sql += "CREATE DATABASE IF NOT EXISTS $db CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,DROP,INDEX,REFERENCES ON $db.* TO '$user'@'localhost';"
        }
        $null = Invoke-MySql $adminUser $adminPassword $port $sql
        $adminPassword = $null
        $null = Invoke-MySql $user $password $port 'USE kusakari; SELECT 1; USE kusakari_e2e; SELECT 1;'
        if (Test-Path -LiteralPath $settings) { Set-PrivateFile (Join-Path $runtimeDir 'env.previous') ([IO.File]::ReadAllText($settings)) }
        $lines = @("KUSAKARI_EC_DATABASE_MODE=$mode", "KUSAKARI_EC_DB_PORT=$port", "KUSAKARI_EC_DB_USER=$user", "KUSAKARI_EC_DB_PASSWORD='$password'", "KUSAKARI_EC_DB_URL=jdbc:mysql://127.0.0.1:$port/kusakari?connectionTimeZone=UTC", "KUSAKARI_EC_E2E_DB_URL=jdbc:mysql://127.0.0.1:$port/kusakari_e2e?connectionTimeZone=UTC")
        if (Test-Path -LiteralPath $settings) {
            $lines += @(Get-Content -LiteralPath $settings | Where-Object { $_ -match '^(VITE_KUSAKARI_CANVAS_URL|KUSAKARI_CANVAS_API_URL)=' })
        }
        Set-PrivateFile $settings (($lines -join "`n") + "`n")
        Import-LocalSettings
    }
    $null = Invoke-MySql $user $password $port 'USE kusakari; SELECT 1; USE kusakari_e2e; SELECT 1;'
    $toolsFile = Join-Path $runtimeDir 'toolchain.json'
    $tools = Get-Content -Raw -LiteralPath $toolsFile | ConvertFrom-Json
    $tools | Add-Member -NotePropertyName MySql -NotePropertyValue $mysqlBin -Force
    $tools | ConvertTo-Json | Set-Content -LiteralPath $toolsFile -Encoding UTF8
    Write-Host '開発/E2E専用DBへのアプリユーザー認証を確認しました。'
}
