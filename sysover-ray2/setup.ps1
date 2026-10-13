$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'SysOverRay'
$projectRoot = Split-Path $PSScriptRoot -Parent
. (Join-Path $projectRoot 'scripts\toolchain.ps1')
Import-Toolchain
$project = Join-Path $source 'KusakariEcSysOverRay.csproj'
$destination = Join-Path $PSScriptRoot 'app'
$executable = Join-Path $destination 'KusakariEcSysOverRay.exe'

if (-not (Get-Command dotnet.exe -ErrorAction SilentlyContinue)) {
    throw 'SysOverRay の作成には .NET 10 SDK が必要です。'
}
$runtimes = & dotnet.exe --list-runtimes
if (-not (@($runtimes | Where-Object { $_ -match '^Microsoft\.WindowsDesktop\.App 10\.' }).Count -gt 0)) {
    throw 'SysOverRay の表示には .NET 10 Desktop Runtime が必要です。'
}
$sources = @(Get-ChildItem -LiteralPath $source -File | Where-Object Extension -In '.cs', '.xaml', '.csproj', '.manifest')
$newestSource = $sources | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if (-not (Test-Path -LiteralPath $executable) -or $newestSource.LastWriteTimeUtc -gt (Get-Item -LiteralPath $executable).LastWriteTimeUtc) {
    & dotnet.exe publish $project -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o $destination
    if ($LASTEXITCODE -ne 0) { throw 'SysOverRay のビルドに失敗しました。' }
}
if (-not (Test-Path -LiteralPath $executable)) { throw 'SysOverRay の実行ファイルがありません。' }
