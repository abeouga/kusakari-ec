# 設計判断

## Context

Kusakariは、商品閲覧・選定・注文を中心とする一つのガーデニングECサイトです。Kusakari Canvas（仮称）の3D庭づくり機能は、そのサイト内で商品選びを支援します。現在のEC・3D MVPはローカルで別々に動作しますが、これは開発上の構成であり、利用者向けサービスの分離を意味しません。EC側はJava / Spring Boot、JavaScript / React / Vite、MySQLを使い、Canvas側は既存のFastAPI / SQLAlchemy / Alembicを使います。両者は材料コードによる商品候補連携と、商品・カートのHTTP APIでつながります。

## Decision

### 技術識別子と保存データの境界

- プロジェクトルートとnpm package名は `kusakari-ec`、Web workspaceは `@kusakari-ec/frontend`、Java基底packageは `jp.kusakari.ec`、API artifactは `kusakari-ec-api` とします。
- ECの設定環境変数は `KUSAKARI_EC_` を接頭辞にします。画面上のブランド名 `Kusakari` は変更しません。
- 既存のMySQL schema `kusakari` / `kusakari_e2e`、MySQLユーザー `kusakari`、Docker volume `kusakari-mysql`、`%LOCALAPPDATA%\Kusakari` の保存領域は既存データと設定を維持するため変更しません。コード上の識別子変更と永続データの移設を分けます。

### 製品境界と公開入口

- 利用者向けのサービスはKusakari EC一つです。3D庭づくり機能はKusakari Canvas（仮称）として商品選びを支援します。
- 公開環境のCloudFront DistributionはKusakari全体で一つとします。単一CloudFrontは、内部APIやDBを一つに統合する決定ではありません。配備の構成は [deploy/README.md](../deploy/README.md) にあります。
- 価格・在庫・カート・注文の正本はEC、庭・配置・写真・画像生成履歴の正本はCanvasです。相互連携はHTTPのみで、DB相互参照・分散トランザクションは使用しません。
- Canvas側の庭データ・写真・配置情報から、商品候補照合用の `materialCode / quantity / unit` を渡します。Three.jsランタイムオブジェクトやクライアント指定価格は渡しません。
- 現在のローカルMVPはECと3Dでコード・ポート・DBを分けています。統合が完了するまではこの開発分離と利用者向けサービス境界を区別して記述します。
- 利用者認証は実Cognitoとカスタムログイン画面、Spring Securityを用い、通常起動の必須条件とします。設定不足やECとの通信失敗を、認証の省略や固定所有者への切り替えで回避しません。詳細は [認証の設計](cognito-auth.md) にあります。

### データの正本と責務

- 商品、在庫、カート、注文、会員、組織・店舗、出店申請、通知、決済はMySQLを正本とします。テーブルの構成は [DB の ER 図](database-er.md) と [DB 構成（v3）の決定](decisions/2026-11-11-db-v3.md) にあります。
- Javaは機能単位の `auth` / `member` / `store` / `catalog` / `commerce` / `payment` / `moderation` / `notification` / `shopping` と横断的な `common` に分けます。多くの機能はその中で `controller` / `service` / `persistence`（`entity` / `repository`）/ `dto` / `mapper` を分離します。`auth` と `shopping` はクラスが少ないため、層のサブパッケージを持ちません。
- ControllerはHTTP入力と応答のみを担当し、Serviceが業務処理とトランザクション、Spring Data JPA Repositoryが永続化を担当します。汎用基底Serviceは作りません。
- HTTP DTO、JPA Entity、API応答を分離し、Entityを応答にしません。MapStructは単純なDTO変換に使い、注文確定などの業務判断はServiceに残します。
- Lombokはコンストラクタ注入、Entityの定型アクセサとJPA用コンストラクターに使います。可変Entityに `@Data` を付けず、意図しないequals/hashCode/toStringを生成しません（`@Data` は不変の値や複合キーのクラスだけに使います）。注文状態の変更・会員の退会などの状態遷移は明示したEntityメソッドで表します。
- Flywayをスキーマ変更の正本とし（今のマイグレーションは V1〜V3）、Hibernateは `ddl-auto=validate` でEntityとDBの不一致を起動時に検出します。
- Reactのコンポーネントは画面、`useShop.js` は処理の順序、`api.js` はHTTP、`types.js` は契約の説明を担当します。
- スタイルはページ部位とレスポンシブ規則で分割し、Javaを含めたPrettier設定を共有します。

### 会員と権限

- 会員の種別と店舗ごとのロールで権限を決めます（[会員の種別とロールの値](member-roles.md)）。カート・注文・庭の買い物リストは購入者（`USER`）と運営（`ADMIN`）だけが使えます。
- 未認証は401、権限不足は403、他人の個別注文・庭は404、状態の競合は409です。停止された会員は既存のセッションも無効になります（`SessionValidityFilter`）。
- 退会は会員を無効化（`enabled=false`、`withdrawn_at`）し、注文・庭の記録は残します。退会の可否は削除ボタンを押したときにサーバーで判定し、未完了の注文などがあれば409で拒否します（[購入者・アカウント機能の決定](decisions/2026-10-28-buyer-account-use-cases.md)）。
- 出店申請は会員行をロックして重複申請を拒否します。承認は申請行・会員行をロックし、組織の作成・`SHOP_OWNER` への変更・結果通知をまとめて保存します。店舗は承認の後にオーナーが作成・公開します。確認書類は5MBまでのPDF/PNG/JPEGをDBへ保存し、本人と運営だけがダウンロードできます。
- パスワード変更は確認用パスワードの一致と現在の資格情報を確認し（誤りは400）、[Cognito ChangePassword](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_ChangePassword.html)へ渡します。トークン・パスワードを応答やログへ含めません。

### 商品と在庫

- 商品は1つの店舗に属し、在庫と公開状態（`PUBLISHED` / `HIDDEN` / `DELETED`）は商品ごとに1行です。運営による停止（`products.suspended`）は別の属性で、出店者の再公開では解除できません（[警告と停止の決定](decisions/2026-11-12-moderation-warnings.md)）。
- 在庫の更新は在庫だけのAPIで、画面表示時点の在庫数と照合します。変わっていれば409で保存せず、画面は最新の在庫を再表示します。カテゴリは商品登録・管理で共通で、使用中のカテゴリの削除を拒否します（[在庫とカテゴリ削除の決定](decisions/2026-10-28-stock-and-category-deletion.md)）。
- 出店者の店舗の選択肢は、会員が操作できる店舗だけです（運営は全店舗）。

### カートと注文

- カートはログインした会員ごとに1つです（[ログイン必須のカート](decisions/2026-11-09-login-required-cart.md)）。カート変更はrevision一致を必須とし、カート行を `FOR UPDATE` でロックします。他タブからの更新を409で通知します。
- 店舗受け取りのみです。受取店舗は商品の店舗で、購入者は選びません。受取連絡先は氏名・電話・連絡先メールだけを受け付け、配送先・配送日時は受け付けません（[店舗受け取りの決定](decisions/2026-10-23-store-pickup.md)）。支払方法はカード（Stripe のテストモード）か店頭払いです（[カード決済の決定](decisions/2026-11-13-stripe-card-payment.md)）。
- 注文要求には、確認した合計金額・カートrevision・UUIDの冪等キー・支払方法を含めます。
- 注文時はカート行をロックし、続いて店舗（ID順）、その組織、商品、在庫（商品ID順）の順にロックします。READ COMMITTED下で公開・停止・在庫・金額を再確認します。
- 在庫減算・商品名/単価/SKUの注文明細スナップショット・注文保存・カート消去・宛先通知は1トランザクションです。注文は商品の店舗ごとに1件できます。
- 同じカートと冪等キーによる再送は同じ注文を返します。同じキーでrevision/金額/支払方法を変更すると409です。
- 元商品の価格を変えても、保存済み注文の単価は変わりません。在庫不足はカートを残して409を返します。
- UIは確定応答が届かない場合の再試行で同じキーを使用します。サーバー再起動後も冪等性情報がDBに残ります。
- 注文は注文受付→受取準備完了→引き渡し完了と進み、前の状態が一致しない操作は409です。キャンセル申請は受付中のみで、申請中の準備操作を拒否します。承認時は注文行のロックと商品ID順の在庫ロックで、一度だけ在庫を戻します。却下後の再申請はできます。
- 購入者による履歴の非表示は `deleted_at` だけを設定し、出店者・運営者・集計・在庫へ影響しません。
- 注文ごとに販売手数料（注文時の率と額）を保存し、注文実績の画面に表示します。請求・精算はしません（[手数料の決定](decisions/2026-11-13-commission-and-closed-store-sales.md)）。
- 通知は宛先会員IDで取得し、既読日時を保存します。メール配信はしません。

API の一覧と応答の形は [API 契約](api.md) にあります。

### Canvasとの商品対応付けと外部商品データ

- 連携単位は `materialCode / quantity / unit` のJSONです。Three.jsオブジェクトやCanvas試作のDBには依存しません。
- `material_products` の明示マッピングで候補を出します。未対応コードは `UNMAPPED` と返し、推測による置換をしません。
- 複数候補からの選択は人が行います。数量は現在 `piece` の整数のみで、m²やmの自動換算は行いません。
- Canvasは既存の庭の productId・modelComposition・座標の保存機能を使います。EC商品詳細・カートから productId を渡し、庭を選んだ後にモデルを選択します。利用者の配置操作なしにオブジェクトを増やしません。庭の買い物リストとECのカートは独立しています（[庭の買い物リスト](garden-shopping-lists.md)）。
- 商品には出所 `source`、外部ID用 `source_product_id`、データ更新日時 `source_updated_at` を保持します。
- 外部APIや商品フィードは、提供元・利用条件・認証情報が決まった段階で追加します。現時点で利用可能と確認した実商品連携はありません。
- 外部連携時は取得バッチから正規化したカタログへ保存し、画面は同じAPI契約を利用する方針です。未使用のProvider抽象クラスは追加していません。

### ローカル運用

- Web 5186 / API 8086 を固定します。E2E は既定の設定が 15186 / 18086、業務 E2E（認証つき）が 15286 / 18286 です。既存ポートの自動横取りは行いません。
- MySQLインスタンスは既存のものを共用し、専用DBとユーザー権限を使います。
- DBスキーマ・初期データはFlywayのバージョン付きマイグレーションで管理します。起動時のseedや在庫補充はしません。開発用DBを最初の状態に戻すときは `DB-reset.bat`（[手順](database-reset.md)）を使います。
- 起動・停止はこの作業フォルダのJAR/Viteスクリプトを含むコマンドとPID・作成時刻を照合します。記録ファイルのPIDだけを信用しません。WindowsのJavaランチャーを避け、`java.home` 内のJVMを直接起動します。
- `start.bat`は既存の自プロセスを停止して固定ポートで再作成します。他プロセスとの競合はエラーとし、ポートを増やしません。
- SysOverRayはKusakari専用のWPFプロセスです。API/Webの応答と、実際に見える操作画面を別々に確認します。起動スクリプトは可視・非最小化・最前面属性・UI Automationの操作ボタンを照合します。
- 運営（`ADMIN`）の会員を準備する管理コマンドは、CanvasのPython仮想環境から `scripts/manage_accounts.py` を実行します。`--env-file`、`--database`、`--admin` が必須で、Git対象外の `--password-file` を付けると、Cognitoにアカウントがないときに作成します。商品・店舗は変更しません。AWS操作時は `AWS_PROFILE=kusakari-dev` を明示します。招待メールは[AdminCreateUserのSUPPRESS](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminCreateUser.html)で抑止します。業務コードにテストメールを埋め込みません。

### 永続化

- Spring Data JPAを採用し、各機能の `persistence/entity` と `persistence/repository` にEntityとRepositoryを置きます。
- 注文確定時のロック順、在庫の悲観ロック、冪等性確認、READ COMMITTED、更新範囲はServiceのトランザクション内で明示します。Repositoryのメソッド名だけでは表現できないロック条件は `@Query` と `@Lock` に残します。

## Alternatives

- Spring JDBC: SQLとロック範囲を直接追いやすい一方、行マッピングやCRUDの定型処理が重複するため採用しません。必要なロック条件はJPA Repositoryのクエリとして明示します。
- 新規サービスへの分割、ECとCanvasのDB共有、モックへのfallback、独自フレームワークや将来用途だけの抽象化は採用しません。
- localStorageのカート・注文保存: サーバー側の整合性と再起動後の注文確認を優先し、MySQLへ保存します。
- 実決済の導入: 実際のお金を動かす決済は扱いません。決済は Stripe のテストモードだけを範囲に入れます（[残りの決定](decisions/2026-11-12-remaining-decisions.md)）。
- Canvasから直接注文: 設計データと購入同意を分けるため、候補提示→人による選択→ECの確認画面の順にします。
- 固定ポートの競合時に別プロジェクトのプロセスを強制終了する方法: 所有を誤認する危険があるため採用せず、起動を止めて競合PIDを報告します。

## Consequences

- ローカルECの購入フローと将来の材料対応付けを独立して検証できます。
- Javaの配置は機能と層で追えます。JPAが定型的な行マッピングを担い、EntityとDBのずれはHibernateの起動時検証で検出します。
- 在庫予約は注文時だけです。カートに入れた時点では在庫確保されません。
- 決済と返金は Stripe のテストモードだけを範囲に入れ、実際のお金は動かしません。配送・精算・外部メール配信は対象外です。
- 起動済みのKusakariを再実行すると一時的に接続が切れます。注文データはMySQLに残ります。

## 検証方針

- 実画面・実API・MySQLを使うE2Eを主検証とします。正常系はAPIをモックしません。通信失敗だけはPlaywrightによる接続遮断を明示した障害注入として使用します。
- 同時注文・キャンセル承認の競合・冪等キー再送・価格改ざん・別セッション分離は、UIのタイミングだけでは再現を制御しにくいため、実APIへの並列要求と専用DBの行数/在庫を確認します。これは実装追認のユニットテストではありません。
- E2Eは専用DB名を検査し、テストで購入した数量だけを補充します。同時注文用の一意なテスト商品とその注文だけを削除し、通常の開発データには触れません。
- `npm run test:business` は専用MySQL、実Java/FastAPI、実Cognito、Chromiumを使用します。パスワード変更の試験は共有のテスト用アカウントを変更せず、AWS管理プロファイルで一時Cognitoアカウントを招待メールなしで作成し、変更・再ログイン後に削除します。資格情報を残さないよう trace/HAR は無効です。失敗スクリーンショットとレポート、成功画面とJSONを `artifacts/business` へ保存します。
- `npx playwright test -c e2e/configs/playwright.acceptance.config.js` は通常起動の開発DBに対する明示的な最終確認です。店舗1のオリーブを1点だけ購入して注文・庭を保持します。購入記録がある再実行は再購入せず照合だけを行い、`artifacts/acceptance/purchase.json` と `verified.json` を保管します。
- 通常起動スクリプトは同じcheckoutのサービスを置き換えるため、E2E実行中には実行しません。ECのJAR再作成もサービス停止後に行います。
