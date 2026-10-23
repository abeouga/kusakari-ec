> 2026-10-20: 通常起動の認証省略を撤去。以下の過去のデモ検証記録は現在の通常起動条件を示しません。業務試験は実Cognitoを使用します。

# Cognito認証

他PCへの導入は[認証セットアップ手順](cognito-setup.md)、公開接続設定は`config/cognito.development.json`、インフラ定義は`infra/cognito`を参照してください。以下は設計と過去の検証記録です。

## Context

従来のログイン/登録はメモリ内モックで、カートはCookie、庭は固定所有者でした。
CognitoとSpring Securityで本人確認し、ECとCanvasを同一利用者として扱います。初期実装ではAWSリソースを作成していませんでしたが、後続の明示依頼により東京に実User Poolを作成し、成功系を検証しました。

## Decision

- 通常起動はcognito profileを使用し、認証を必須とします。画面モックによるログイン・登録を認証成功として扱いません。
- 通常ログインはECの`/account/login`でメール/パスワードを入力し、CSRF保護された`POST /api/auth/login`からCognitoの`USER_PASSWORD_AUTH`を呼びます。ID tokenの署名/issuer/audience/token_use/期限/必須claimを検証して既存のSpring Securityセッションを発行し、セッションIDとCSRFを更新します。パスワードは保存せず、OAuthトークンはブラウザーへ返しません。
- 新規登録、再設定、追加の本人確認は従来のCognito Managed Loginを維持します。`GET /api/auth/login?managed=true`（登録は`signup=true`）から認証コード+S256 PKCE、state、nonceを使い、Spring Securityが検証します。追加確認を通常のログイン成功として扱いません。
- ブラウザーにはHttpOnly・SameSite=Lax・Path=/の`KUSAKARI_SESSION`だけを渡します。公開用HTTPS設定ではSecure属性を付けます。OAuthトークンをlocalStorage等に保存しません。
- セッションはECプロセス内に保持し、アイドル30日で終了します。ID tokenの期限切れはCognitoのrefresh tokenで自動更新し、refresh tokenは30日で失効します。詳細は[認証の更新トークン方式](auth-token-renewal.md)を参照してください。再起動すると再ログインが必要です。複数ECタスクへの拡張・永続セッションは今回の対象外です。
- `GET /api/auth/me`はmode/authenticated/id/email/name/role/storeIdsを返します。`GET /api/auth/csrf`で得た確認情報を更新系要求のヘッダーへ付け、`POST /api/auth/logout`でローカルセッションとCognitoのブラウザーセッションを終了します。
- Canvasは受信Cookieを、設定済みECオリジンの`/api/auth/me`へ照会します。更新系は同じCSRFヘッダーを`POST /api/auth/verify`へ渡し、ECで検証します。認証確認に失敗した場合は401/403/503を返し、固定所有者へ戻しません。
- ECからCanvasへの庭照会・モデル解決も同じセッション/CSRFを転送します。認証用HTTPクライアントはリダイレクトしません。クライアントから受け取ったownerIdやユーザーヘッダーは採用しません。
- Flyway V8の`auth_members`を利用者と権限の正本にします。Cognitoのissuer+subで紐付け、通常登録はUSER固定です。メールや画面の役割選択では昇格させません。
- カートには会員IDを追加し、注文は従来のカート参照を維持します。庭の既存owner_id列にはEC会員IDを使用します。既存のデモカート・注文・庭は自動移管しません。
- 商品/店舗の閲覧以外は原則ログイン必須です。SELLERの担当店舗と商品作成者を照合し、共通の既存商品の全体編集・削除はADMINに限定します。権限はDBを都度確認し、enabled=falseで次のAPIから拒否します。
- 公開カタログの読取専用POSTである商品画像参照と資材見積は未ログインでも利用可能です。データを更新しないこの2経路だけをCSRF対象から除外し、Canvasからの商品照会を維持します。
- 管理画面の審査・会員管理等は既存の画面モックのままです。Cognitoユーザーを作成・削除する管理機能や出店申請の実処理は追加しません。

## Alternatives

ブラウザー側でJWTを管理する方式は採用しません。既存Cookie/API構成を維持し、ECを認証窓口にします。
Canvas専用User Poolや別ログインは追加しません。Terraformは隣接する`kusakari-terraform`にまとめ、共通Cognitoを1回だけ定義します。

## Consequences

Canvasの認証済みデータ操作にはECへの疎通が必要です。障害時には保存を拒否します。既存のprivate-preview境界は維持し、認証追加だけで一般公開の準備完了とは扱いません。
ローカルでは両画面のホスト名を127.0.0.1に統一します。CognitoのreturnToは設定済みEC/Canvasオリジンだけを許可します。
Canvasの未ログイン時はECの`/account/login?returnTo=...`へ自動転送し、成功後は元のCanvas画面へ戻します。Canvas内にログインフォーム/ログインボタンは置きません。編集中のAPIが401を返した場合も同じEC画面へ転送します。403/503を未ログイン扱いにはしません。
設定値とテストアカウント作成は`kusakari-terraform/README.md`を参照してください。東京の実User Poolとテスト2利用者を登録し、Git対象外`.env`に実設定を反映済みです。

## 検証

`npx playwright test --config playwright.custom-login.config.js`はGit対象外のEC `.env`とTerraform `.env.test-accounts`を読み、実Cognito・専用MySQL・EC/Canvas・Chromiumで成功系を確認します。資格情報を記録しないようtrace/HARは無効です。誤パスワード、CSRF欠落、ログイン前後のセッションID更新、ECからCanvasへの復帰、再読込、実庭保存、ログアウト後の編集中401、外部returnTo拒否、モバイル表示を検証します。
メールはTerraformの登録スクリプトと実User Poolで`test.user@example.com`/`test.seller@example.com`を確認済みです。既存パスワードはCognitoから取得できず、ローカル設定との比較と実認証で確認します。

`npx playwright test --config playwright.auth.config.js`は実EC/FastAPI/専用MySQL/Chromiumを使用します。
未ログイン拒否・偽造セッション拒否・CSRF欠落・認証URLのPKCE/state/nonce・不正コールバック・再読み込み後の画面を確認します。
登録先には接続しないため、認証成功を模倣するAPIや仮のJWTは使用しません。
実Cognitoが作成された後、指定のテスト2利用者によるログイン・ログアウト、他人のカート/注文/庭/写真/履歴/買い物リスト拒否、担当外店舗拒否、本人商品編集、権限変更と無効化を追加確認します。
これらの成功をローカルの拒否系テストで代替しません。

## 2026-10-19の確認結果

- Terraformのfmt/validate、ECのJavaコンパイルと実行可能JAR作成、両フロントのビルド、ECの型確認/lint、Canvasのlint/コンパイルが成功しました。起動中JARの名前変更が拒否されたためJavaのパッケージ作成は検証用コピーで行い、成功したJARを元のtargetへ反映しました。通常アプリは再起動していません。
- `artifacts/auth/report.json`: 最終3件成功。実API/MySQL/Chromiumで未認証・偽造Cookie・CSRF・読取専用カタログ・認証URL・不正callback・EC/Canvas再読込を確認しました。APIモックと仮のログイン成功は使っていません。
- 購入/Canvas回帰は初回6件中4件成功。重複名に曖昧一致するテスト対象を商品IDで特定し、長いカタログの全ページ撮影を可視範囲へ変更した後、失敗2件と未設定認証1件を再実行して3件成功しました。機能の期待値は変更していません。初回は`artifacts/e2e/cart-ux-results.json`、再実行は`artifacts/e2e/shopping-regression-results.json`です。
- 認証用の専用MySQLでFlyway V8を適用しました。通常開発DBの移行、実Cognito、AWS配備、テストアカウント登録は実施していません。
- CLIプロファイル`kusakari-dev`は作成してSTS認証を確認しました。既定プロファイルは維持し、現在のCognito一覧取得には組織SCPによる明示的拒否があることを確認しています。

## 2026-10-19 AWSへの作成依頼後の確認

後続の依頼でCognito作成が許可されたため、`kusakari-dev`で4件追加のTerraform planを保存し、applyしました。
最初の`cognito-idp:CreateUserPool`がSCP `p-4ynty6tp`の明示的拒否となり、作成には失敗しました。
適用後のTerraform管理リソースは0件で、User Poolとテスト2アカウントは存在しません。実ログイン検証は未実施です。
組織ポリシーの内容確認も権限不足でした。詳細とAWSリクエストIDは`kusakari-terraform/README.md`へ記録しました。

## 2026-10-19 SCP解除後の実認証検証

- 明示承認に基づき高度な機能を有効化し、管理アカウントの一時CLI認証で東京のCognitoだけを許可しました。User Poolは`ap-northeast-1_HvkWp5qwE`、クライアントは`1pmnu6u8nh1g4o63e7t0tjlu5m`です。
- 通常開発DBをバックアップし、Flyway V8を適用しました。既存の商品の件数46、カート件数87を事前確認し、既存データは削除していません。
- `test.user@example.com`をUSER、`test.seller@example.com`をSELLER/店舗1としてCognitoとEC DBに登録しました。パスワードは利用者が指定した開発用の値を使用し、記録・成果物には含めません。
- Chromeの実Cognito Managed Loginから両者のログインが成功しました。ECの実APIが異なる会員ID、USER/SELLER、担当店舗1を返します。利用者の再読み込み後の認証維持も確認しました。
- USERから出店者APIはFORBIDDEN、SELLERから店舗1は商品31件取得、店舗2はFORBIDDENでした。CanvasでUSERの庭を作成・保存・再読み込みし、SELLERの同じ庭へのアクセスは404、庭一覧は空でした。
- ログアウト後にECはauthenticated=false、Canvasの庭取得は401でした。既存の拒否系テストと区別して、実AWS成功系の証跡を保存しました。
- ログアウトボタンに処理中表示と二重押下防止を追加しました。ECのtypecheck/lint/フロントbuild/Java packageは成功しました。
- 全APIの認可監査、実決済、本番公開、費用閾値到達時の自動制限発動は今回の実認証検証と区別します。費用制御は利用者が「通知と自動制限」を採用し、年10 USD予算・8 USDでの書込制限を設定済みです。年3,000円の絶対上限ではありません。

## 2026-10-20 EC専用ログインページの確認

- Terraformは既存クライアント1件だけを更新しました。作成・削除は0件、適用後のplanは差分なしでした。既存アカウントのメール/パスワード/権限は変更していません。
- 実Cognito・専用MySQL・Chromiumの`playwright.custom-login.config.js`は2件成功しました。EC独自フォーム、誤パスワード、ログインCSRF、セッションID更新、Canvas復帰、画面からの庭作成、再読込、実庭JSON、ログアウト後の401転送、外部returnTo拒否を確認しました。`artifacts/custom-login/report.json`、`garden.json`、再読込後の画面を証跡とし、trace/HARは作成していません。
- `playwright.auth.config.js`は5件成功しました。公開カタログ、個人データ拒否、偽造Cookie/CSRF、従来のPKCEと不正callback拒否、ECログインのレスポンシブ表示、Canvas一覧/庭の直接URL/モデルプレビューからECへの自動転送を確認しました。
- 通常の5186/5173環境でも、USERとSELLER/店舗1で独自ログインAPI・共有セッション・Canvas庭一覧・ログアウトの実応答を確認しました。EC APIは更新後の実行可能JARで再起動しています。
- ECのtypecheck/lint/フロントbuild、Javaのclean package、Canvasのlint/フロントbuild/API lint/APIコンパイルは成功しました。Canvasの既存`e2e/tsconfig.json`による全体型確認は、既存テストのNodeNext import拡張子と宣言不足等で失敗しており、成功として扱いません。
- Windowsの設定読込でCognito profile/issuer/client/domainを受け付けるようにしました。今回の起動確認はAPI/HTTPと実認証で、SysOverRay全操作の再検証とは区別します。
