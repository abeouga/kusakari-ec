# Kusakari — 植物と、暮らす。

Java / Spring Boot + JavaScript / React / Vite + MySQL で動く、ガーデニングECサイトのローカルMVPです。Kusakari Canvas（仮称）の3D庭づくり機能は、商品選びを支援する同じサイト内の機能として扱います。

現在、ECと3D庭づくり機能の試作コード・開発ポート・DBは別々です。Canvasの配置数量をECの商品候補画面へ渡し、利用者が選んだ商品を既存カートへ追加できます。この技術上の試作分割は、利用者向けサービスを分ける方針ではありません。

## 開く

- **画面:** http://127.0.0.1:5186
- **API:** http://127.0.0.1:8086/api/health
- **作業先:** ソースを配置したフォルダー
- **起動:** `start.bat` をダブルクリック
- **停止:** `stop.bat` をダブルクリック

初回は `setup.bat` で接続設定と依存を準備します。`start.bat` はブラウザーとKusakari専用のSysOverRay操作画面を開き、画面の表示と操作ボタンまで確認します。ブラウザーを自動で開かない場合は `start.bat -NoBrowser` を実行します。
再実行時は、この作業フォルダから起動したWeb/APIを停止してから同じ5186/8086で作り直します。別のプロセスが固定ポートを使っている場合は停止せず、エラーにします。代替ポートへ移動しません。
Javaや依存を更新した場合は、停止 → ビルド → 起動の順に実行します。

## できること

- オリーブ、ラベンダー、ローズマリー、モンステラの4商品。サイズ、育て方を掲載(育て方はこっちサポートしきれないから出品者が書くブログ機能的なやつとしてなら実装できそう？)
- カテゴリー・商品名・品番検索、価格順ソート、在庫あり絞り込み。
- 3つの架空店舗の在庫確認、受取店舗変更。東京駅・横浜駅・大宮駅または許可された現在地から距離順に表示。
- カートへの追加、数量変更、削除、税込合計。カートはMySQLへ保存され、再読み込みで復元。
- `/cart` でカート・受取情報・デモ注文確認を独立画面で表示。URLを直接開いても利用できます。
- 注文確認 → デモ注文確定 → 注文履歴。金額・在庫をサーバーで再確認。
- 材料コードのJSONから商品候補・購入個数・必要金額を取得し、選んだ候補をカートへ追加。
- PC・スマートフォン対応、キーボードでのダイアログ操作、通信失敗時の再試行。

**デモの範囲:** 商品・価格・店舗・在庫はデモ用です。実決済・配送・実店舗での取り置きは行いません。

商品一覧は日照・用途・手入れレベル・生産者・価格で絞り込めます。商品詳細には追加画像と生育スペックを表示します。
画面下部の「商品管理」から商品と店舗在庫を登録・編集・削除できます。
カートでは数量と受取・配送情報を保存し、デモ注文を確定できます。「注文履歴」では受取情報の編集と履歴からの削除ができます。
商品削除は販売終了、履歴削除は非表示です。注文取消や在庫の復元は行いません。
DB拡張と保存項目は [画面案のCRUD実装](docs/mockup-crud.md) に記載しています。
注文によるデモ在庫の減算と注文履歴の永続化は実装しています。外部EC APIは未接続です。
Canvasから商品候補の取得へ接続しています。候補選択後にカートへ追加します。連携項目と現在のAPI契約は [docs/api.md](docs/api.md) に記載しています。

## 構成

| 対象 | 技術 / 役割 | 開発ポート |
|---|---|---|
| frontend | JavaScript / React 19 / Vite 8 | 5186 |
| backend | Spring Boot 3.5.16 / Java 21 target / JDBC / Flyway | 8086 |
| database | MySQL 8、開発DB `kusakari` | 3306（既存サーバーを共用） |
| E2E | Playwright Chromium / DB `kusakari_e2e` | 15186 / 18086 |

フロントの実装は `.js` / `.jsx` です。JSDoc + TypeScriptの `checkJs` で型を確認します。
MySQLサーバーそのものは既存のものを使い、EC試作用DBと権限を分離しています。ローカル試作の3Dデータベースとは直接共有せず、商品連携は合意したAPI契約を通します。

```text
frontend/src/
  components/       商品・カート・店舗・材料リストの画面
  css/              部位別・画面幅別のスタイル
  api.js            HTTP通信
  types.js          APIの型説明（JSDoc）
  useShop.js         状態更新と処理の順序
backend/src/main/
  java/jp/kusakari/
    catalog/        商品・店舗・材料コード
    commerce/       カート・注文・在庫トランザクション
    common/         Cookie、接続元確認、エラー応答
  resources/db/migration/  Flywayスキーマと初期商品
e2e/                実画面・実API・MySQL検証
scripts/            起動、停止、セットアップ
sysover-ray2/       専用のWPF操作画面と起動スクリプト
docs/               設計判断、API、画像プロンプト、検証記録
```

## 別環境でのセットアップ

Windows 10/11 x64のWindows PowerShell 5.1で `setup.bat` を実行します。`127.0.0.1:3306` のMySQLがあれば自動使用し、rootパスワードが`password`と異なる場合だけ非表示入力します。MySQLがなければKusakari専用MySQLを`3307`で自動準備します。`.env` の手動作成は不要です。
アプリ用ユーザー・DBポート・アプリ用パスワード（`password`）は自動設定します。
不足するNode.js LTS、JDK 21、.NET 10 SDKをユーザー領域に取得し、依存・API・Web・SysOverRayをビルドします。
開発/E2E DBに対する認証・Flyway・実API起動が成功したら `start.bat` で起動します。

通常の再実行は保存済み資格情報を使用します。設定を作り直す場合だけ `setup.bat -Reconfigure` を使います。
パスワードは非表示入力で、既存MySQLの管理者パスワードは保存しません。
既存データは削除しません。`kusakari@localhost` はローカルデモ用アカウントとしてパスワードを`password`へ揃えます。
別PCへ `.env`、`.runtime`、DBデータをコピーせず、そのPCでセットアップしてください。
手順と制約は [docs/windows-setup.md](docs/windows-setup.md) を参照してください。

### 既存MySQLを使う別PC向け

MySQL ServerをそのPCへインストール済みで、rootパスワードを `password` に設定している場合は、`script-for-mysql\setup.bat` を実行します。MySQLサービスが停止していれば自動起動し、TCP 3306の `kusakari` / `kusakari_e2e` DB、アプリユーザー、Flywayスキーマを準備します。rootパスワードは保存しません。

セットアップ後の起動は `script-for-mysql\start.bat` を実行します。この起動スクリプトは設定とMySQLの稼働を確認し、必要な場合だけ既存MySQL向けセットアップを再実行してからAPIとWebを起動します。ブラウザーとSysOverRayを開かない場合は `script-for-mysql\start.bat -NoBrowser -NoOverlay` を使います。

通常の`setup.bat` / `start.bat`と混同しないようにまとめて実行する場合は、`script-for-mysql\setup.bat`、続いて`script-for-mysql\start.bat`を使用します。このフォルダーはプロジェクト内であれば移動できます。

## Dockerで起動する場合

Docker Desktopを起動した状態で、プロジェクトのルートから次を実行します。ホスト側のMySQLや他プロジェクトのDBは使用しません。

```powershell
docker compose up --build
```

ブラウザーで http://localhost:5186 を開きます。APIは http://localhost:8086/api/health、Docker内MySQLのホスト公開ポートは 13306 です。MySQLのデータは `kusakari-mysql` ボリュームに保存されます。

停止する場合は次を実行します。

```powershell
docker compose down
```

データを削除して初期化し直す場合だけ、次を実行します。既存の注文・カート・DBデータも削除されます。

```powershell
docker compose down -v
```

ホスト側ポートを変更する場合は、例えば次のように指定します。

```powershell
$env:KUSAKARI_EC_WEB_HOST_PORT = '15186'
$env:KUSAKARI_EC_API_HOST_PORT = '18086'
$env:MYSQL_HOST_PORT = '13306'
docker compose up --build
```

## 開発と検証

```powershell
npm ci
npm run check          # JavaScript型確認・lint・Viteビルド・Javaビルド
npm run format:check   # JavaScript / CSS / Java の整形確認
npm run test:e2e       # 専用API・専用Web・専用DBで7シナリオ
```

API変更時は `stop.bat` 後に `npm run build:api`、続いて `start.bat` を実行します。
フロント変更はViteで即時反映されます。

操作画面だけを再表示する場合は `sysover-ray2/start.bat` を実行します。画面には起動、停止、再起動、ブラウザーを開くボタンがあります。
手動のターミナル起動は `npm run dev:api` と `npm run dev:web` です。`stop.bat` はこの作業フォルダのJAR/Viteスクリプトを実行するJava/Nodeプロセスを、コマンドと作成時刻を再確認して停止します。固定ポートを使う別プロジェクトのプロセスは終了しません。
日本語を含むPowerShellスクリプトはWindows PowerShell 5.1で読めるようUTF-8 BOM付きで保存します。

テストのスクリーンショットとAPI JSONは `artifacts/e2e/`、失敗時traceとレポートは `artifacts/playwright-results/` / `artifacts/playwright-report/` です。
開発サーバーのログは `.runtime/` にあります。

## 設計上の制約

- ローカル専用です。127.0.0.1へのbindと接続元チェックを使用し、公開用認証は実装していません。
- CookieはHttpOnly / SameSite=Strict、有効期間30日です。Cookie削除後は以前のカート・注文履歴へアクセスできません。
- 在庫は追加時には予約しません。注文確定時にロック・再確認・減算します。
- 金額は税込JPYの整数です。店舗受け取りのみで、送料は0円です。
- 位置情報はリクエスト内の距離計算に使い、DBに保存しません。距離は道路距離ではなく直線距離です。
- 外部フォント取得に失敗してもOSのフォントで表示されます。商品画像はプロジェクト内にあります。
- 公開時の会員認証、決済、実商品フィード、税・送料規則、注文取消・返金、運用管理は別途実装が必要です。

設計判断: [docs/architecture.md](docs/architecture.md) / API: [docs/api.md](docs/api.md) / 画像: [docs/images.md](docs/images.md)

技術要件の確認元: [Spring Boot 3.5](https://docs.spring.io/spring-boot/3.5/system-requirements.html)、[Vite](https://vite.dev/guide/)。

## 機能要件と画面モック

出店者は `/seller`、運営者は `/operator`、アカウントは `/account` です。追加画面の実現範囲と61項目の対応は [機能要件対応表](docs/functional-requirements.md) を参照してください。認証・審査・通知・精算はメモリ内モックです。
