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
- 未認証401、権限不足403、他人の個別注文・庭404、状態競合409。停止会員は既存セッションも無効。退会はアプリ利用終了を保存し注文・庭は残す。
- 出店申請は会員行をロックして重複申請を拒否。承認は申請行・会員行をロックし店舗作成・SELLER付与・結果通知をまとめて保存。確認書類は5MBまでのPDF/PNG/JPEGをDBへ保存し、本人・管理者だけがダウンロードできる。
- 商品公開は店舗別PUBLISHED/HIDDEN/DELETED。運営者のsuspendedは別属性で、出店者の再公開では解除できない。
- カテゴリは商品登録・管理で共通。使用中カテゴリの削除を拒否し、名称変更は商品にも反映する。
- 通知は宛先会員IDで取得し、既読日時を保存する。メール配信は追加しない。

## API

| 領域 | API |
|---|---|
| カート・注文 | /api/cart、POST/GET /api/orders、GET/PUT/DELETE /api/orders/{id} |
| 受注 | GET /api/seller/orders?storeId=、GET /api/seller/orders/{id}、PUT /api/seller/orders/{id}/status |
| キャンセル | POST /api/orders/{id}/cancellation、PUT /api/seller/orders/{id}/cancellation |
| 運営者注文 | GET /api/operator/orders |
| 住所・退会・パスワード | /api/account/address、DELETE /api/account、PUT /api/account/password |
| 店舗 | GET /api/stores/{id}、PUT /api/seller/stores/{id}、/api/operator/stores |
| 出店申請 | /api/account/store-applications、/api/operator/applications、/api/account/store-applications/{id}/document |
| 管理 | /api/operator/members、/api/operator/products、/api/operator/categories |
| 通知 | GET /api/notifications、PUT /api/notifications/{id}/read |

実Cognitoを通常起動の必須条件とする。設定不足やECとの通信失敗を固定所有者へ切り替えない。カスタムログインを維持し、登録・リセットはCognitoの導線を使用する。パスワード変更は現在の資格情報を再確認し、[Cognito ChangePassword](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_ChangePassword.html)へ渡す。トークン・パスワードを応答やログへ含めない。

## 移行と管理コマンド

ECのV9で会員・店舗・注文を拡張し、住所・カテゴリ・出店申請・通知を追加する。店舗IDは既存値・型・外部キーを保持してAUTO_INCREMENT化する。この属性変更の間だけ同一接続のFKチェックを一時停止して復元する。V10で商品カテゴリへ外部キーを追加し、並行した登録・削除でも不整合を許さない。起動時seedや在庫補充は追加しない。

事前バックアップ: `%LOCALAPPDATA%/Kusakari/backups/backend-implementation-20261020-113844/`。両DBのSQLダンプ（画像バイナリを含む）と変更前ソース・静的画像を保存済み。

管理コマンドはCanvasのPython仮想環境から `scripts/manage_accounts.py` を実行する。`--env-file`、`--database`、`--seller`、`--store`、`--expected-count`、`--manifest`が必須。既定は確認のみ。`--apply`で紐付け、`--admin`とGit対象外の`--password-file`で管理者を準備する。AWS操作時は既存の `AWS_PROFILE=kusakari-dev` を明示する。招待メールは[AdminCreateUserのSUPPRESS](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminCreateUser.html)で抑止する。

業務コードにテストメールを埋め込まない。既存の出店者ID・店舗を確認し、有効かつ所有者未設定の商品だけを紐付ける。商品ID/SKU/価格/画像URL/モデルハッシュ/在庫をmanifestへ出力する。再実行時に所有済み商品の公開状態や在庫を変更しない。

今回の移行結果: 有効31件を既存出店者・店舗1へ紐付け、在庫合計605と商品ID/SKU/画像URL/モデルハッシュ/価格を一致照合した。非有効15件、他店舗の在庫、既存庭、匿名旧注文を変更しない。
### 出店承認の取り消し（検証用）

`scripts/revert_store_approval.py` は、出店申請の承認で SELLER になった会員を USER に戻し、承認で作られた店舗・承認済み申請・申請受付/承認通知と、その会員が出店後に登録した商品（在庫・画像・素材紐付け・アップロード画像）を削除する。CanvasのPython仮想環境から実行し、`--env-file`・`--database`・`--canvas-env-file`・`--canvas-database`・`--member`が必須。既定は確認のみで、`--apply`には削除行を書き出す`--backup`（新規ファイル、Git対象外の`artifacts/`などに置く）が必要。

他の会員・注文・カート・庭の買い物リスト・Canvasの配置/画像履歴が店舗や商品を参照している場合は、何も変更せず終了コード2で理由を表示する。他利用者のデータを消して整合させることはしない。取り消し後は申請前と同じく再申請できる。検証は `e2e/business-store-revert.spec.js`。

**1. 確認だけ（何も変わりません）**

```powershell
& ..\kusakari-canvas\backend\.venv\Scripts\python.exe scripts\revert_store_approval.py --env-file .env --database kusakari --canvas-env-file ..\kusakari-canvas\.env --canvas-database kusakari_canvas --member <テスト利用者のメール>
```

**2. 実際に戻す**

```powershell
& ..\kusakari-canvas\backend\.venv\Scripts\python.exe scripts\revert_store_approval.py --env-file .env --database kusakari --canvas-env-file ..\kusakari-canvas\.env --canvas-database kusakari_canvas --member <テスト利用者のメール> --apply --backup artifacts\store-revert-backup.json
```

出力に `"applied": true` が出れば完了です。ブラウザを再読み込みすると、ロールがUSERに戻り、出店申請フォームが再び表示されます。

**うまくいかないとき**

- **`blockers` に理由が出て止まった場合**：何も変更されていません。たとえば `carts use the store` と出たら、そのカートの受け取り店舗を別の店舗に変えてから、もう一度実行してください。
- **バックアップファイルがすでにあると言われた場合**：上書きはしない作りなので、`--backup` に別のファイル名を指定してください。
- **元に戻したくなった場合**：削除した行はすべてバックアップのJSONに残っているので、そこから復元できます。

## Alternatives

新規サービス分割、DB共有、モックfallback、localStorageの注文保存、疑似決済は採用しない。既存のカート・モデル生成・庭保存を再利用する。独自フレームワークや将来用途だけの抽象化は追加しない。

## Consequences / 検証

実決済・配送・精算・外部メール配信・デプロイは対象外。売上画面は実注文の件数・金額とキャンセルを表示し、支払済みを意味しない。

`npm run test:business` は専用MySQL、実Java/FastAPI、実Cognito、Chromiumを使用する。API正常系のモックは使用しない。テスト専用の商品の購入競合とキャンセル承認競合はUIクリックだけでは並列実行を保証できないため実HTTPを同時送信する。パスワード試験は共有3アカウントを変更しない。既存のAWS管理プロファイルで一時Cognitoアカウントを招待メールなしで作成し、変更・再ログイン後に削除する。専用DBの監査記録は無効化して保持する。資格情報を残さないようtrace/HARは無効。失敗スクリーンショットとレポート、成功画面とJSONを `artifacts/business` へ保存する。

`npx playwright test -c playwright.acceptance.config.js` は通常起動の開発DBに対する明示的な最終確認。既存オリーブを1点だけ購入して注文・庭を保持する。購入記録がある再実行は再購入せず照合だけを行う。`artifacts/acceptance/purchase.json` と `verified.json` を保管する。

通常起動スクリプトは同じcheckoutのサービスを置き換えるため、E2E実行中には実行しない。ECのJAR再作成もサービス停止後に行う。旧認証省略を前提とするE2Eは本フローの証拠に使用しない。各チェックの最終結果は実行レポートを参照する。
