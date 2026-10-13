[CmdletBinding()]
param(
    [int]$Port = 0,
    [ValidatePattern('^[^''\r\n\x00]+$')]
    [string]$NewPassword = 'password'
)

$ErrorActionPreference = 'Stop'

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    Write-Host 'Administrator privileges are required to stop the MySQL service.'
    Write-Host 'A Windows UAC confirmation will be requested.'
    try {
        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PSCommandPath))
        if ($Port -gt 0) { $arguments += @('-Port', [string]$Port) }
        if ($NewPassword -ne 'password') { $arguments += @('-NewPassword', ('"{0}"' -f $NewPassword)) }
        $elevated = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -ArgumentList $arguments -Wait -PassThru
        exit $elevated.ExitCode
    } catch {
        Write-Error 'Administrator elevation was cancelled or failed.'
        exit 1
    }
}

$script:TemporaryFiles = New-Object System.Collections.Generic.List[string]
$script:TemporaryProcesses = New-Object System.Collections.Generic.List[object]

function Set-PrivateText([string]$path, [string]$text) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if (-not (Test-Path -LiteralPath $path)) { New-Item -ItemType File -Path $path -Force | Out-Null }
    $acl = [IO.File]::GetAccessControl($path, [Security.AccessControl.AccessControlSections]::Access)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { $null = $acl.RemoveAccessRuleSpecific($rule) }
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')))
    [IO.File]::SetAccessControl($path, $acl)
    [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding($false)))
    $script:TemporaryFiles.Add($path)
}

function Test-ListeningPort([int]$number) {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync('127.0.0.1', $number)
        return $task.Wait(700) -and $client.Connected
    } catch { return $false } finally { $client.Dispose() }
}

function Wait-Port([int]$number, [bool]$expected, [int]$seconds = 45) {
    $deadline = (Get-Date).AddSeconds($seconds)
    do {
        if ((Test-ListeningPort $number) -eq $expected) { return }
        Start-Sleep -Milliseconds 300
    } while ((Get-Date) -lt $deadline)
    throw "Port $number did not reach the expected state."
}

function Get-FreePort {
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
    try { $listener.Start(); return ([int]$listener.LocalEndpoint.Port) }
    finally { $listener.Stop() }
}

function Get-MySqlBinCandidates {
    $items = New-Object System.Collections.Generic.List[string]
    $stateRoots = @((Join-Path $env:LOCALAPPDATA 'Kusakari\mysql'))
    foreach ($root in $stateRoots) {
        $state = Join-Path $root 'instance.json'
        if (Test-Path -LiteralPath $state) {
            try {
                $value = Get-Content -Raw -LiteralPath $state | ConvertFrom-Json
                if ($value.Executable) { $items.Add((Split-Path -Parent $value.Executable)) }
            } catch {}
        }
    }
    $items.Add((Join-Path $env:LOCALAPPDATA 'Kusakari\tools\mysql-8.4.11-winx64\bin'))
    $items.Add((Join-Path $env:ProgramFiles 'MySQL\MySQL Server 8.4\bin'))
    $items.Add((Join-Path $env:ProgramFiles 'MySQL\MySQL Server 8.0\bin'))
    $command = Get-Command mysqld.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { $items.Add((Split-Path -Parent $command.Source)) }
    return @($items | Where-Object { $_ } | Select-Object -Unique)
}

function Resolve-MySqlBin {
    foreach ($candidate in Get-MySqlBinCandidates) {
        $bin = [IO.Path]::GetFullPath($candidate)
        if ((Test-Path -LiteralPath (Join-Path $bin 'mysqld.exe')) -and
            (Test-Path -LiteralPath (Join-Path $bin 'mysql.exe'))) { return $bin }
    }
    throw 'MySQL client and server executables were not found.'
}

function Get-ConfigArgument([string]$commandLine) {
    if ([string]::IsNullOrWhiteSpace($commandLine)) { return $null }
    if ($commandLine -match '(?i)--defaults-file\s*=\s*"([^"]+)"') { return $Matches[1] }
    if ($commandLine -match '(?i)--defaults-file\s*=\s*([^\s]+)') { return $Matches[1].Trim("'") }
    return $null
}

function Get-ArgumentValue([string]$commandLine, [string]$name) {
    if ([string]::IsNullOrWhiteSpace($commandLine)) { return $null }
    $escaped = [regex]::Escape($name)
    $quotedPattern = '(?i)' + $escaped + '\s*=\s*"([^"]+)"'
    $plainPattern = '(?i)' + $escaped + '\s*=\s*([^\s]+)'
    if ($commandLine -match $quotedPattern) { return $Matches[1] }
    if ($commandLine -match $plainPattern) { return $Matches[1].Trim("'") }
    return $null
}

function Get-IniValue([string]$path, [string]$name) {
    if (-not $path -or -not (Test-Path -LiteralPath $path)) { return $null }
    $pattern = '^\s*' + [regex]::Escape($name) + '\s*=\s*(.*?)\s*$'
    $line = Get-Content -LiteralPath $path | Where-Object { $_ -match $pattern } | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line -replace $pattern, '$1').Trim('"').Trim()
}

function Resolve-SettingPath([string]$value, [string]$config) {
    if (-not $value) { return $null }
    $value = $value.Replace('/', '\').Trim('"')
    if ([IO.Path]::IsPathRooted($value)) { return [IO.Path]::GetFullPath($value) }
    return [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $config) $value))
}

function Get-PortFromFile([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return 0 }
    $line = Get-Content -LiteralPath $path | Where-Object { $_ -match '^\s*KUSAKARI_EC_(DB_PORT|DB_URL|E2E_DB_URL)\s*=' } | Select-Object -First 1
    if ($line -match ':(\d{1,5})(?:/|$)') { return [int]$Matches[1] }
    if ($line -match '^\s*KUSAKARI_EC_DB_PORT\s*=\s*(\d{1,5})') { return [int]$Matches[1] }
    return 0
}

function Get-AutoPort {
    if ($Port -gt 0) { return $Port }
    $listening = @()
    foreach ($candidate in @(3306, 3307)) {
        if (Test-ListeningPort $candidate) { $listening += $candidate }
    }
    if ($listening.Count -eq 1) { return [int]$listening[0] }
    if ($listening.Count -gt 1) { throw 'Both ports 3306 and 3307 are active. Re-run with -Port 3306 or -Port 3307.' }
    $files = @((Join-Path $PSScriptRoot '..\.env'))
    $ports = @($files | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object { Get-PortFromFile $_ } | Where-Object { $_ -gt 0 } | Select-Object -Unique)
    if ($ports.Count -eq 1) { return [int]$ports[0] }
    return 3306
}

function Get-PortProcess([int]$number) {
    $connections = @(Get-NetTCPConnection -LocalPort $number -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
    if ($connections.Count -eq 0) { return $null }
    $processes = @($connections | ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId=$_" -ErrorAction SilentlyContinue })
    if ($processes.Count -ne 1) { throw "Port $number has multiple or inaccessible listener processes." }
    if ($processes[0].Name -notmatch '(?i)^mysqld\.exe$') { throw "Port $number is not owned by mysqld.exe." }
    return $processes[0]
}

function Get-StateTarget([int]$number) {
    $targets = New-Object System.Collections.Generic.List[object]
    foreach ($root in @((Join-Path $env:LOCALAPPDATA 'Kusakari\mysql'))) {
        $statePath = Join-Path $root 'instance.json'
        if (-not (Test-Path -LiteralPath $statePath)) { continue }
        try { $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json } catch { continue }
        if ([int]$state.Port -ne $number) { continue }
        $config = Join-Path $root 'my.ini'
        $targets.Add([pscustomobject]@{
            Port = $number; Process = $null; Config = if (Test-Path $config) { $config } else { $null }
            Executable = $state.Executable; StateRoot = $root; Service = $null
        })
    }
    if ($targets.Count -gt 1) { throw "More than one managed MySQL state matches port $number." }
    if ($targets.Count -eq 1) { return $targets[0] }
    return $null
}

function Get-ConfigCandidate([int]$number) {
    $paths = @(
        (Join-Path $env:LOCALAPPDATA 'Kusakari\mysql\my.ini'),
        (Join-Path $env:ProgramData 'MySQL\MySQL Server 8.4\my.ini'),
        (Join-Path $env:ProgramData 'MySQL\MySQL Server 8.0\my.ini')
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -Unique
    $matching = @($paths | Where-Object {
        $value = Get-IniValue $_ 'port'
        (-not $value) -or ($value -match '^\d+$' -and [int]$value -eq $number)
    })
    if ($matching.Count -eq 1) { return $matching[0] }
    $exact = @($paths | Where-Object {
        $value = Get-IniValue $_ 'port'
        $value -match '^\d+$' -and [int]$value -eq $number
    })
    if ($exact.Count -eq 1) { return $exact[0] }
    return $null
}

function Get-Target([int]$number) {
    $process = Get-PortProcess $number
    $state = Get-StateTarget $number
    if (-not $process -and -not $state) {
        throw "No MySQL process or managed MySQL state was found for port $number."
    }
    $service = $null
    if ($process) { $service = Get-CimInstance Win32_Service -Filter "ProcessId=$($process.ProcessId)" -ErrorAction SilentlyContinue | Select-Object -First 1 }
    $commandLine = if ($process) { [string]$process.CommandLine } else { '' }
    $serviceCommand = if ($service) { [string]$service.PathName } else { '' }
    $executable = if ($process) { $process.ExecutablePath } elseif ($state) { $state.Executable } else { $null }
    if (-not $executable -and $serviceCommand -match '(?i)"([^"]+mysqld\.exe)"') { $executable = $Matches[1] }
    if (-not $executable -and $serviceCommand -match '(?i)([^\s"]+mysqld\.exe)') { $executable = $Matches[1] }
    if (-not $executable -or -not (Test-Path -LiteralPath $executable)) {
        try { $binCandidate = Resolve-MySqlBin; $executable = Join-Path $binCandidate 'mysqld.exe' } catch {}
    }
    $config = Get-ConfigArgument $commandLine
    if (-not $config) { $config = Get-ConfigArgument $serviceCommand }
    if (-not $config -and $state) { $config = $state.Config }
    if (-not $config -or -not (Test-Path -LiteralPath $config -PathType Leaf)) { $config = Get-ConfigCandidate $number }
    if ($config) { $config = [IO.Path]::GetFullPath($config) }
    $data = Resolve-SettingPath (Get-IniValue $config 'datadir') $config
    if (-not $data) { $data = Get-ArgumentValue $commandLine '--datadir' }
    if (-not $data) { $data = Get-ArgumentValue $serviceCommand '--datadir' }
    if (-not $data -and $state) { $data = Join-Path $state.StateRoot 'data' }
    $base = Resolve-SettingPath (Get-IniValue $config 'basedir') $config
    if (-not $base -and $executable) { $base = Split-Path -Parent (Split-Path -Parent $executable) }
    if (-not $executable -and $base) { $executable = Join-Path $base 'bin\mysqld.exe' }
    if (-not $executable -or -not (Test-Path -LiteralPath $executable)) { throw 'The MySQL server executable could not be resolved. Run MySQL-reset.bat as administrator and specify -Port if needed.' }
    if (-not $data -or -not (Test-Path -LiteralPath $data -PathType Container)) { throw 'The MySQL data directory could not be resolved. Run MySQL-reset.bat as administrator and specify -Port if needed.' }
    return [pscustomobject]@{
        Port = $number; ProcessId = if ($process) { [int]$process.ProcessId } else { 0 }
        Process = $process; Config = $config; Data = $data; Base = $base; Executable = $executable
        ServiceName = if ($service) { $service.Name } else { $null }
        ServiceWasRunning = [bool]($service -and $service.State -eq 'Running')
        WasRunning = [bool]$process
    }
}

function Stop-Target([object]$target) {
    if ($target.ServiceName -and $target.ServiceWasRunning) {
        Stop-Service -Name $target.ServiceName -Force -ErrorAction Stop
    } elseif ($target.ProcessId) {
        Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop
    }
    Wait-Port $target.Port $false
}

function Start-Target([object]$target, [string]$initFile) {
    $arguments = @()
    if ($target.Config) {
        $arguments += "--defaults-file=`"$($target.Config)`""
    } else {
        $arguments += '--no-defaults'
        $arguments += "--basedir=`"$($target.Base)`""
        $arguments += "--datadir=`"$($target.Data)`""
        $arguments += "--bind-address=127.0.0.1"
        $arguments += "--port=$($target.Port)"
        $arguments += '--mysqlx=0'
    }
    if ($initFile) { $arguments += "--init-file=`"$initFile`"" }
    $log = $null; $err = $null
    $startParameters = @{
        FilePath = $target.Executable; ArgumentList = $arguments; WindowStyle = 'Hidden'; PassThru = $true
    }
    if ($initFile) {
        $log = Join-Path ([IO.Path]::GetTempPath()) ('mysql-reset-' + [guid]::NewGuid().ToString('N') + '.log')
        $err = Join-Path ([IO.Path]::GetTempPath()) ('mysql-reset-' + [guid]::NewGuid().ToString('N') + '.err')
        $script:TemporaryFiles.Add($log); $script:TemporaryFiles.Add($err)
        $startParameters.RedirectStandardOutput = $log
        $startParameters.RedirectStandardError = $err
    }
    $process = Start-Process @startParameters
    $script:TemporaryProcesses.Add($process)
    return [pscustomobject]@{ Process = $process; Log = $log; Error = $err }
}

function New-MySqlOptions([string]$bin, [int]$number, [string]$password) {
    $options = Join-Path ([IO.Path]::GetTempPath()) ('mysql-reset-' + [guid]::NewGuid().ToString('N') + '.cnf')
    $escaped = $password.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n')
    $content = "[client]`nhost=127.0.0.1`nport=$number`nuser=root`n" + 'password="' + $escaped + '"' + "`nprotocol=TCP`n"
    Set-PrivateText $options $content
    return $options
}

function Invoke-MySql([string]$bin, [int]$number, [string]$password, [string]$sql) {
    $options = New-MySqlOptions $bin $number $password
    try {
        $p = New-Object Diagnostics.Process
        $p.StartInfo.FileName = Join-Path $bin 'mysql.exe'
        $p.StartInfo.Arguments = "--defaults-file=`"$options`" --batch --skip-column-names --connect-timeout=5"
        $p.StartInfo.UseShellExecute = $false; $p.StartInfo.CreateNoWindow = $true
        $p.StartInfo.RedirectStandardInput = $true; $p.StartInfo.RedirectStandardOutput = $true; $p.StartInfo.RedirectStandardError = $true
        $null = $p.Start()
        $outTask = $p.StandardOutput.ReadToEndAsync(); $errTask = $p.StandardError.ReadToEndAsync()
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($sql + "`n")
        $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length); $p.StandardInput.BaseStream.Flush(); $p.StandardInput.Close()
        if (-not $p.WaitForExit(60000)) { $p.Kill(); throw 'mysql.exe timed out.' }
        return [pscustomobject]@{
            Success = $p.ExitCode -eq 0; Output = $outTask.GetAwaiter().GetResult().Trim(); Error = $errTask.GetAwaiter().GetResult().Trim()
        }
    } finally { if ($p) { $p.Dispose() } }
}

function Wait-Password([string]$bin, [int]$number, [string]$password, [object]$server) {
    $deadline = (Get-Date).AddSeconds(45)
    do {
        $result = Invoke-MySql $bin $number $password 'SELECT VERSION();'
        if ($result.Success) { return $result }
        if ($server.Process.HasExited) { break }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    $detail = if ($result.Error) { $result.Error } else { 'No MySQL client diagnostic was returned.' }
    throw "The new MySQL root password could not be verified. $detail"
}

function Stop-TemporaryServer([string]$bin, [int]$number, [string]$password, [object]$server) {
    if (-not $server) { return }
    $null = Invoke-MySql $bin $number $password 'SHUTDOWN;'
    try { Wait-Port $number $false 30 } catch {
        if (-not $server.Process.HasExited) { Stop-Process -Id $server.Process.Id -Force }
        Wait-Port $number $false 30
    }
    try { $null = $server.Process.WaitForExit(5000) } catch {}
}

function Start-OriginalServer([object]$target, [string]$bin) {
    if ($target.ServiceName -and $target.ServiceWasRunning) {
        Start-Service -Name $target.ServiceName -ErrorAction Stop
        Wait-Port $target.Port $true
        return [pscustomobject]@{ Process = $null; Log = $null; Error = $null }
    }
    return Start-Target $target $null
}

$target = $null
$temporary = $null
$originalRestarted = $false
$script:ExitCode = 0
try {
    if ($NewPassword.Length -gt 128) { throw 'The new password is too long.' }
    $portToUse = Get-AutoPort
    $target = Get-Target $portToUse
    $bin = Split-Path -Parent $target.Executable
    Write-Host "Target MySQL port: $portToUse"
    Write-Host 'The target is a local mysqld.exe process. No unrelated process will be changed.'
    $wasRunning = $target.WasRunning
    if ($wasRunning) { Stop-Target $target }
    $initFile = Join-Path ([IO.Path]::GetTempPath()) ('mysql-reset-' + [guid]::NewGuid().ToString('N') + '.sql')
    $sqlPassword = $NewPassword.Replace("'", "''")
    $sql = "ALTER USER IF EXISTS 'root'@'localhost' IDENTIFIED BY '$sqlPassword';`nALTER USER IF EXISTS 'root'@'127.0.0.1' IDENTIFIED BY '$sqlPassword';`n"
    Set-PrivateText $initFile $sql
    $temporary = Start-Target $target $initFile
    Wait-Port $portToUse $true
    $null = Wait-Password $bin $portToUse $NewPassword $temporary
    Stop-TemporaryServer $bin $portToUse $NewPassword $temporary
    $temporary = $null
    if ($wasRunning) {
        $restart = Start-OriginalServer $target $bin
        $originalRestarted = $true
        if ($restart.Process) { $null = Wait-Password $bin $portToUse $NewPassword $restart }
        else {
            $check = Invoke-MySql $bin $portToUse $NewPassword 'SELECT VERSION();'
            if (-not $check.Success) { throw 'The original MySQL service restarted, but the new password was not accepted.' }
        }
    }
    Write-Host 'MySQL root password was changed successfully.'
    Write-Host 'The new password is the requested value. It was not written to the console.'
} catch {
    Write-Error $_.Exception.Message
    $script:ExitCode = 1
} finally {
    if ($temporary -and $temporary.Process -and -not $temporary.Process.HasExited) {
        try { Stop-TemporaryServer (Split-Path -Parent $target.Executable) $target.Port $NewPassword $temporary } catch { try { Stop-Process -Id $temporary.Process.Id -Force } catch {} }
    }
    if ($target -and $target.WasRunning -and -not $originalRestarted -and -not (Test-ListeningPort $target.Port)) {
        try { $null = Start-OriginalServer $target (Split-Path -Parent $target.Executable) } catch { Write-Error 'The original MySQL process could not be restarted.' }
    }
    foreach ($process in $script:TemporaryProcesses.ToArray()) { try { $process.Dispose() } catch {} }
    foreach ($file in $script:TemporaryFiles.ToArray()) { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
}
exit $script:ExitCode
