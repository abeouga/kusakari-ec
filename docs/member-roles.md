# 会員の種別とロールの値

## Context

会員の権限は、以前は`auth_members.role`に`USER`/`SELLER`/`ADMIN`で保存していました。列の照合順序が大文字小文字・全角半角を区別しなかったため、SQLを手入力して`seller`や`Ｓｅｌｌｅｒ`を入れると、ログインはできても出店者画面に入れない不具合が起きました（Flyway V14で修正）。

2026-11-12にDBを作り直し（[記録](decisions/2026-11-11-shop-organization-db-v3.md)）、店舗側のアカウントを「組織のオーナー」と「店舗の担当者」に分けました。権限は1つの列ではなく、会員の種別と、店舗ごとのロールで決まります。

## Decision

- 会員の種別は`members.account_type`に保存します。値は`USER`（購入者）、`SHOP_OWNER_APPLICANT`（出店を申請するアカウント）、`SHOP_OWNER`（組織のオーナー）、`SHOP_STAFF`（店舗の担当者）、`ADMIN`（運営）の5つです。CHECK制約はバイナリ比較で、大文字小文字・全角・末尾空白の違いを拒否します。
- オーナーは`organizations.owner_member_id`で組織と結び付き、その組織の全店舗を操作できます。外部キーが、オーナーに指定できる会員を`SHOP_OWNER`だけに限ります。
- 担当者は`organization_members`で組織に入り、`store_members.role`（`MANAGER`/`STAFF`/なし）で店舗ごとの操作が決まります。`STAFF`は商品の編集（価格を含む）・公開・在庫・注文の受け渡し、`MANAGER`はそれに加えて店舗情報の編集・商品の登録と削除・キャンセル申請への回答ができます。ロールのない担当者は、所属する店舗の店舗情報と、出店者の商品一覧・在庫を見られるだけで（GET）、変更と注文の閲覧はできません（#105、[残りの決定](decisions/2026-11-12-remaining-decisions.md)）。
- 担当者は、組織の人事のロール（`organization_members.role`）として `ORG_ADMIN` を持てます。ORG_ADMIN は、組織の全員のアカウント一覧、組織の全店舗のロール（MANAGER・STAFF）の割り振り、別の店舗の担当の追加・解除、招待キーの発行ができます。商品・在庫・注文は、ORG_ADMIN でも店舗のロールに従います。ORG_ADMIN を付け外しできるのはオーナーだけです。MANAGER は自分の店舗の担当者だけを一覧で見て、STAFF とロールなしの間だけを変えられます。権限の表は [招待キーと人事のロール](decisions/2026-11-13-store-invitations-and-roles.md) にあり、判定は `StaffPolicy` 1か所で行います。
- 担当者は、店舗の招待キーで新規登録して作ります（#111）。オーナー・ORG_ADMIN・MANAGER が出店者画面の「招待キー」で発行し、キーかキー入りの登録用 URL（`/account/login?invite=...`）を渡します。登録した時点で `SHOP_STAFF` の会員・組織への所属・店舗の担当（ロールなし）ができ、その後「アカウント」の画面でロールを割り振ります。キーは新規登録のときだけ使え、ログイン中の購入者のアカウントでは使えません。
- 店舗側のアカウント（`SHOP_OWNER`・`SHOP_STAFF`）と申請中のアカウント（`SHOP_OWNER_APPLICANT`）は、カート・注文・庭の買い物リストを使えません（API は403 `BUYER_REQUIRED`）。購入者（`USER`）と運営（`ADMIN`）は使えます（#108）。
- 通常の出店は、企業様向けの登録（`SHOP_OWNER_APPLICANT`）→ 出店申請 → 運営の承認（`SHOP_OWNER`になり、組織ができる）→ オーナーによる店舗の作成、の順です。
- 初回ログインの扱い（#108）：会員は、企業様向けの登録（`SHOP_OWNER_APPLICANT`）と招待キーでの登録（`SHOP_STAFF`）では登録した時点で作り、メール確認前の状態で持ちます。初めてログインしたときは、その会員をそのまま使い、メール確認済みにするだけです。それ以外（通常の新規登録、DB の初期化（`DB-reset.bat`）の後に Cognito に残っているユーザー）は、初めてログインしたときに購入者（`USER`）の会員を作ります（`AuthService.provision`）。DB の初期化では Cognito のユーザーを消さないので、初期化の後に店舗側のアカウントとして使うには、出店申請か招待キーでの登録、開発用なら下のスクリプトで種別を付け直します。
- 開発用に種別を直接付け替えるときは`scripts/set-member-role.ps1`を使います。`.env`のDB接続と`KUSAKARI_COGNITO_ISSUER`を使い、そのUser Poolでログイン済みの有効な会員1件だけを変更します。
  - `-Role ADMIN`：購入者を運営にします。
  - `-Role SHOP_OWNER -OrganizationId 1`：オーナーのいない組織（DBの初期化後のサンプルの組織）のオーナーにします。
  - `-Role SHOP_STAFF -StoreId 1 [-StoreRole MANAGER|STAFF]`：その店舗の担当者にします。

## Alternatives

アプリ側で大文字小文字を無視して比較する方法は、判定箇所がJava・EC画面・Canvas画面に分散しており、1か所の漏れで同じ不具合が残るため採用しません。Cognitoグループへ権限を移す方法は、各PCのDBごとに権限を持つ現行の設計とE2Eの準備手順を変えるため、採用しません。

## Consequences

- MySQLクライアントで直接変更する場合も、上の5つの値しか保存できません。オーナーや担当者の会員を別の種別へ変えるには、先に組織・店舗との結び付きを外す必要があります（外部キーが拒否します）。
- スクリプトは、すでにオーナーのいる組織、別の組織の担当者、店舗側のアカウントから`ADMIN`への変更を、何も変えずに止めます。
- 出店承認を取り消すスクリプト（`scripts/revert_store_approval.py`）は、承認で店舗を作らなくなったため削除しました。開発用DBを最初の状態に戻すときは`DB-reset.bat`（[手順](database-reset.md)）を使います。
