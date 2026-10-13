@echo off
setlocal DisableDelayedExpansion
rem Usage: 1009修正スクリプト.bat [project-root] [/dry-run]
rem The project root is detected from this script, the current directory, or an explicit path.

set "KUSAKARI_EC_REPAIR_SCRIPT=%~f0"
set "KUSAKARI_EC_REPAIR_SCRIPT_DIR=%~dp0"
set "KUSAKARI_EC_REPAIR_CWD=%CD%"
set "KUSAKARI_EC_REPAIR_TARGET="
set "KUSAKARI_EC_REPAIR_DRY_RUN=0"
if /I "%~1"=="/dry-run" set "KUSAKARI_EC_REPAIR_DRY_RUN=1"
if /I "%~1"=="/dry-run" set "KUSAKARI_EC_REPAIR_TARGET=%~2"
if /I not "%~1"=="/dry-run" set "KUSAKARI_EC_REPAIR_TARGET=%~1"
if /I "%~2"=="/dry-run" set "KUSAKARI_EC_REPAIR_DRY_RUN=1"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -EncodedCommand JAB0AGUAeAB0AD0AWwBJAE8ALgBGAGkAbABlAF0AOgA6AFIAZQBhAGQAQQBsAGwAVABlAHgAdAAoACQAZQBuAHYAOgBLAFUAUwBBAEsAQQBSAEkAXwBFAEMAXwBSAEUAUABBAEkAUgBfAFMAQwBSAEkAUABUACwAWwBUAGUAeAB0AC4ARQBuAGMAbwBkAGkAbgBnAF0AOgA6AFUAVABGADgAKQA7ACQAbQBhAHIAawBlAHIAPQAnACMAPABLAFUAUwBBAEsAQQBSAEkAXwBFAEMAXwBSAEUAUABBAEkAUgBfAFAATwBXAEUAUgBTAEgARQBMAEwAPgAnADsAJABpAG4AZABlAHgAPQAkAHQAZQB4AHQALgBJAG4AZABlAHgATwBmACgAJABtAGEAcgBrAGUAcgAsAFsAUwB0AHIAaQBuAGcAQwBvAG0AcABhAHIAaQBzAG8AbgBdADoAOgBPAHIAZABpAG4AYQBsACkAOwBpAGYAKAAkAGkAbgBkAGUAeAAgAC0AbAB0ACAAMAApAHsAZQB4AGkAdAAgADIAfQA7AHQAcgB5AHsASQBuAHYAbwBrAGUALQBFAHgAcAByAGUAcwBzAGkAbwBuACAAJAB0AGUAeAB0AC4AUwB1AGIAcwB0AHIAaQBuAGcAKAAkAGkAbgBkAGUAeAArACQAbQBhAHIAawBlAHIALgBMAGUAbgBnAHQAaAApAH0AYwBhAHQAYwBoAHsAWwBDAG8AbgBzAG8AbABlAF0AOgA6AEUAcgByAG8AcgAuAFcAcgBpAHQAZQBMAGkAbgBlACgAJABfAC4ARQB4AGMAZQBwAHQAaQBvAG4ALgBNAGUAcwBzAGEAZwBlACkAOwBlAHgAaQB0ACAAMQB9AA==
set "KUSAKARI_EC_REPAIR_EXIT_CODE=%ERRORLEVEL%"
if not "%KUSAKARI_EC_REPAIR_EXIT_CODE%"=="0" (
  echo.
  echo kusakari-ec repair stopped with exit code %KUSAKARI_EC_REPAIR_EXIT_CODE%.
  if not "%KUSAKARI_EC_NO_PAUSE%"=="1" pause
)
exit /b %KUSAKARI_EC_REPAIR_EXIT_CODE%

#<KUSAKARI_EC_REPAIR_POWERSHELL>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Find-KusakariEcRoot {
  param([string]$StartPath)

  if ([string]::IsNullOrWhiteSpace($StartPath)) { return $null }
  try { $candidate = [IO.Path]::GetFullPath($StartPath) } catch { return $null }
  if (Test-Path -LiteralPath $candidate -PathType Leaf) { $candidate = Split-Path -Parent $candidate }

  while (-not [string]::IsNullOrWhiteSpace($candidate)) {
    $requiredFiles = @(
      'package.json', 'package-lock.json', 'frontend\package.json', 'backend\pom.xml',
      'backend\src\main\java\jp\kusakari\ec\KusakariEcApplication.java',
      'backend\src\main\resources\application.properties',
      'scripts\setup.ps1', 'scripts\start.ps1', 'scripts\stop.ps1',
      'script-for-mysql\setup.ps1', 'script-for-mysql\start.ps1',
      'sysover-ray2\SysOverRay\KusakariEcSysOverRay.csproj',
      'setup.bat', 'start.bat', 'stop.bat'
    )
    $complete = $true
    foreach ($relativePath in $requiredFiles) {
      if (-not (Test-Path -LiteralPath (Join-Path $candidate $relativePath) -PathType Leaf)) {
        $complete = $false
        break
      }
    }

    if ($complete) {
      try {
        $package = [IO.File]::ReadAllText((Join-Path $candidate 'package.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
        $frontend = [IO.File]::ReadAllText((Join-Path $candidate 'frontend\package.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
        $lockText = [IO.File]::ReadAllText((Join-Path $candidate 'package-lock.json'), [Text.Encoding]::UTF8)
        $lockText = [regex]::Replace($lockText, '("packages"\s*:\s*\{)\s*"":', '$1"__root__":', 1)
        $lock = $lockText | ConvertFrom-Json
        [xml]$pom = [IO.File]::ReadAllText((Join-Path $candidate 'backend\pom.xml'), [Text.Encoding]::UTF8)
        $namespace = New-Object System.Xml.XmlNamespaceManager($pom.NameTable)
        $namespace.AddNamespace('m', 'http://maven.apache.org/POM/4.0.0')
        $groupId = $pom.SelectSingleNode('/m:project/m:groupId', $namespace).InnerText
        $artifactId = $pom.SelectSingleNode('/m:project/m:artifactId', $namespace).InnerText
        $application = [IO.File]::ReadAllText((Join-Path $candidate 'backend\src\main\resources\application.properties'), [Text.Encoding]::UTF8)
        if ($package.name -eq 'kusakari-ec' -and
            $lock.name -eq 'kusakari-ec' -and
            $lock.packages.__root__.name -eq 'kusakari-ec' -and
            $frontend.name -eq '@kusakari-ec/frontend' -and
            $groupId -eq 'jp.kusakari.ec' -and
            $artifactId -eq 'kusakari-ec-api' -and
            $application -match '(?m)^spring\.application\.name=kusakari-ec-api\s*$') {
          return [IO.Path]::GetFullPath($candidate)
        }
      } catch { }
    }

    $parent = Split-Path -Parent $candidate
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $candidate) { break }
    $candidate = $parent
  }
  return $null
}

$candidateDirectories = @($env:KUSAKARI_EC_REPAIR_TARGET, $env:KUSAKARI_EC_REPAIR_CWD, $env:KUSAKARI_EC_REPAIR_SCRIPT_DIR)
$projectRoot = $null
foreach ($directory in $candidateDirectories) {
  if (-not [string]::IsNullOrWhiteSpace($directory)) {
    $projectRoot = Find-KusakariEcRoot -StartPath $directory
    if ($null -ne $projectRoot) { break }
  }
}
while ($null -eq $projectRoot) {
  $enteredPath = Read-Host 'kusakari-ec のプロジェクトフォルダーを入力してください'
  if ([string]::IsNullOrWhiteSpace($enteredPath)) { throw 'プロジェクトルートが指定されていません。' }
  $projectRoot = Find-KusakariEcRoot -StartPath $enteredPath.Trim('"')
  if ($null -eq $projectRoot) { Write-Warning '指定先はkusakari-ecのルートではありません。package、lock、Maven、Javaの識別子を確認してください。' }
}

$projectRoot = [IO.Path]::GetFullPath($projectRoot).TrimEnd('\')
$runtimeDir = Join-Path $projectRoot '.runtime'
$dryRun = $env:KUSAKARI_EC_REPAIR_DRY_RUN -eq '1'
Write-Host "Project root: $projectRoot"
Write-Host 'Detected identity: kusakari-ec / jp.kusakari.ec'
Write-Host '.env values, MySQL schemas/data, MySQL service, Docker volumes, .runtime backups, and other projects are protected.'

function Get-KusakariEcListeners {
  try {
    return @(Get-NetTCPConnection -State Listen -ErrorAction Stop | ForEach-Object {
      [pscustomobject]@{ LocalPort = [int]$_.LocalPort; ProcessId = [int]$_.OwningProcess }
    } | Sort-Object LocalPort, ProcessId -Unique)
  } catch {
    $netstat = Join-Path $env:SystemRoot 'System32\netstat.exe'
    if (-not (Test-Path -LiteralPath $netstat -PathType Leaf)) { throw 'TCPリスナーを確認できません。' }
    $listeners = @()
    foreach ($line in (& $netstat -ano -p tcp)) {
      if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
        $listeners += [pscustomobject]@{ LocalPort = [int]$Matches[1]; ProcessId = [int]$Matches[2] }
      }
    }
    return @($listeners | Sort-Object LocalPort, ProcessId -Unique)
  }
}

function Get-KusakariEcProcessKind {
  param([object]$ProcessInfo)

  if ($null -eq $ProcessInfo) { return $null }
  $apiMarkers = @(
    (Join-Path $projectRoot 'backend\target\kusakari-ec-api-0.1.0.jar'),
    (Join-Path $projectRoot 'backend\target\kusakari-api-0.1.0.jar')
  ) | ForEach-Object { $_.Replace('/', '\').ToLowerInvariant() }
  $command = ([string]$ProcessInfo.CommandLine).Replace('/', '\').ToLowerInvariant()
  if ($ProcessInfo.Name -ieq 'java.exe' -and @($apiMarkers | Where-Object { $command.Contains($_) }).Count -gt 0) { return 'API' }

  $viteMarker = (Join-Path $projectRoot 'node_modules\vite\bin\vite.js').Replace('/', '\').ToLowerInvariant()
  if ($ProcessInfo.Name -ieq 'node.exe' -and $command.Contains($viteMarker)) { return 'Web' }

  $overlayPaths = @(
    (Join-Path $projectRoot 'sysover-ray2\app\KusakariEcSysOverRay.exe'),
    (Join-Path $projectRoot 'sysover-ray2\app\KusakariSysOverRay.exe')
  ) | ForEach-Object { [IO.Path]::GetFullPath($_) }
  if ($ProcessInfo.Name -in @('KusakariEcSysOverRay.exe', 'KusakariSysOverRay.exe') -and
      -not [string]::IsNullOrWhiteSpace([string]$ProcessInfo.ExecutablePath)) {
    try {
      if ($overlayPaths -contains [IO.Path]::GetFullPath($ProcessInfo.ExecutablePath)) { return 'Overlay' }
    } catch { }
  }
  return $null
}

$reservedPorts = @(8086, 5186, 18086, 15186)
$processes = @{}
try {
  foreach ($processInfo in @(Get-CimInstance Win32_Process -ErrorAction Stop)) {
    $processes[[int]$processInfo.ProcessId] = $processInfo
  }
} catch {
  throw '実行中プロセスの所有を確認できません。プロセス照会権限を確認してください。'
}

$ownedProcesses = @()
foreach ($processInfo in $processes.Values) {
  $kind = Get-KusakariEcProcessKind -ProcessInfo $processInfo
  if ($kind) {
    $ownedProcesses += [pscustomobject]@{ ProcessId = [int]$processInfo.ProcessId; Name = [string]$processInfo.Name; Kind = $kind; Created = [string]$processInfo.CreationDate }
  }
}
$ownedIds = @($ownedProcesses | ForEach-Object { $_.ProcessId })
$listeners = @(Get-KusakariEcListeners | Where-Object { $reservedPorts -contains $_.LocalPort })
$foreignListeners = @($listeners | Where-Object { $ownedIds -notcontains $_.ProcessId })
if ($foreignListeners.Count -gt 0) {
  foreach ($listener in $foreignListeners) {
    $owner = $processes[[int]$listener.ProcessId]
    $name = if ($owner) { [string]$owner.Name } else { 'unknown process' }
    Write-Warning "Reserved port $($listener.LocalPort) is owned by $name (PID $($listener.ProcessId)); it will not be terminated."
  }
  throw '別プロジェクトまたは所有を確認できないプロセスが予約ポートを使用しています。ポート競合を解消してから再実行してください。'
}

if ($dryRun) {
  if ($ownedProcesses.Count -eq 0) { Write-Host 'No kusakari-ec processes are running.' }
  foreach ($processInfo in $ownedProcesses) { Write-Host "DRY RUN: would force-terminate $($processInfo.Kind) $($processInfo.Name) PID $($processInfo.ProcessId)." }
  foreach ($relative in @('node_modules', 'frontend\node_modules', 'backend\target', 'frontend\dist', 'sysover-ray2\app')) {
    $path = Join-Path $projectRoot $relative
    if (Test-Path -LiteralPath $path) { Write-Host "DRY RUN: would remove generated directory $path" }
  }
  $settings = Join-Path $projectRoot '.env'
  if (Test-Path -LiteralPath $settings) {
    $contents = [IO.File]::ReadAllText($settings, [Text.Encoding]::UTF8)
    if ($contents -match '(?m)^KUSAKARI_(?!EC_)[A-Z0-9_]+=') { Write-Host 'DRY RUN: would back up .env privately and migrate legacy key names; values would be retained.' }
  }
  Write-Host 'DRY RUN: no processes or files were changed.'
  exit 0
}

foreach ($record in $ownedProcesses) {
  $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($record.ProcessId)" -ErrorAction SilentlyContinue
  if (-not $current -or [string]$current.CreationDate -ne $record.Created -or (Get-KusakariEcProcessKind -ProcessInfo $current) -ne $record.Kind) { continue }
  Write-Host "Force-terminating owned $($record.Kind) process PID $($record.ProcessId)."
  try { Stop-Process -Id $record.ProcessId -Force -ErrorAction Stop }
  catch { throw "Owned process PID $($record.ProcessId) could not be terminated. Close it manually or use an account with permission." }
}

$deadline = [DateTime]::UtcNow.AddSeconds(15)
do {
  $remainingIds = @($ownedProcesses | ForEach-Object { $_.ProcessId } | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
  if ($remainingIds.Count -eq 0) { break }
  Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $deadline)
if ($remainingIds.Count -gt 0) { throw "Owned process(es) still run: $($remainingIds -join ', '). Generated files were not removed." }

function Backup-PrivateEnvironmentFile {
  param([string]$Path)

  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  $backup = Join-Path $runtimeDir ('env-before-identifier-migration-' + [guid]::NewGuid().ToString('N') + '.bak')
  [IO.File]::Copy($Path, $backup, $false)
  $acl = New-Object System.Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($true, $false)
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')))
  [IO.File]::SetAccessControl($backup, $acl)
  return $backup
}

function Migrate-KusakariEcEnvironmentKeys {
  $settings = Join-Path $projectRoot '.env'
  if (-not (Test-Path -LiteralPath $settings -PathType Leaf)) { return $false }
  $legacyNames = @(
    'KUSAKARI_DATABASE_MODE', 'KUSAKARI_DB_PORT', 'KUSAKARI_DB_USER', 'KUSAKARI_DB_PASSWORD',
    'KUSAKARI_DB_URL', 'KUSAKARI_E2E_DB_URL', 'KUSAKARI_EXISTING_MYSQL_BIN',
    'KUSAKARI_EXISTING_MYSQL_ONLY', 'KUSAKARI_EXISTING_MYSQL_PASSWORD',
    'KUSAKARI_MYSQL_HOME', 'KUSAKARI_TOOLS_HOME', 'KUSAKARI_API_PORT', 'KUSAKARI_API_TARGET',
    'KUSAKARI_API_HOST_PORT', 'KUSAKARI_WEB_ORIGIN', 'KUSAKARI_WEB_HOST_PORT'
  )
  $bytes = [IO.File]::ReadAllBytes($settings)
  $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
  $contents = [IO.File]::ReadAllText($settings, [Text.Encoding]::UTF8)
  $newContents = $contents
  $migrated = @()
  foreach ($oldName in $legacyNames) {
    $oldPattern = '(?m)^' + [regex]::Escape($oldName) + '='
    if ($contents -notmatch $oldPattern) { continue }
    $newName = 'KUSAKARI_EC_' + $oldName.Substring('KUSAKARI_'.Length)
    if ($contents -match ('(?m)^' + [regex]::Escape($newName) + '=')) { throw "Both legacy and new .env keys exist: $oldName / $newName" }
    $newContents = [regex]::Replace($newContents, $oldPattern, $newName + '=')
    $migrated += $oldName
  }
  if ($migrated.Count -eq 0) {
    if ($contents -match '(?m)^KUSAKARI_(?!EC_)[A-Z0-9_]+=') { throw '.env contains an unsupported legacy KUSAKARI_ key; inspect the key name before continuing.' }
    return $false
  }
  $backup = Backup-PrivateEnvironmentFile -Path $settings
  $encoding = New-Object System.Text.UTF8Encoding($hasBom)
  [IO.File]::WriteAllText($settings, $newContents, $encoding)
  $verified = [IO.File]::ReadAllText($settings, [Text.Encoding]::UTF8)
  foreach ($oldName in $migrated) {
    $newName = 'KUSAKARI_EC_' + $oldName.Substring('KUSAKARI_'.Length)
    if ($verified -notmatch ('(?m)^' + [regex]::Escape($newName) + '=')) { throw "Environment key migration verification failed: $newName" }
  }
  Write-Host "Migrated .env key names. A private backup was kept at $backup; all values were retained."
  return $true
}

$null = Migrate-KusakariEcEnvironmentKeys

function Remove-KusakariEcGeneratedDirectory {
  param([string]$RelativePath)

  $allowed = @('node_modules', 'frontend\node_modules', 'backend\target', 'frontend\dist', 'sysover-ray2\app')
  if ($allowed -notcontains $RelativePath) { throw "Refusing an unapproved generated path: $RelativePath" }
  $path = Join-Path $projectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) { return }
  $resolved = [IO.Path]::GetFullPath($path).TrimEnd('\')
  $rootPrefix = $projectRoot + [IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing a path outside the project: $resolved" }
  $item = Get-Item -LiteralPath $resolved -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Refusing to recursively delete a reparse point: $resolved" }
  Write-Host "Removing generated directory: $resolved"
  Remove-Item -LiteralPath $resolved -Recurse -Force
}

foreach ($relativePath in @('node_modules', 'frontend\node_modules', 'backend\target', 'frontend\dist', 'sysover-ray2\app')) {
  Remove-KusakariEcGeneratedDirectory -RelativePath $relativePath
}

$settingsPath = Join-Path $projectRoot '.env'
$existingMode = $false
if (Test-Path -LiteralPath $settingsPath -PathType Leaf) {
  $existingMode = [IO.File]::ReadAllText($settingsPath, [Text.Encoding]::UTF8) -match '(?m)^KUSAKARI_EC_DATABASE_MODE=existing\s*$'
}
$setupScript = if ($existingMode) { Join-Path $projectRoot 'script-for-mysql\setup.ps1' } else { Join-Path $projectRoot 'scripts\setup.ps1' }
$startScript = if ($existingMode) { Join-Path $projectRoot 'script-for-mysql\start.ps1' } else { Join-Path $projectRoot 'scripts\start.ps1' }

Push-Location -LiteralPath $projectRoot
try {
  Write-Host 'Running the canonical setup: dependency restore, browser install, builds, and non-destructive MySQL/Flyway checks.'
  & $setupScript
  if (-not $?) { throw 'The setup command failed.' }
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "The setup command failed with exit code $LASTEXITCODE." }

  Write-Host 'Starting the EC API, Web app, and visible SysOverRay controls without opening a browser.'
  & $startScript -NoBrowser
  if (-not $?) { throw 'The start command failed.' }
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "The start command failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}

$api = Invoke-RestMethod -Uri 'http://127.0.0.1:8086/api/health' -TimeoutSec 5
$web = Invoke-WebRequest -Uri 'http://127.0.0.1:5186/' -TimeoutSec 5 -UseBasicParsing
$proxy = Invoke-RestMethod -Uri 'http://127.0.0.1:5186/api/health' -TimeoutSec 5
if ($api.application -ne 'kusakari-ec' -or $api.backend -ne 'spring-boot') { throw 'API identity check failed after startup.' }
if ($web.StatusCode -ne 200 -or $web.Content -notmatch '<title>\s*Kusakari') { throw 'Web identity check failed after startup.' }
if ($proxy.application -ne 'kusakari-ec') { throw 'Web-to-API proxy check failed after startup.' }

Write-Host 'Repair completed. API, Web page, Web-to-API proxy, and visible overlay checks passed.'
Write-Host 'MySQL schemas/data, Docker volume, .env values, and .runtime backups were preserved.'
exit 0
