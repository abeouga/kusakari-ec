param(
    [Parameter(Mandatory = $true)][string]$Email,
    [Parameter(Mandatory = $true)][ValidateSet('SELLER', 'ADMIN')][string]$Role,
    [long]$StoreId = 0,
    [ValidateSet('kusakari', 'kusakari_e2e')][string]$Database = 'kusakari'
)

# Grants a role to a member who has already logged in once with the configured User Pool.
# Roles are matched exactly by the application, so the value is always written in upper case.
. "$PSScriptRoot\common.ps1"
. "$PSScriptRoot\database.ps1"
try {
    Import-LocalSettings
    $Role = $Role.ToUpperInvariant()
    $Email = $Email.Trim()
    if ($Email -notmatch '^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,185}$') { throw 'メールアドレスの形式を確認してください。' }
    $issuer = $env:KUSAKARI_COGNITO_ISSUER
    if ($issuer -notmatch '^https://cognito-idp\.[a-z0-9-]+\.amazonaws\.com/[a-z0-9-]+_[A-Za-z0-9]+$') {
        throw '.envのKUSAKARI_COGNITO_ISSUERが未設定です。node scripts/configure-cognito.mjs を実行してください。'
    }
    if ($Role -eq 'SELLER' -and $StoreId -le 0) { throw 'SELLERには -StoreId で担当店舗を指定してください。' }
    if ($Role -eq 'ADMIN' -and $StoreId -ne 0) { throw 'ADMINには店舗を指定しません。' }
    $script:mysqlBin = Get-KusakariEcMySqlBin -Portable:($env:KUSAKARI_EC_DATABASE_MODE -eq 'managed')
    $port = [int]$env:KUSAKARI_EC_DB_PORT
    function Invoke-MemberSql([string]$sql) {
        (Invoke-MySql $env:KUSAKARI_EC_DB_USER $env:KUSAKARI_EC_DB_PASSWORD $port "USE $Database; $sql").Output
    }

    $rows = @((Invoke-MemberSql "SELECT id, BINARY role, IFNULL(store_id, ''), enabled, withdrawn_at IS NULL FROM auth_members WHERE issuer = '$issuer' AND email = '$Email';") -split "`r?`n" | Where-Object { $_ })
    if ($rows.Count -eq 0) { throw "$Email はこのUser Poolでまだログインしていません。ECで一度ログインしてから再実行してください。" }
    if ($rows.Count -ne 1) { throw "$Email の会員が複数あります。変更せず停止します。" }
    $id, $currentRole, $currentStore, $enabled, $active = $rows[0] -split "`t"
    if ($enabled -ne '1' -or $active -ne '1') { throw "$Email は利用停止中または退会済みです。変更しません。" }
    if ($Role -eq 'SELLER') {
        if (-not (Invoke-MemberSql "SELECT id FROM stores WHERE id = $StoreId;")) { throw "店舗 $StoreId がありません。" }
        if ($currentRole -eq 'ADMIN') { throw "$Email はADMINです。SELLERへ変更しません。" }
    }
    $store = if ($Role -eq 'SELLER') { [string]$StoreId } else { 'NULL' }
    $null = Invoke-MemberSql "UPDATE auth_members SET role = '$Role', store_id = $store WHERE id = '$id' AND enabled = TRUE AND withdrawn_at IS NULL;"
    $after = Invoke-MemberSql "SELECT CONCAT(BINARY role, ':', IFNULL(store_id, '')) FROM auth_members WHERE id = '$id';"
    if ($after -cne "${Role}:$(if ($Role -eq 'SELLER') { $StoreId })") { throw '権限の更新を確認できませんでした。' }
    $storeText = if ($Role -eq 'SELLER') { "（店舗 $StoreId）" } else { '' }
    if ($currentRole -ceq $Role -and $currentStore -eq "$(if ($Role -eq 'SELLER') { $StoreId })") {
        Write-Host "$Database : $Email はすでに $Role$storeText です。"
    } else {
        Write-Host "$Database : $Email を $currentRole から $Role$storeText に変更しました。ECの画面を再読み込みすると反映されます。"
    }
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
