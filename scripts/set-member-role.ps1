param(
    [Parameter(Mandatory = $true)][string]$Email,
    [Parameter(Mandatory = $true)][ValidateSet('ADMIN', 'SHOP_OWNER', 'SHOP_STAFF')][string]$Role,
    [long]$OrganizationId = 0,
    [long]$StoreId = 0,
    [ValidateSet('MANAGER', 'STAFF')][string]$StoreRole = 'MANAGER',
    [ValidateSet('kusakari', 'kusakari_e2e')][string]$Database = 'kusakari'
)

# Changes the account type of a member who has already logged in once with the configured User Pool.
# A shop normally starts with the business sign-up, the application and the operator's approval. This script is for
# the operator account, and for working with the sample organization, which has no owner after a database reset.
. "$PSScriptRoot\common.ps1"
. "$PSScriptRoot\database.ps1"
try {
    Import-LocalSettings
    $Email = $Email.Trim()
    if ($Email -notmatch '^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,185}$') { throw 'メールアドレスの形式を確認してください。' }
    $issuer = $env:KUSAKARI_COGNITO_ISSUER
    if ($issuer -notmatch '^https://cognito-idp\.[a-z0-9-]+\.amazonaws\.com/[a-z0-9-]+_[A-Za-z0-9]+$') {
        throw '.envのKUSAKARI_COGNITO_ISSUERが未設定です。node scripts/configure-cognito.mjs を実行してください。'
    }
    if ($Role -eq 'SHOP_OWNER' -and $OrganizationId -le 0) { throw 'SHOP_OWNERには -OrganizationId でオーナーのいない組織を指定してください。' }
    if ($Role -ne 'SHOP_OWNER' -and $OrganizationId -ne 0) { throw '-OrganizationId は SHOP_OWNER のときだけ指定します。' }
    if ($Role -eq 'SHOP_STAFF' -and $StoreId -le 0) { throw 'SHOP_STAFFには -StoreId で担当店舗を指定してください。' }
    if ($Role -ne 'SHOP_STAFF' -and $StoreId -ne 0) { throw '-StoreId は SHOP_STAFF のときだけ指定します。' }
    $script:mysqlBin = Get-KusakariEcMySqlBin -Portable:($env:KUSAKARI_EC_DATABASE_MODE -eq 'managed')
    $port = [int]$env:KUSAKARI_EC_DB_PORT
    function Invoke-MemberSql([string]$sql) {
        (Invoke-MySql $env:KUSAKARI_EC_DB_USER $env:KUSAKARI_EC_DB_PASSWORD $port "USE $Database; $sql").Output
    }

    $rows = @((Invoke-MemberSql "SELECT id, BINARY account_type, enabled, withdrawn_at IS NULL FROM members WHERE issuer = '$issuer' AND email = '$Email';") -split "`r?`n" | Where-Object { $_ })
    if ($rows.Count -eq 0) { throw "$Email はこのUser Poolでまだログインしていません。ECで一度ログインしてから再実行してください。" }
    if ($rows.Count -ne 1) { throw "$Email の会員が複数あります。変更せず停止します。" }
    $id, $current, $enabled, $active = $rows[0] -split "`t"
    if ($enabled -ne '1' -or $active -ne '1') { throw "$Email は利用停止中または退会済みです。変更しません。" }

    $target = ''
    if ($Role -eq 'ADMIN') {
        if ($current -notin 'USER', 'ADMIN') { throw "$Email は $current です。店舗側のアカウントをADMINへ変更しません。" }
        $statements = "UPDATE members SET account_type = 'ADMIN' WHERE id = '$id';"
    } elseif ($Role -eq 'SHOP_OWNER') {
        $owner = Invoke-MemberSql "SELECT CONCAT('owner=', IFNULL(owner_member_id, '')) FROM organizations WHERE id = $OrganizationId;"
        if (-not $owner) { throw "組織 $OrganizationId がありません。" }
        if ($owner -ne 'owner=' -and $owner -ne "owner=$id") { throw "組織 $OrganizationId にはすでにオーナーがいます。変更しません。" }
        if ($current -notin 'USER', 'SHOP_OWNER_APPLICANT', 'SHOP_OWNER') { throw "$Email は $current です。SHOP_OWNERへ変更しません。" }
        if ($current -eq 'SHOP_OWNER' -and $owner -ne "owner=$id") { throw "$Email はすでに別の組織のオーナーです。変更しません。" }
        $target = "（組織 $OrganizationId）"
        # The organization's foreign key accepts only a SHOP_OWNER member, so the account type changes first.
        $statements = "UPDATE members SET account_type = 'SHOP_OWNER' WHERE id = '$id'; " +
            "UPDATE organizations SET owner_member_id = '$id' WHERE id = $OrganizationId AND (owner_member_id IS NULL OR owner_member_id = '$id');"
    } else {
        $organization = Invoke-MemberSql "SELECT organization_id FROM stores WHERE id = $StoreId;"
        if (-not $organization) { throw "店舗 $StoreId がありません。" }
        if ($current -notin 'USER', 'SHOP_STAFF') { throw "$Email は $current です。SHOP_STAFFへ変更しません。" }
        $joined = Invoke-MemberSql "SELECT organization_id FROM organization_members WHERE member_id = '$id';"
        if ($joined -and $joined -ne $organization) { throw "$Email は別の組織の子アカウントです。変更しません。" }
        $target = "（店舗 $StoreId の $StoreRole）"
        $statements = "UPDATE members SET account_type = 'SHOP_STAFF' WHERE id = '$id'; " +
            "INSERT INTO organization_members(organization_id, member_id) VALUES($organization, '$id') ON DUPLICATE KEY UPDATE organization_id = organization_id; " +
            "INSERT INTO store_members(store_id, member_id, organization_id, role) VALUES($StoreId, '$id', $organization, '$StoreRole') ON DUPLICATE KEY UPDATE role = VALUES(role);"
    }
    # The client stops at the first failed statement and the connection closes without COMMIT, so nothing is half applied.
    $null = Invoke-MemberSql "START TRANSACTION; $statements COMMIT;"

    $after = Invoke-MemberSql "SELECT BINARY account_type FROM members WHERE id = '$id';"
    if ($after -cne $Role) { throw '権限の更新を確認できませんでした。' }
    if ($Role -eq 'SHOP_OWNER' -and (Invoke-MemberSql "SELECT COUNT(*) FROM organizations WHERE id = $OrganizationId AND owner_member_id = '$id';") -ne '1') {
        throw 'オーナーの設定を確認できませんでした。'
    }
    if ($Role -eq 'SHOP_STAFF' -and (Invoke-MemberSql "SELECT COUNT(*) FROM store_members WHERE store_id = $StoreId AND member_id = '$id' AND BINARY role = '$StoreRole';") -ne '1') {
        throw '担当店舗の設定を確認できませんでした。'
    }
    Write-Host "$Database : $Email を $current から $Role$target にしました。ECの画面を再読み込みすると反映されます。"
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
