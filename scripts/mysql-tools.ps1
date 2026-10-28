$ErrorActionPreference = 'Stop'

function Get-KusakariEcMySqlBin {
  param([switch]$Portable)
  $candidates = @()
  $stateRoot = if ($env:KUSAKARI_EC_MYSQL_HOME) { $env:KUSAKARI_EC_MYSQL_HOME } else { Join-Path $env:LOCALAPPDATA 'Kusakari\mysql' }
  $stateFile = Join-Path $stateRoot 'instance.json'
  if (Test-Path -LiteralPath $stateFile) {
    $state = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
    $candidates += Split-Path -Parent $state.executable
  }
  $version = '8.4.11'
  $tools = Join-Path $env:LOCALAPPDATA "Kusakari\tools\mysql-$version-winx64"
  $candidates += Join-Path $tools 'bin'

  # Reuse any compatible extracted MySQL before considering an archive or a
  # network download. System-wide MySQL installations remain reusable.
  $installed = Get-Command mysqld.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $installed) { $candidates += Split-Path -Parent $installed.Source }
  $services = @(Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object {
    $path = [string]$_.PathName
    $_.Name -match '(?i)mysql|maria' -or
      $_.DisplayName -match '(?i)mysql|maria' -or
      $path -match '(?i)\\mysqld(?:\.exe)?(?:[" ]|$)'
  })
  foreach ($service in $services) {
    $path = [string]$service.PathName
    $match = [regex]::Match($path, '^\s*"([^"]*mysqld\.exe)"', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $match.Success) {
      $match = [regex]::Match($path, '^\s*([^ ]*mysqld\.exe)', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    }
    if ($match.Success) { $candidates += Split-Path -Parent $match.Groups[1].Value }
  }
  $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  $searchRoots = @(
    (Join-Path $env:ProgramFiles 'MySQL'),
    $(if ($programFilesX86) { Join-Path $programFilesX86 'MySQL' }),
    (Join-Path $env:LOCALAPPDATA 'Kusakari\tools'),
    (Join-Path $env:USERPROFILE 'mysql'),
    (Join-Path $env:USERPROFILE 'Downloads')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) }
  foreach ($root in $searchRoots) {
    $candidates += Get-ChildItem -LiteralPath $root -Filter 'mysqld.exe' -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.DirectoryName -match '\\bin$' } |
      Select-Object -ExpandProperty DirectoryName
  }

  $seen = @{}
  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    $resolvedCandidate = [IO.Path]::GetFullPath($candidate).TrimEnd('\')
    if ($seen.ContainsKey($resolvedCandidate)) { continue }
    $seen[$resolvedCandidate] = $true
    if ((Test-Path -LiteralPath (Join-Path $resolvedCandidate 'mysqld.exe')) -and
        (Test-Path -LiteralPath (Join-Path $resolvedCandidate 'mysql.exe')) -and
        (Test-Path -LiteralPath (Join-Path $resolvedCandidate 'mysqldump.exe'))) {
      if ($Portable) {
        $probe = New-Object Diagnostics.Process
        try {
          $probe.StartInfo.FileName = Join-Path $resolvedCandidate 'mysqld.exe'
          $probe.StartInfo.Arguments = '--version'
          $probe.StartInfo.UseShellExecute = $false
          $probe.StartInfo.CreateNoWindow = $true
          $probe.StartInfo.RedirectStandardOutput = $true
          $probe.StartInfo.RedirectStandardError = $true
          $null = $probe.Start()
          if (-not $probe.WaitForExit(10000)) { $probe.Kill(); continue }
          $versionText = $probe.StandardOutput.ReadToEnd() + $probe.StandardError.ReadToEnd()
          if ($probe.ExitCode -ne 0 -or $versionText -notmatch '\bVer 8\.' -or $versionText -match '(?i)mariadb') { continue }
        } catch { continue } finally { $probe.Dispose() }
      }
      Write-Host "既存のMySQL実行ファイルを再利用します: $resolvedCandidate"
      return $resolvedCandidate
    }
  }

  $architecture = $env:PROCESSOR_ARCHITEW6432
  if (-not $architecture) { $architecture = $env:PROCESSOR_ARCHITECTURE }
  if ($architecture -ne 'AMD64') { throw 'MySQL自動導入はWindows x64に対応しています。' }
  $downloads = Join-Path $env:LOCALAPPDATA 'Kusakari\downloads'
  New-Item -ItemType Directory -Path $downloads -Force | Out-Null
  $archive = Join-Path $downloads "mysql-$version-winx64.zip"
  $expected = 'A492371D687D2BAB088B0062581144A0044B8964BAEFDF4FAA579292B423D25C'
  $archiveCandidates = @(
    $archive,
    (Join-Path $env:USERPROFILE "Downloads\mysql-$version-winx64.zip"),
    (Join-Path $PSScriptRoot "..\tools\mysql-$version-winx64.zip")
  ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -Unique
  $existingArchive = $archiveCandidates | Select-Object -First 1
  if ($existingArchive) {
    if ((Get-FileHash -LiteralPath $existingArchive -Algorithm SHA256).Hash -ine $expected) {
      throw "既存のMySQL ZIPのSHA-256が一致しません。ファイルを確認してください: $existingArchive"
    }
    $archive = $existingArchive
    Write-Host "既存のMySQL ZIPを再利用します: $archive"
  } else {
    Write-Host "Kusakari専用MySQL ${version}を公式配布元から取得します。"
    $partial = "$archive.part"
    $uri = "https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-$version-winx64.zip"
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
      & curl.exe --fail --location --retry 2 --connect-timeout 30 --output $partial $uri
      if ($LASTEXITCODE -ne 0) { throw 'MySQL配布物を取得できませんでした。ネット接続を確認して再実行してください。' }
    } else {
      Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $partial -TimeoutSec 900
    }
    Move-Item -LiteralPath $partial -Destination $archive -Force
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) {
      throw "MySQL配布物のSHA-256が一致しません。取得ファイルを確認してください: $archive"
    }
  }

  $stage = Join-Path $downloads ('mysql-extract-' + [guid]::NewGuid().ToString('N'))
  try {
    Write-Host 'MySQLをユーザー領域へ展開します。'
    Expand-Archive -LiteralPath $archive -DestinationPath $stage
    $source = Join-Path $stage "mysql-$version-winx64"
    foreach ($name in @('mysqld.exe', 'mysqldump.exe', 'mysql.exe')) {
      $signature = Get-AuthenticodeSignature -LiteralPath (Join-Path $source "bin\$name")
      if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O="?Oracle America') {
        throw "MySQL配布物のOracle署名を確認できません: $name"
      }
    }
    if (Test-Path -LiteralPath $tools) { throw "MySQLの展開先が既に存在します。既存ファイルを確認してください: $tools" }
    New-Item -ItemType Directory -Path (Split-Path -Parent $tools) -Force | Out-Null
    Move-Item -LiteralPath $source -Destination $tools
  } finally {
    $resolvedStage = [IO.Path]::GetFullPath($stage)
    if ($resolvedStage.StartsWith([IO.Path]::GetFullPath($downloads) + '\', [StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath $resolvedStage)) {
      Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
  }
  return (Join-Path $tools 'bin')
}

function Initialize-KusakariEcMySqlRuntime {
  param([string]$Bin)
  $key = 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64'
  $runtime = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
  if ($runtime.Installed -ne 1 -or $runtime.Major -lt 14 -or ($runtime.Major -eq 14 -and $runtime.Minor -lt 29)) {
    Write-Host 'MySQLに必要なMicrosoft Visual C++ランタイムを導入します。Windowsの管理者確認が表示される場合があります。'
    $installer = Join-Path $env:LOCALAPPDATA 'Kusakari\downloads\vc_redist.x64.exe'
    New-Item -ItemType Directory -Path (Split-Path -Parent $installer) -Force | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile $installer -TimeoutSec 300
    $signature = Get-AuthenticodeSignature -LiteralPath $installer
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
      throw 'Visual C++ランタイムのMicrosoft署名を確認できません。'
    }
    $process = Start-Process -FilePath $installer -ArgumentList @('/install', '/quiet', '/norestart') -Verb RunAs -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -notin @(0, 1638, 3010)) { throw "Visual C++ランタイムの導入に失敗しました (exit $($process.ExitCode))。" }
  }
  & (Join-Path $Bin 'mysqld.exe') --no-defaults --version
  if ($LASTEXITCODE -ne 0) { throw 'MySQL実行ファイルを起動できません。Visual C++ランタイムとWindows x64環境を確認してください。' }
}

# An existing MySQL installed as a Windows service may be stopped after a reboot.
function Start-ExistingMySqlService {
  param([int]$Port)
  $services = @(Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object {
    $_.State -ne 'Running' -and ($_.Name -match '(?i)mysql' -or [string]$_.PathName -match '(?i)mysqld')
  })
  if (-not $services.Count) { throw "既存MySQL (TCP $Port) が応答しません。MySQLサービスを起動してから再実行してください。" }
  foreach ($service in $services) {
    Write-Host "MySQLサービスを起動します: $($service.Name)"
    try { Start-Service -Name $service.Name -ErrorAction Stop }
    catch { throw "MySQLサービス $($service.Name) を起動できません。管理者権限でサービスを起動してください。" }
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
      if (Test-LocalPort $Port) { return }
      Start-Sleep -Milliseconds 500
    }
  }
  throw "MySQLサービスは起動しましたが、TCP $Port で接続できません。MySQLのエラーログを確認してください。"
}
