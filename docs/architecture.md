> 2026-10-20の追加実装と移行は [業務バックエンド](business-backend.md) を参照してください。

# 設計判断

## Context

Kusakariは、商品閲覧・選定・注文を中心とする一つのガーデニングECサイトです。Kusakari Canvas（仮称）の3D庭づくり機能は、そのサイト内で商品選びを支援します。現在のEC・3D MVPはローカルで別々に動作しますが、これは開発上の構成であり、利用者向けサービスの分離を意味しません。Java / Spring Boot、JavaScript / React / Vite、MySQLをEC側で使用し、材料コードによる商品候補連携を定義します。

## Decision

### 技術識別子と保存データの境界

- プロジェクトルートとnpm package名は `kusakari-ec`、Web workspaceは `@kusakari-ec/frontend`、Java基底packageは `jp.kusakari.ec`、API artifactは `kusakari-ec-api` とします。
- ECの設定環境変数は `KUSAKARI_EC_` を接頭辞にします。画面上のブランド名 `Kusakari` は変更しません。
- 既存のMySQL schema `kusakari` / `kusakari_e2e`、MySQLユーザー `kusakari`、Docker volume `kusakari-mysql`、`%LOCALAPPDATA%\Kusakari` の保存領域は既存データと設定を維持するため変更しません。コード上の識別子変更と永続データの移設を分けます。

### 製品境界と公開入口

- 利用者向けのサービスはKusakari EC一つです。3D庭づくり機能はKusakari Canvas（仮称）として商品選びを支援します。
- 公開環境のCloudFront DistributionはKusakari全体で一つとします。単一CloudFrontは、内部APIやDBを一つに統合する決定ではありません。APIのパス・オリジン構成は統合実装前に別途定めます。
- EC側は商品、価格、在庫、カート、注文を管理します。Canvas側の庭データ・写真・配置情報から、商品候補照合用の `materialCode / quantity / unit` を渡します。Three.jsランタイムオブジェクトやクライアント指定価格は渡しません。
- 現在のローカルMVPはECと3Dでコード・ポート・DBを分けています。統合が完了するまではこの開発分離と利用者向けサービス境界を区別して記述します。
- 利用者認証はCognitoとSpring Securityを用います。`cognito` profileの連携コードと利用者別の庭データ分離を追加しました。実User Poolとテストアカウントを使用します。[認証の設計と検証範囲](cognito-auth.md)を参照してください。通常起動で認証を省略しません。

### データの正本と責務

- 商品、店舗別在庫、カート、注文はMySQLを正本とします。
- Javaは機能単位の `catalog` / `commerce` と横断的な `common` に分け、その中で `controller` / `service` / `persistence` / `dto` / `mapper` を分離します。
- ControllerはHTTP入力と応答のみを担当し、Serviceが業務処理、Spring Data JPA Repositoryが永続化を担当します。
- HTTP DTO、JPA Entity、API応答を分離します。MapStructは単純なDTO変換に使い、注文確定などの業務判断はServiceに残します。
- LombokはEntityの定型アクセサとJPA用コンストラクターに限定して使います。可変Entityに `@Data` を付けず、意図しないequals/hashCode/toStringを生成しません。
- Flywayをスキーマ変更の正本として維持し、Hibernateは `ddl-auto=validate` でEntityとDBの不一致を起動時に検出します。既存テーブル構造とデータをJPA導入のために作り直しません。
- Reactのコンポーネントは画面、`useShop.js` は処理の順序、`api.js` はHTTP、`types.js` は契約の説明を担当します。
- スタイルはページ部位とレスポンシブ規則で分割し、Javaを含めたPrettier設定を共有します。

### カートと注文

- Cognitoで本人確認後にHttpOnlyセッションを発行します。カート・注文は会員ID、庭はECが確認した会員IDを所有者として分離します。
- カート変更はrevision一致を必須とし、カート行を `FOR UPDATE` でロックします。他タブからの更新を409で通知します。
- 注文要求には、確認した合計金額・カートrevision・UUIDの冪等キーを含めます。
- 注文時はカート行、商品IDの昇順で店舗在庫行をロックします。READ COMMITTED下で最新在庫と金額を再検証します。
- 在庫減算・商品名/単価/SKUの注文明細スナップショット・注文保存・カート消去は1トランザクションです。
- 同じカートと冪等キーによる再送は同じ注文を返します。同じキーでrevision/金額を変更すると409です。
- 元商品の価格を変えても、保存済み注文の単価は変わりません。在庫不足はカートを残して409を返します。
- UIは確定応答が届かない場合の再試行で同じキーを使用します。サーバー再起動後も冪等性情報がDBに残ります。

### Canvasとの商品対応付けと外部商品データ

- 連携単位は `materialCode / quantity / unit` のJSONです。Three.jsオブジェクトやCanvas試作のDBには依存しません。
- `material_products` の明示マッピングで候補を出します。未対応コードは `UNMAPPED` と返し、推測による置換をしません。
- 複数候補からの選択は人が行います。数量は現在 `piece` の整数のみで、m²やmの自動換算は行いません。
- 商品には出所 `source`、外部ID用 `source_product_id`、データ更新日時を保持します。元の出所情報は移行で上書きしません。
- 外部APIや商品フィードは、提供元・利用条件・認証情報が決まった段階で追加します。現時点で利用可能と確認した実商品連携はありません。
- 外部連携時は取得バッチから正規化したカタログへ保存し、画面は同じAPI契約を利用する方針です。未使用のProvider抽象クラスは追加していません。

### ローカル運用

- Web 5186 / API 8086、E2E 15186 / 18086を固定します。既存ポートの自動横取りは行いません。
- MySQLインスタンスは既存のものを共用し、専用DBとユーザー権限を使います。
- DBスキーマ・初期データはFlywayのバージョン付きマイグレーションで管理します。
- 起動・停止はこの作業フォルダのJAR/Viteスクリプトを含むコマンドとPID・作成時刻を照合します。記録ファイルのPIDだけを信用しません。WindowsのJavaランチャーを避け、`java.home` 内のJVMを直接起動します。
- `start.bat`は既存の自プロセスを停止して固定ポートで再作成します。他プロセスとの競合はエラーとし、ポートを増やしません。
- SysOverRayはKusakari専用のWPFプロセスです。API/Webの応答と、実際に見える操作画面を別々に確認します。起動スクリプトは可視・非最小化・最前面属性・UI Automationの操作ボタンを照合します。

### 永続化

- Spring Data JPAを採用し、各機能の `persistence/entity` と `persistence/repository` にEntityとRepositoryを置きます。
- 注文確定時のロック順、在庫の悲観ロック、冪等性確認、READ COMMITTED、更新範囲はServiceのトランザクション内で明示します。Repositoryのメソッド名だけでは表現できないロック条件は `@Query` と `@Lock` に残します。
- Lombokは短縮効果が高いボイラープレートに限定し、注文・在庫処理などの状態遷移は明示的なメソッドで表します。

## Alternatives

- Spring JDBC: SQLとロック範囲を直接追いやすい一方、行マッピングやCRUDの定型処理が重複するため今回は採用しません。必要なロック条件はJPA Repositoryのクエリとして明示します。
- Cognito / Spring Securityによる認証・認可と利用者ごとの庭データ分離を実装済みです。公開配備は別作業です。
- localStorageカート: サーバー側の整合性と再起動後の注文確認を優先し、MySQLへ保存します。
- 実決済の導入: 決済提供元・店舗契約が指定されていないため、店舗受取の注文保存に限定します。
- Canvasから直接注文: 設計データと購入同意を分けるため、候補提示→人による選択→ECの確認画面の順にします。
- 固定ポートの競合時に別プロジェクトのプロセスを強制終了する方法: 所有を誤認する危険があるため採用せず、起動を止めて競合PIDを報告します。

## Consequences

- ローカルECの購入フローと将来の材料対応付けを独立して検証できます。
- Javaの配置は機能と層で追えます。JPAが定型的な行マッピングを担い、EntityとDBのずれはHibernateの起動時検証で検出します。
- JPA導入時点ではFlywayスキーマや既存データの移行は行いません。起動時の `validate` が通ることを移行完了条件とします。
- 在庫予約は注文時だけです。カートに入れた時点では在庫確保されません。
- 会員・店舗・注文・審査・通知・管理画面は [業務バックエンド](business-backend.md) を参照してください。キャンセル承認は在庫を戻します。実決済・返金・配送・精算・公開配備は対象外です。
- Cookieを失うと同じカートへ戻れません。公開環境では会員や安全なゲスト注文参照への移行が必要です。
- 起動済みのKusakariを再実行すると一時的に接続が切れます。注文データはMySQLに残ります。

## 検証方針

実画面・実API・MySQLを使うE2Eを主検証とします。正常系はAPIをモックしません。
同時注文・冪等キー再送・価格改ざん・別セッション分離は、UIのタイミングだけでは再現を制御しにくいため、実APIへの並列要求と専用DBの行数/在庫を確認します。これは実装追認のユニットテストではありません。
通信失敗だけはPlaywrightによる接続遮断を明示した障害注入として使用します。
E2Eは専用DB名を検査し、テストで購入した数量だけを補充します。同時注文用の一意なテスト商品とその注文だけを削除し、通常の開発データには触れません。
