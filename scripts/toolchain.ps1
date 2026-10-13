$toolsRoot = if ($env:KUSAKARI_EC_TOOLS_HOME) { $env:KUSAKARI_EC_TOOLS_HOME } else { Join-Path $env:LOCALAPPDATA 'Kusakari\tools' }

function Add-ToolPath([string]$directory) {
    if ($directory -and (Test-Path -LiteralPath $directory)) { $env:Path = "$directory;$env:Path" }
}

function Import-Toolchain {
    $settings = Join-Path $projectRoot '.runtime\toolchain.json'
    if (Test-Path -LiteralPath $settings) {
        $tools = Get-Content -Raw -LiteralPath $settings | ConvertFrom-Json
        foreach ($directory in @($tools.Node, $tools.Java, $tools.Dotnet, $tools.MySql)) { Add-ToolPath $directory }
        if (Test-Path -LiteralPath (Join-Path $tools.Java 'javac.exe')) { $env:JAVA_HOME = Split-Path $tools.Java -Parent }
        if ($tools.Dotnet -and (Test-Path -LiteralPath (Join-Path $tools.Dotnet 'dotnet.exe'))) {
            $env:DOTNET_ROOT = $tools.Dotnet
            $env:DOTNET_ROOT_X64 = $tools.Dotnet
        } elseif ($tools.DotnetDesktop -and (Test-Path -LiteralPath (Join-Path $tools.DotnetDesktop 'dotnet.exe'))) {
            $env:DOTNET_ROOT = $tools.DotnetDesktop
            $env:DOTNET_ROOT_X64 = $tools.DotnetDesktop
        }
    }
}

function Get-VerifiedArchive([string]$url, [string]$hash, [string]$algorithm = 'SHA256') {
    if ($url -notmatch '^https://') { throw '配布元がHTTPSではありません。' }
    New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
    $archive = Join-Path $toolsRoot ([guid]::NewGuid().ToString('N') + '.zip')
    try {
        Write-Host '公式配布元からツールを取得します。'
        if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
            & curl.exe --fail --location --retry 2 --connect-timeout 30 --silent --show-error --output $archive $url
            if ($LASTEXITCODE -ne 0) { throw 'ツール取得に失敗しました。ネット接続を確認してください。' }
        } else { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive -TimeoutSec 900 }
        if ((Get-FileHash -LiteralPath $archive -Algorithm $algorithm).Hash -ine $hash) { throw '配布物のチェックサムが一致しません。' }
        return $archive
    } catch {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
        throw
    }
}

function Expand-ToolArchive([string]$archive, [string]$destination) {
    try { Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }
    finally { Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue }
}

function Test-DotnetToolchain([string]$executable, [string]$root) {
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { return $false }
    $previousRoot = $env:DOTNET_ROOT
    $previousRootX64 = $env:DOTNET_ROOT_X64
    try {
        $env:DOTNET_ROOT = $root
        $env:DOTNET_ROOT_X64 = $root
        $sdks = @(& $executable --list-sdks 2>$null)
        $sdkExitCode = $LASTEXITCODE
        $runtimes = @(& $executable --list-runtimes 2>$null)
        $runtimeExitCode = $LASTEXITCODE
        return $sdkExitCode -eq 0 -and $runtimeExitCode -eq 0 -and
            @($sdks | Where-Object { $_ -match '^10\.' }).Count -gt 0 -and
            @($runtimes | Where-Object { $_ -match '^Microsoft\.WindowsDesktop\.App 10\.' }).Count -gt 0
    } catch {
        return $false
    } finally {
        if ($null -eq $previousRoot) { Remove-Item Env:DOTNET_ROOT -ErrorAction SilentlyContinue }
        else { $env:DOTNET_ROOT = $previousRoot }
        if ($null -eq $previousRootX64) { Remove-Item Env:DOTNET_ROOT_X64 -ErrorAction SilentlyContinue }
        else { $env:DOTNET_ROOT_X64 = $previousRootX64 }
    }
}

function Remove-ManagedDotnetDirectory([string]$directory) {
    $toolsPath = [IO.Path]::GetFullPath($toolsRoot).TrimEnd('\')
    $fullPath = [IO.Path]::GetFullPath($directory).TrimEnd('\')
    $toolsPrefix = $toolsPath + [IO.Path]::DirectorySeparatorChar
    if (-not $fullPath.StartsWith($toolsPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path -Leaf $fullPath) -ne 'dotnet10') {
        throw "Refusing to remove a .NET directory outside the managed tools folder: $fullPath"
    }
    if (-not (Test-Path -LiteralPath $fullPath -PathType Container)) { return }
    $item = Get-Item -LiteralPath $fullPath -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing to remove a .NET reparse point: $fullPath"
    }
    $reparsePoints = Get-ChildItem -Force -LiteralPath $fullPath -Recurse -ErrorAction SilentlyContinue |
        Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }
    if ($reparsePoints) { throw "Refusing to remove a .NET directory containing reparse points: $fullPath" }
    Remove-Item -LiteralPath $fullPath -Recurse -Force
}

function Install-VerifiedDotnetSdk([string]$version, [string]$archiveHash, [string]$directory) {
    New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
    $installerScript = Join-Path $toolsRoot 'dotnet-install.ps1'
    $archive = Join-Path $toolsRoot ([guid]::NewGuid().ToString('N') + '.zip')
    try {
        Invoke-WebRequest -UseBasicParsing -Uri 'https://dot.net/v1/dotnet-install.ps1' -OutFile $installerScript -TimeoutSec 120
        $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "{0}" -Version "{1}" -InstallDir "{2}" -NoPath -Architecture x64 -ZipPath "{3}" -KeepZip' -f $installerScript, $version, $directory, $archive
        $process = New-Object Diagnostics.Process
        $process.StartInfo.FileName = $powershell
        $process.StartInfo.Arguments = $arguments
        $process.StartInfo.WorkingDirectory = $toolsRoot
        $process.StartInfo.UseShellExecute = $false
        $process.StartInfo.CreateNoWindow = $true
        $process.StartInfo.RedirectStandardOutput = $true
        $process.StartInfo.RedirectStandardError = $true
        $null = $process.Start()
        $standardOutputTask = $process.StandardOutput.ReadToEndAsync()
        $standardErrorTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $standardOutput = $standardOutputTask.Result
        $standardError = $standardErrorTask.Result
        $installerExitCode = $process.ExitCode
        $process.Dispose()
        if ($standardOutput) { Write-Host $standardOutput.TrimEnd() }
        if ($installerExitCode -ne 0) { throw "Microsoft .NET SDK installer failed with exit code $installerExitCode. $standardError" }
        if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw 'Microsoft .NET SDK installer did not retain its archive for verification.' }
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA512).Hash -ine $archiveHash) {
            throw 'The installed .NET SDK archive checksum does not match Microsoft release metadata.'
        }
        if (-not (Test-DotnetToolchain (Join-Path $directory 'dotnet.exe') $directory)) {
            throw 'The installed .NET SDK or Windows Desktop runtime failed validation.'
        }
    } catch {
        Remove-ManagedDotnetDirectory $directory
        throw
    } finally {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $installerScript -Force -ErrorAction SilentlyContinue
    }
}

function Initialize-Toolchain {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = 'SilentlyContinue'
    $architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    if ($architecture -ne 'AMD64') { throw 'この一括セットアップはWindows x64用です。' }
    Import-Toolchain
    # Reuse this user's verified portable tools in a fresh checkout.
    $cachedNode = Get-ChildItem -LiteralPath $toolsRoot -Filter 'node-v*-win-x64' -Directory -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($cachedNode) { Add-ToolPath $cachedNode.FullName }
    $cachedJdk = Get-ChildItem -LiteralPath (Join-Path $toolsRoot 'jdk21') -Filter javac.exe -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cachedJdk) { Add-ToolPath $cachedJdk.DirectoryName }
    Add-ToolPath (Join-Path $toolsRoot 'dotnet10')
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodeVersion = if ($node) { (& $node.Source --version).TrimStart('v') } else { '0.0.0' }
    if ([version]$nodeVersion -lt [version]'22.12.0' -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        $index = Invoke-RestMethod 'https://nodejs.org/dist/index.json' -TimeoutSec 30
        $release = $index | Where-Object { $_.lts -and [version]$_.version.TrimStart('v') -ge [version]'22.12.0' } |
            Sort-Object { [version]$_.version.TrimStart('v') } -Descending | Select-Object -First 1
        if (-not $release) { throw '利用可能なNode.js LTSを取得できません。' }
        $name = "node-$($release.version)-win-x64.zip"
        $base = "https://nodejs.org/dist/$($release.version)/"
        $checksums = (Invoke-WebRequest -UseBasicParsing ($base + 'SHASUMS256.txt') -TimeoutSec 30).Content
        $checksum = [regex]::Match($checksums, '(?m)^([a-fA-F0-9]{64})\s+' + [regex]::Escape($name) + '\s*$')
        if (-not $checksum.Success) { throw 'Node.jsのチェックサムがありません。' }
        Expand-ToolArchive (Get-VerifiedArchive ($base + $name) $checksum.Groups[1].Value) $toolsRoot
        Add-ToolPath (Join-Path $toolsRoot "node-$($release.version)-win-x64")
    }
    $java = Get-Command java.exe -ErrorAction SilentlyContinue
    $javaBin = $null
    if ($java) {
        $probe = New-Object Diagnostics.Process
        $probe.StartInfo.FileName = $java.Source
        $probe.StartInfo.Arguments = '-XshowSettings:properties -version'
        $probe.StartInfo.UseShellExecute = $false
        $probe.StartInfo.CreateNoWindow = $true
        $probe.StartInfo.RedirectStandardError = $true
        $null = $probe.Start()
        $properties = $probe.StandardError.ReadToEnd()
        $probe.WaitForExit(); $probe.Dispose()
        $homeMatch = [regex]::Match($properties, '(?m)^\s*java.home = (.+)\r?$')
        $versionMatch = [regex]::Match($properties, '(?m)^\s*java.specification.version = (\d+)')
        if ($homeMatch.Success -and $versionMatch.Success -and [int]$versionMatch.Groups[1].Value -ge 21) {
            $candidate = Join-Path $homeMatch.Groups[1].Value.Trim() 'bin'
            if (Test-Path -LiteralPath (Join-Path $candidate 'javac.exe')) { $javaBin = $candidate }
        }
    }
    if (-not $javaBin) {
        $release = @(Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse' -TimeoutSec 30)[0]
        $package = $release.binary.package
        if (-not $package.checksum) { throw 'JDK配布情報を取得できません。' }
        $directory = Join-Path $toolsRoot 'jdk21'
        Expand-ToolArchive (Get-VerifiedArchive $package.link $package.checksum) $directory
        $javaBin = (Get-ChildItem -LiteralPath $directory -Filter javac.exe -Recurse -File | Select-Object -First 1).DirectoryName
        if (-not $javaBin) { throw 'JDKの展開後確認に失敗しました。' }
    }
    Add-ToolPath $javaBin
    $env:JAVA_HOME = Split-Path $javaBin -Parent
    $dotnetDirectory = Join-Path $toolsRoot 'dotnet10'
    $dotnetExecutable = Join-Path $dotnetDirectory 'dotnet.exe'
    $dotnet = Get-Command dotnet.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $dotnetRoot = $null
    if ($dotnet -and (Test-DotnetToolchain $dotnet.Source (Split-Path $dotnet.Source -Parent))) {
        $dotnetRoot = Split-Path $dotnet.Source -Parent
    }
    if (-not $dotnetRoot -and (Test-DotnetToolchain $dotnetExecutable $dotnetDirectory)) {
        $dotnet = [pscustomobject]@{ Source = $dotnetExecutable }
        $dotnetRoot = $dotnetDirectory
    }
    if (-not $dotnetRoot) {
        Remove-ManagedDotnetDirectory $dotnetDirectory
        $metadata = Invoke-RestMethod 'https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json' -TimeoutSec 30
        $release = $metadata.releases | Where-Object { $_.sdk.version -eq $metadata.'latest-sdk' } | Select-Object -First 1
        $file = $release.sdk.files | Where-Object { $_.rid -eq 'win-x64' -and $_.name -eq 'dotnet-sdk-win-x64.zip' } | Select-Object -First 1
        if (-not $release.sdk.version -or $file.hash -notmatch '^[a-fA-F0-9]{128}$') { throw '.NET SDK配布情報を取得できません。' }
        Install-VerifiedDotnetSdk $release.sdk.version $file.hash $dotnetDirectory
        $dotnet = [pscustomobject]@{ Source = $dotnetExecutable }
        $dotnetRoot = $dotnetDirectory
    }
    if (-not (Test-DotnetToolchain $dotnet.Source $dotnetRoot)) { throw '.NET SDK 10またはWindows Desktop Runtime 10が利用できません。' }
    Add-ToolPath $dotnetRoot
    $env:DOTNET_ROOT = $dotnetRoot
    $env:DOTNET_ROOT_X64 = $dotnetRoot
    $tools = @{ Node = Split-Path (Get-Command node.exe).Source -Parent; Java = $javaBin; Dotnet = Split-Path $dotnet.Source -Parent }
    New-Item -ItemType Directory -Path (Join-Path $projectRoot '.runtime') -Force | Out-Null
    $tools | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectRoot '.runtime\toolchain.json') -Encoding UTF8
    Write-Host 'Node.js・Java JDK・.NET SDKの準備を確認しました。'
}
