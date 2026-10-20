param(
    [ValidateSet('auto','existing','managed')][string]$DatabaseMode = 'auto',
    [switch]$SkipInstall
)
$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$setupScript = Join-Path $repositoryRoot 'scripts\setup.ps1'
if (-not (Test-Path -LiteralPath $setupScript) -or -not (Test-Path -LiteralPath (Join-Path $repositoryRoot 'backend\pom.xml'))) {
    throw 'kusakari-ecのプロジェクト全体が必要です。このフォルダーだけをコピーせず、リポジトリ全体を配置してください。'
}
& $setupScript -DatabaseOnly -Reconfigure -DatabaseMode $DatabaseMode -SkipInstall:$SkipInstall
