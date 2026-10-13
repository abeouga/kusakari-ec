param(
    [switch]$NoBrowser,
    [switch]$NoOverlay
)

# Existing-MySQL PCs use the dedicated setup path when the local configuration
# or MySQL service is not ready. A normal restart does not rebuild the DB.
$ErrorActionPreference = 'Stop'

try {
    $projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $settings = Join-Path $projectRoot '.env'
    $modeLine = if (Test-Path -LiteralPath $settings) { Get-Content -LiteralPath $settings | Where-Object { $_ -eq 'KUSAKARI_EC_DATABASE_MODE=existing' } | Select-Object -First 1 }
    $portLine = if (Test-Path -LiteralPath $settings) { Get-Content -LiteralPath $settings | Where-Object { $_ -eq 'KUSAKARI_EC_DB_PORT=3306' } | Select-Object -First 1 }
    $mysqlReady = @(Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue).Count -gt 0
    if (-not $modeLine -or -not $portLine -or -not $mysqlReady) {
        & (Join-Path $PSScriptRoot 'setup-existing-mysql.ps1') -SkipInstall
        if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    if ($NoBrowser -and $NoOverlay) {
        & (Join-Path $PSScriptRoot 'start.ps1') -NoBrowser -NoOverlay
    } elseif ($NoBrowser) {
        & (Join-Path $PSScriptRoot 'start.ps1') -NoBrowser
    } elseif ($NoOverlay) {
        & (Join-Path $PSScriptRoot 'start.ps1') -NoOverlay
    } else {
        & (Join-Path $PSScriptRoot 'start.ps1')
    }
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
