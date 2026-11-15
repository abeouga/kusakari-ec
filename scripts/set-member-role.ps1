param(
    [Parameter(Mandatory = $true)][string]$Email,
    [Parameter(Mandatory = $true)][ValidateSet('ADMIN', 'SHOP_OWNER', 'SHOP_STAFF', 'SHOP_OWNER_APPLICANT')][string]$Role,
    [long]$OrganizationId = 0,
    [long]$StoreId = 0,
    [ValidateSet('MANAGER', 'STAFF', 'NONE')][string]$StoreRole = 'MANAGER',
    [switch]$OrganizationAdmin,
    [ValidateSet('kusakari', 'kusakari_e2e')][string]$Database = 'kusakari'
)

# Changes the account type of a member who has already logged in once with the configured User Pool.
# The fixed test accounts are set up by scripts/set-test-accounts.ps1 instead (docs/decisions/2026-11-15-test-accounts.md).
. "$PSScriptRoot\common.ps1"
. "$PSScriptRoot\database.ps1"
. "$PSScriptRoot\member-role.ps1"
try {
    Import-LocalSettings
    $script:mysqlBin = Get-KusakariEcMySqlBin -Portable:($env:KUSAKARI_EC_DATABASE_MODE -eq 'managed')
    $message = Set-MemberRole -Email $Email -Role $Role -OrganizationId $OrganizationId -StoreId $StoreId `
        -StoreRole $StoreRole -OrganizationAdmin:$OrganizationAdmin -Database $Database
    Write-Host "$message ECの画面を再読み込みすると反映されます。"
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
