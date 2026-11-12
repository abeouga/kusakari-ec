param(
    [switch]$SkipInstall,
    [switch]$Reconfigure,
    [ValidateSet('auto','existing','managed')][string]$DatabaseMode = 'auto'
)
. "$PSScriptRoot\common.ps1"
. "$PSScriptRoot\database.ps1"
. "$PSScriptRoot\database-verify.ps1"
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Set-Location $projectRoot
$lock = $null
try {
    try { $lock = [IO.File]::Open((Join-Path $runtimeDir 'setup.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'このフォルダーで別のsetupが実行中です。終了してから再実行してください。' }
    Initialize-Toolchain
    Initialize-Database $DatabaseMode -reconfigure:$Reconfigure
    if (-not $SkipInstall) {
        # Windows locks a running JAR. Only stop this checkout's verified processes.
        Stop-OwnedServices
        foreach ($command in @(@('ci'), @('run','build:api'), @('run','build:web'))) {
            & npm.cmd @command
            if ($LASTEXITCODE -ne 0) { throw '依存復元またはビルドに失敗しました。上の診断を確認してください。' }
        }
        & npx.cmd playwright install chromium
        if ($LASTEXITCODE -ne 0) { throw 'Chromiumの導入に失敗しました。' }
        & (Join-Path $projectRoot 'sysover-ray2\setup.ps1')
        if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'SysOverRayのビルドに失敗しました。' }
    }
    # Exercise Spring/Flyway for both DBs; never reset application data.
    Invoke-SchemaVerification
    Write-Host 'セットアップが完了しました。start.batで起動してください。'
} finally { if ($lock) { $lock.Dispose() } }
