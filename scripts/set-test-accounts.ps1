# テスト用アカウント9つの会員と種別を、開発用 DB（kusakari）にそろえる（#157、docs/decisions/2026-11-15-test-accounts.md）。
# DB-reset.bat と setup.bat が最後に実行する。単独でも実行できる。何度実行しても同じ結果になる。
# AWS にも Cognito にも接続せず、パスワードも使わない。会員は下の一覧の ID（sub）で作るので、初めてログインしたときに
# EC はその会員をそのまま使う。ID は秘密ではない識別子。User Pool でアカウントを作り直したら、
# kusakari-terraform の register-test-users.py --execute が出力する ISSUER と SUBJECT で、この一覧を書き直す。

$testAccountIssuer = 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_HvkWp5qwE'
$testAccounts = @(
    @{ Email = 'user01@example.com'; Subject = 'e7946ac8-f0f1-70af-ceff-f5cac91c4edf'; Name = 'テスト購入者01'; Role = 'USER' }
    @{ Email = 'admin01@example.com'; Subject = 'c7843ae8-00c1-70ca-c9ac-8e06db1d3347'; Name = 'テスト運営01'; Role = 'ADMIN' }
    @{ Email = 'owner01@example.com'; Subject = 'e7a48ac8-2071-70d3-8b8c-0b0abf004485'; Name = 'テストオーナー01'; Role = 'SHOP_OWNER'; OrganizationId = 1 }
    @{ Email = 'orgadmin01@example.com'; Subject = 'd734ea58-60e1-70ac-af68-ced36f28b4f4'; Name = 'テストORG_ADMIN01'; Role = 'SHOP_STAFF'; StoreId = 2; StoreRole = 'MANAGER'; OrganizationAdmin = $true }
    @{ Email = 'manager01@example.com'; Subject = '97343a78-b051-70da-42db-c2cbf32d124f'; Name = 'テストMANAGER01'; Role = 'SHOP_STAFF'; StoreId = 1; StoreRole = 'MANAGER' }
    @{ Email = 'staff01@example.com'; Subject = 'e714aa38-40d1-7048-1757-918d2d8d7ca1'; Name = 'テストSTAFF01'; Role = 'SHOP_STAFF'; StoreId = 1; StoreRole = 'STAFF' }
    @{ Email = 'unassigned01@example.com'; Subject = '27f46a48-f0d1-7055-f885-1dff0e8cd412'; Name = 'テストロールなし01'; Role = 'SHOP_STAFF'; StoreId = 1; StoreRole = 'NONE' }
    @{ Email = 'applicant01@example.com'; Subject = 'b7642a18-1041-7025-6a99-dfa954e7796c'; Name = 'テスト申請者01'; Role = 'SHOP_OWNER_APPLICANT' }
    @{ Email = 'owner02@example.com'; Subject = 'c7e4dab8-2061-70eb-adf7-7d89e0feaa9b'; Name = 'テストオーナー02'; Role = 'TEST_ORGANIZATION_OWNER' }
)
# owner02 がオーナーの組織。非公開の店舗を1つ持つ。購入者の一覧と Canvas の商品の候補には出ない。
$testOrganizationName = 'Kusakari テスト組織2'
$testStoreName = 'テスト組織2の店舗'

function Get-TestMember([string]$subject) {
    $row = Invoke-MemberSql 'kusakari' "SELECT id, BINARY account_type FROM members WHERE issuer = '$testAccountIssuer' AND subject = '$subject';"
    if (-not $row) { return $null }
    $id, $type = $row -split "`t"
    return [pscustomobject]@{ Id = $id; Type = $type }
}

function Set-TestOrganizationOwner([hashtable]$account) {
    $member = Get-TestMember $account.Subject
    $owned = Invoke-MemberSql 'kusakari' "SELECT id FROM organizations WHERE owner_member_id = '$($member.Id)';"
    if ($owned) { return "kusakari : $($account.Email) は組織 $owned のオーナーです。変更しません。" }
    if ($member.Type -notin 'USER', 'SHOP_OWNER_APPLICANT') { throw "$($account.Email) は $($member.Type) です。組織のオーナーにしません。" }
    # The organization's foreign key accepts only a SHOP_OWNER member, so the account type changes first.
    $null = Invoke-MemberSql 'kusakari' ("START TRANSACTION; " +
        "UPDATE members SET account_type = 'SHOP_OWNER' WHERE id = '$($member.Id)'; " +
        "INSERT INTO organizations(name, owner_member_id) VALUES('$testOrganizationName', '$($member.Id)'); " +
        "INSERT INTO stores(organization_id, name, published) VALUES(LAST_INSERT_ID(), '$testStoreName', FALSE); COMMIT;")
    $created = Invoke-MemberSql 'kusakari' "SELECT o.id FROM organizations o JOIN stores s ON s.organization_id = o.id WHERE o.owner_member_id = '$($member.Id)';"
    if (-not $created) { throw "$($account.Email) の組織を確認できませんでした。" }
    return "kusakari : $($account.Email) を、新しく作った組織 $created（$testOrganizationName）のオーナーにしました。"
}

# 呼ぶ側で Import-LocalSettings を実行し、$script:mysqlBin を決めておく。
function Set-TestAccounts {
    if ($env:KUSAKARI_COGNITO_ISSUER -ne $testAccountIssuer) {
        Write-Host 'テスト用アカウント：.env の KUSAKARI_COGNITO_ISSUER が開発用の User Pool と違うため、会員を作りませんでした。'
        return
    }
    foreach ($account in $testAccounts) {
        $null = Invoke-MemberSql 'kusakari' ("INSERT INTO members(id, issuer, subject, email, display_name, account_type, email_verified_at) " +
            "SELECT UUID(), '$testAccountIssuer', '$($account.Subject)', '$($account.Email)', '$($account.Name)', 'USER', CURRENT_TIMESTAMP(6) FROM DUAL " +
            "WHERE NOT EXISTS (SELECT 1 FROM members WHERE issuer = '$testAccountIssuer' AND subject = '$($account.Subject)');")
    }
    foreach ($account in $testAccounts) {
        $member = Get-TestMember $account.Subject
        if (-not $member) { throw "$($account.Email) の会員を作れませんでした。" }
        $message = switch ($account.Role) {
            'USER' { "kusakari : $($account.Email) は $($member.Type) です。" }
            'TEST_ORGANIZATION_OWNER' { Set-TestOrganizationOwner $account }
            'SHOP_OWNER_APPLICANT' {
                # 承認された後（SHOP_OWNER）は、新しい組織のオーナーとして使い続けるので戻さない。
                if ($member.Type -eq 'USER') { Set-MemberRole -Email $account.Email -Role SHOP_OWNER_APPLICANT }
                else { "kusakari : $($account.Email) は $($member.Type) です。変更しません。" }
            }
            'SHOP_OWNER' { Set-MemberRole -Email $account.Email -Role SHOP_OWNER -OrganizationId $account.OrganizationId }
            'SHOP_STAFF' {
                Set-MemberRole -Email $account.Email -Role SHOP_STAFF -StoreId $account.StoreId -StoreRole $account.StoreRole `
                    -OrganizationAdmin:([bool]$account.OrganizationAdmin)
            }
            default { Set-MemberRole -Email $account.Email -Role $account.Role }
        }
        Write-Host $message
    }
    Write-Host 'テスト用アカウント9つの会員と種別をそろえました。パスワードは kusakari-terraform の .env.test-accounts にあります。'
}

if ($MyInvocation.InvocationName -ne '.') {
    . "$PSScriptRoot\common.ps1"
    . "$PSScriptRoot\database.ps1"
    . "$PSScriptRoot\member-role.ps1"
    try {
        Import-LocalSettings
        $script:mysqlBin = Get-KusakariEcMySqlBin -Portable:($env:KUSAKARI_EC_DATABASE_MODE -eq 'managed')
        Set-TestAccounts
    } catch {
        Write-Error $_.Exception.Message
        exit 1
    }
}
