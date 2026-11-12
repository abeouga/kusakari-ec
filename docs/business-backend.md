# EC / Canvas 業務バックエンド

## Context

2026-10-20。既存の商品・在庫・カート・注文保存と、サンプルの受注・審査画面が分断されていた。ECのCognitoカスタムログインとCanvasのモデル・庭保存を維持し、同じ商品・会員・注文へ接続する。

## Decision

ECはSpring Boot / Lombok / JPA / MapStruct。auth、member、store、catalog、commerce、notificationの機能単位でControllerと検証DTO、トランザクションを管理するService、RepositoryとEntityを分離する。Entityを応答にしない。Lombokはコンストラクタ注入とGetter等へ使用し、`@Data`は使用しない。注文状態変更・会員退会・権限付与は明示したEntityメソッドで表す。汎用基底Serviceは作らない。

Canvasは既存FastAPI / SQLAlchemy / Alembicを維持する。今回Canvas DBの新規スキーマ変更は不要。庭のproductId・modelComposition・座標の保存機能を再利用する。EC商品詳細・カートからproductIdを渡し、庭を選んだ後にモデルを選択する。利用者の配置操作なしにオブジェクトを増やさない。

価格・在庫・カート・注文の正本はEC。庭・配置・写真・画像生成履歴の正本はCanvas。相互連携はHTTPのみで、DB相互参照・分散トランザクションは使用しない。買い物リストとECカートは独立する。

## 注文と権限

- 店舗受け取りのみ。新規DTOは氏名・電話・連絡先メールだけを受け付け、配送先・配送日時・決済手段は受け付けない。既存注文の保存済み情報は保持する。
- カートをロックし、requestIdとrevisionを照合。店舗・商品・店舗在庫をロックして価格・公開・販売停止・在庫を再確認する。在庫減算、注文と商品スナップショット、カート消去、宛先通知を同一トランザクションで保存する。
- 注文受付→受取準備完了→引き渡し完了。前状態が一致しない操作は409。キャンセル申請は受付中のみ。申請中の準備操作を拒否する。承認時は注文行ロックと商品ID順の在庫ロックで、一度だけ在庫を戻す。却下後の再申請は可能。
- 購入者の履歴非表示はdeleted_atだけを設定し、出店者・運営者・集計・在庫へ影響しない。匿名旧注文は会員へ推測で割り当てない。
- 未認証401、権限不足403、他人の個別注文・庭404、状態競合409。停止会員は既存セッションも無効。退会はアプリ利用終了を保存し注文・庭は残す。退会は削除ボタン押下時に、購入者の未完了注文、出店者の出品中商品・自店舗の未完了注文・未処理キャンセル申請を確認し、ある場合は409で拒否する（[記録](decisions/2026-10-28-buyer-account-use-cases.md)）。
- 出店申請は会員行をロックして重複申請を拒否。承認は申請行・会員行をロックし店舗作成・SELLER付与・結果通知をまとめて保存。確認書類は5MBまでのPDF/PNG/JPEGをDBへ保存し、本人・管理者だけがダウンロードできる。
- 商品公開は店舗別PUBLISHED/HIDDEN/DELETED。運営者のsuspendedは別属性で、出店者の再公開では解除できない。
- カテゴリは商品登録・管理で共通。いずれかの店舗で削除されていない商品が使うカテゴリの削除を拒否し、名称変更は商品にも反映する。削除済み商品だけが参照するカテゴリは`deleted_at`で非表示にする（V13、[記録](decisions/2026-10-28-stock-and-category-deletion.md)）。
- 在庫更新は在庫だけのAPIで、画面表示時点の在庫数と照合する。変わっていれば409で保存せず、画面は最新在庫を再表示する。
- 出店者の店舗選択は会員の所属店舗だけ（運営者は全店舗）。
- 通知は宛先会員IDで取得し、既読日時を保存する。メール配信は追加しない。

## API

| 領域 | API |
|---|---|
| カート・注文 | /api/cart、POST/GET /api/orders、GET/PUT/DELETE /api/orders/{id} |
| 受注 | GET /api/seller/orders?storeId=、GET /api/seller/orders/{id}、PUT /api/seller/orders/{id}/status |
| キャンセル | POST /api/orders/{id}/cancellation、PUT /api/seller/orders/{id}/cancellation |
| 運営者注文 | GET /api/operator/orders |
| 受取連絡先・退会・パスワード | /api/account/pickup-contact、DELETE /api/account、PUT /api/account/password（住所APIは2026-11-05に削除） |
| 店舗 | GET /api/stores/{id}、PUT /api/seller/stores/{id}、/api/operator/stores |
| 出店申請 | /api/account/store-applications、/api/operator/applications、/api/account/store-applications/{id}/document |
| 管理 | /api/operator/members、/api/operator/products、/api/operator/categories |
| 通知 | GET /api/notifications、PUT /api/notifications/{id}/read |

実Cognitoを通常起動の必須条件とする。設定不足やECとの通信失敗を固定所有者へ切り替えない。カスタムログインを維持し、登録・リセットはCognitoの導線を使用する。パスワード変更は確認用パスワードの一致と現在の資格情報を確認し（誤りは400）、[Cognito ChangePassword](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_ChangePassword.html)へ渡す。トークン・パスワードを応答やログへ含めない。

## 移行と管理コマンド

ECのV9で会員・店舗・注文を拡張し、住所・カテゴリ・出店申請・通知を追加する。店舗IDは既存値・型・外部キーを保持してAUTO_INCREMENT化する。この属性変更の間だけ同一接続のFKチェックを一時停止して復元する。V10で商品カテゴリへ外部キーを追加し、並行した登録・削除でも不整合を許さない。起動時seedや在庫補充は追加しない。

事前バックアップ: `%LOCALAPPDATA%/Kusakari/backups/backend-implementation-20261020-113844/`。両DBのSQLダンプ（画像バイナリを含む）と変更前ソース・静的画像を保存済み。

管理コマンドはCanvasのPython仮想環境から `scripts/manage_accounts.py` を実行する。`--env-file`、`--database`、`--admin` が必須で、Git対象外の `--password-file` を付けると、Cognitoにアカウントがないときに作成する。運営（`ADMIN`）の会員を準備するだけで、商品・店舗は変更しない。AWS操作時は既存の `AWS_PROFILE=kusakari-dev` を明示する。招待メールは[AdminCreateUserのSUPPRESS](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminCreateUser.html)で抑止する。

業務コードにテストメールを埋め込まない。

2026-10-20の移行結果（当時の記録）: 有効31件を既存出店者・店舗1へ紐付け、在庫合計605と商品ID/SKU/画像URL/モデルハッシュ/価格を一致照合した。

### 2026-11-12 DBの作り直し後

DBを27テーブルの構成に作り直した（[ER図](database-er.md)、[記録](decisions/2026-11-12-db-v3-application.md)）。上の「注文と権限」「API」「移行と管理コマンド」のうち、次は新しい形に置き換わっている。

- 会員の権限は `USER`/`SELLER`/`ADMIN` ではなく、会員の種別と店舗ごとのロールで決まる（[会員の種別とロールの値](member-roles.md)）。
- 出店申請の承認は、店舗ではなく組織を作る。店舗はオーナーが作成・公開する。
- 商品は1つの店舗に属し、カートは受取店舗を持たない。注文は商品の店舗ごとに1件できる。
- マイグレーションは V1（テーブル）と V2（サンプルデータ）に作り直した。V9・V10 などの記述は当時の記録である。
- 出店承認を取り消すスクリプト（`scripts/revert_store_approval.py`）と、その検証（`e2e/business-store-revert.spec.js`）は削除した。開発用DBを最初の状態に戻すときは `DB-reset.bat`（[手順](database-reset.md)）を使う。

## Alternatives

新規サービス分割、DB共有、モックfallback、localStorageの注文保存、疑似決済は採用しない。既存のカート・モデル生成・庭保存を再利用する。独自フレームワークや将来用途だけの抽象化は追加しない。

## Consequences / 検証

決済は Stripe のテストモードだけを範囲に入れる（実際のお金は動かさない）。配送・精算・外部メール配信・デプロイは対象外。売上画面は実注文の件数・金額とキャンセルを表示し、支払済みを意味しない。

`npm run test:business` は専用MySQL、実Java/FastAPI、実Cognito、Chromiumを使用する。API正常系のモックは使用しない。テスト専用の商品の購入競合とキャンセル承認競合はUIクリックだけでは並列実行を保証できないため実HTTPを同時送信する。パスワード試験は共有3アカウントを変更しない。既存のAWS管理プロファイルで一時Cognitoアカウントを招待メールなしで作成し、変更・再ログイン後に削除する。専用DBの監査記録は無効化して保持する。資格情報を残さないようtrace/HARは無効。失敗スクリーンショットとレポート、成功画面とJSONを `artifacts/business` へ保存する。

`npx playwright test -c e2e/configs/playwright.acceptance.config.js` は通常起動の開発DBに対する明示的な最終確認。既存オリーブを1点だけ購入して注文・庭を保持する。購入記録がある再実行は再購入せず照合だけを行う。`artifacts/acceptance/purchase.json` と `verified.json` を保管する。

通常起動スクリプトは同じcheckoutのサービスを置き換えるため、E2E実行中には実行しない。ECのJAR再作成もサービス停止後に行う。旧認証省略を前提とするE2Eは本フローの証拠に使用しない。各チェックの最終結果は実行レポートを参照する。
