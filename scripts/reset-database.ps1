[CmdletBinding()]
param(
    # 対象を表示するだけで、何も変更しない。
    [switch]$DryRun,
    # 消す前のバックアップを取らない。
    [switch]$NoBackup
)

$ErrorActionPreference = 'Stop'

# 新しいコードを取得した後でも DB-reset.bat だけで済むように、このフォルダーの Web と API を止め、依存を入れ、
# API を作り直す。作り直しの後の確認はこの JAR でテーブルを作るため、古い JAR だと失敗する。失敗したら DB には触れない。
# 管理者の権限は使わない。DB の操作はアプリ用の DB ユーザーの権限で足りる（2026-11-16 の決定）。
if (-not $DryRun) {
    . (Join-Path $PSScriptRoot 'common.ps1')
    try {
        Set-Location $projectRoot
        Write-Host 'このフォルダーの Web と API を止め、依存を入れて API を作り直します。'
        Stop-OwnedServices
        & npm.cmd install
        if ($LASTEXITCODE -ne 0) { throw 'npm install に失敗しました。' }
        & node (Join-Path $projectRoot 'scripts\api.mjs') build
        if ($LASTEXITCODE -ne 0) { throw 'API のビルドに失敗しました。' }
    } catch {
        Write-Host "$($_.Exception.Message) 上の出力を確認してください。DB は変更していません。"
        exit 1
    }
}

$coreArguments = @{}
if ($DryRun) { $coreArguments.DryRun = $true }
if ($NoBackup) { $coreArguments.NoBackup = $true }
& (Join-Path $PSScriptRoot 'reset-database-core.ps1') @coreArguments
exit $LASTEXITCODE
