# Cognito認証

他PCへの導入は[認証セットアップ手順](cognito-setup.md)、公開接続設定は`config/cognito.development.json`、インフラ定義は`infra/cognito`を参照してください。過去の検証記録は [kusakari-document](https://github.com/abeouga/kusakari-document/blob/main/開発の記録/kusakari-ec/認証とアカウント/2026-10-19_cognito-auth_検証.md) にあります。

## Context

CognitoとSpring Securityで本人確認し、ECとCanvasを同一利用者として扱います。東京のUser Poolを使い、通常起動では認証を省略しません。

## Decision

- 通常起動はcognito profileを使用し、認証を必須とします。
- 通常ログインはECの`/account/login`でメール/パスワードを入力し、CSRF保護された`POST /api/auth/login`からCognitoの`USER_PASSWORD_AUTH`を呼びます。ID tokenの署名/issuer/audience/token_use/期限/必須claimを検証してSpring Securityセッションを発行し、セッションIDとCSRFを更新します。パスワードは保存せず、OAuthトークンはブラウザーへ返しません。
- 新規登録は`/account/login`の同じカード内で行います（Issue #87、[決定記録](decisions/2026-11-09-signup-in-login-card.md)）。CSRF保護された`POST /api/auth/signup`・`/signup/confirm`・`/signup/resend`がCognitoの`SignUp`・`ConfirmSignUp`・`ResendConfirmationCode`を呼び、確認後は通常ログインと同じ`POST /api/auth/login`でセッションを発行します。
- パスワードの再設定と追加の本人確認はCognito Managed Loginを使います。`GET /api/auth/reset`と`GET /api/auth/login?managed=true`から認証コード+S256 PKCE、state、nonceを使い、Spring Securityが検証します。追加確認を通常のログイン成功として扱いません。
- ブラウザーにはHttpOnly・SameSite=Lax・Path=/の`KUSAKARI_SESSION`だけを渡します（`application-cognito.properties`）。公開用HTTPS設定（`application-container.properties`）ではSecure属性を付けます。OAuthトークンをlocalStorage等に保存しません。
- セッションはECプロセス内に保持し、30日で終了します。ID tokenの期限切れはCognitoのrefresh tokenで自動更新し、refresh tokenは30日で失効します。詳細は[認証の更新トークン方式](auth-token-renewal.md)を参照してください。再起動すると再ログインが必要です。複数ECタスクへの拡張・永続セッションは対象外です。
- `GET /api/auth/me`はmode/authenticated/id/email/name/accountType/organizationId/organizationRole/storeIdsを返します。`GET /api/auth/csrf`で得た確認情報を更新系要求のヘッダーへ付け、`POST /api/auth/logout`でローカルセッションを終了し、Cognitoのブラウザーセッションを終了するURL（`logoutUrl`）を返します。
- Canvasは受信Cookieを、設定済みECオリジンの`/api/auth/me`へ照会します。更新系は同じCSRFヘッダーを`POST /api/auth/verify`へ渡し、ECで検証します。認証確認に失敗した場合は401/403/503を返し、固定所有者へ戻しません。
- ECからCanvasへの庭照会・モデル解決も同じセッション/CSRFを転送します。認証用HTTPクライアントはリダイレクトしません。クライアントから受け取ったownerIdやユーザーヘッダーは採用しません。
- ECの`members`を利用者の正本にします。Cognitoのissuer+subjectで紐付け、初回ログイン・新規登録で作る会員は購入者（`USER`）固定です。メールや画面の選択では昇格させません。会員の種別と店舗ごとのロールは[会員の種別とロールの値](member-roles.md)を参照してください。
- カートは会員ごとに1つ（`carts.member_id`）、注文は購入者の会員ID（`orders.buyer_member_id`）を持ちます。Canvasの庭の`owner_id`にはEC会員IDを使用します。
- 商品・店舗・カテゴリの閲覧（GET）以外は原則ログイン必須です。店舗の操作は店舗のロール（`AuthService.requireSeller`・`requireManager`など）、運営の操作は`ADMIN`で確かめます。権限は要求ごとにDBで確認し、利用停止（`enabled=false`）の会員は次の要求から拒否してセッションを無効にします。
- 公開カタログの読取専用POSTである商品照会（`/api/products/references`）と資材見積（`/api/materials/quote`）は未ログインでも利用可能です。データを更新しないこの2経路と、Stripeの署名で確かめるWebhook（`/api/payments/stripe/webhook`）だけをCSRF対象から除外します。

## Alternatives

ブラウザー側でJWTを管理する方式は採用しません。既存Cookie/API構成を維持し、ECを認証窓口にします。
Canvas専用User Poolや別ログインは追加しません。Terraformは隣接する`kusakari-terraform`にまとめ、共通Cognitoを1回だけ定義します。

## Consequences

Canvasの認証済みデータ操作にはECへの疎通が必要です。障害時には保存を拒否します。既存のprivate-preview境界は維持し、認証追加だけで一般公開の準備完了とは扱いません。
ローカルでは両画面のホスト名を127.0.0.1に統一します。CognitoのreturnToは設定済みEC/Canvasオリジンだけを許可します。
Canvasの未ログイン時はECの`/account/login?returnTo=...`へ自動転送し、成功後は元のCanvas画面へ戻します。Canvas内にログインフォーム/ログインボタンは置きません。編集中のAPIが401を返した場合も同じEC画面へ転送します。403/503を未ログイン扱いにはしません。
設定値とテストアカウントの登録は`kusakari-terraform/README.md`を参照してください。開発用のテストアカウントは`user01@example.com`など9つです（[テスト用アカウントの作り直し](decisions/2026-11-15-test-accounts.md)）。

## 検証方針

`npx playwright test --config e2e/configs/playwright.custom-login.config.js`はGit対象外のEC `.env`とTerraform `.env.test-accounts`を読み、実Cognito・専用MySQL・EC/Canvas・Chromiumで成功系を確認します。資格情報を記録しないようtrace/HARは無効です。誤パスワード、CSRF欠落、ログイン前後のセッションID更新、ECからCanvasへの復帰、再読込、実庭保存、ログアウト後の編集中401、外部returnTo拒否、モバイル表示を検証します。

`npx playwright test --config e2e/configs/playwright.auth.config.js`は実EC/FastAPI/専用MySQL/Chromiumを使用し、Cognitoには接続しません。未ログイン拒否・偽造セッション拒否・CSRF欠落・認証URLのPKCE/state/nonce・不正コールバック・再読み込み後の画面を確認します。認証成功を模倣するAPIや仮のJWTは使用しません。これらの拒否系の結果を、実Cognitoでの成功系の代わりにしません。
