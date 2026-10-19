# 配布構成（AWS作成・デプロイは行わない）

## 対象と公開境界

1つのFargateタスク内で **EC API（8086）とCanvas API（8080）の2コンテナ** を動かす構成です。
画面と同梱商品画像・GLBはS3、庭写真・生成画像・サムネイルは非公開S3、業務データはRDS MySQLです。
ECとCanvasのDBスキーマ・DB利用者は分けます。Windowsの既存/専用MySQL起動はDocker不要のままです。

**一般公開可能な完成品ではありません。** 会員・出店者認証と権限分離は未実装です。
コンテナ起動には `KUSAKARI_PRIVATE_PREVIEW=true` を必須とし、VPN・認証済み社内経路等でサイト全体へのアクセスを制限してください。
このフラグ、Host/Origin確認、Cookieは利用者認証の代わりではありません。共有の検証所有者を使います。
インターネット公開用のCloudFrontへそのまま関連付けないでください。

## 配布物の作成

各リポジトリの依存をロックファイルから復元後、ECルートで実行します。これらはローカル処理だけです。

```powershell
node scripts/package-deployment.mjs --canvas-root ../kusakari-canvas
docker build --platform linux/amd64 -f docker/api.Dockerfile -t kusakari-ec-api:preview .
docker build --platform linux/amd64 -f ../kusakari-canvas/docker/api.Dockerfile -t kusakari-canvas-api:preview ../kusakari-canvas
```

配置が違う場合は `--canvas-root` とDockerのビルド対象を明示します。
静的成果物は `artifacts/deploy/<実行日時>/site/`、ファイル一覧とSHA-256は隣の `manifest.json` です。
既存の成果物を上書き/削除しません。`.env`、DB、ユーザー画像を静的成果物へコピーしません。
固定モデルと植物モデルv1〜v4を同梱し、既存の庭を読み込めます。

`task-definition.template.json` は未登録の雛形です。`render-task.mjs` に必要な環境変数を渡すと、
イメージdigest固定・HTTPSオリジン確認を行ってローカルJSONを生成します。ECR push、ECS登録、S3 upload等は実行しません。
元の `docker-compose.yml` はEC単体のローカル開発用です。Fargateの2コンテナ構成とは別です。

## 経路

| 閲覧URL | 接続先 | キャッシュ |
|---|---|---|
| `/api/*` | ALB → EC 8086（パス保持） | 無効、Cookie/Origin/クエリを転送 |
| `/canvas/api/*` | ALB → Canvas 8080（パス保持） | 無効、Cookie/Origin/クエリを転送 |
| `/canvas/*` | 静的S3の `canvas/` | 版付きJS/CSS/GLBは長期、HTMLは短期 |
| その他画面・`/images/*` | 静的S3 | 同上 |

CloudFrontは全体で1つです。`cloudfront-spa.js` をS3向けbehaviorのviewer-requestへ設定する想定です。
APIへのbehaviorでは関数を適用しません。欠落画像/GLBやAPIの404をHTMLへ変換しません。
ALBは `/canvas/api/*` を8080、それ以外の `/api/*` を8086へ振り分けます。
ALBのヘルス確認はCanvas `/health/ready`、EC `/api/health/ready` です。
ALBのHost転送では利用者の許可オリジンを保持してください。両APIの直接公開は禁止します。

## 環境設定

雛形の `${...}` は既存のリソース情報へ置換します。DBパスワードはSecrets Manager等からECSの `secrets` で注入します。
S3はタスクロールの標準資格情報チェーンを使用します。アクセスキーをイメージやフロント変数へ入れません。
`media-task-policy.template.json` は画像prefixへのGet/Putだけの権限例です。SSE-KMSを使う場合は対象KMS鍵の権限も別途必要です。
ECR取得・ログ出力・秘密取得の実行ロールと、アプリがS3を使うタスクロールを混同しないでください。
同一タスク内のため2コンテナは同じタスクロールを共有します。
雛形のメモリ上限はEC 2560MiB、Canvas 1536MiBです。実負荷に対する必要量の保証ではなく、
Javaのヒープ計算がタスク全体の容量を占有しないための初期配分です。負荷試験後に調整してください。

RDSは両APIとも証明書・ホスト名を検証するTLSが既定です。公式RDS CAをイメージ構築時に取得します。
CA更新時は再ビルドし、接続検証してください。平文接続の例外はローカル検証専用です。
必要なDB名は `kusakari` と `kusakari_canvas`。DB/利用者/権限は別担当のプロビジョニングで用意します。
S3/ログ/秘密/ECRへ到達できるVPC endpointまたは経路も別途必要です。

主な任意設定:

- `KUSAKARI_CANVAS_DB_POOL_SIZE`（既定5）、`KUSAKARI_EC_DB_POOL_SIZE`（既定8）。複数タスク分の合計接続数をRDS上限以内にします。
- `KUSAKARI_CANVAS_PREVIEW_OWNER` はサーバー側の検証所有者。既存データを移すときは所有者の扱いを明示します。
- `KUSAKARI_CANVAS_EC_URL` は内部API、`KUSAKARI_CANVAS_EC_IMAGE_ORIGIN` は画像配信オリジン。後者に内部APIを指定しません。
- AI画像生成が必要な場合だけCanvasへ `OPENAI_API_KEY` を秘密注入します。

## DB移行・起動・終了

コンテナの通常起動はDBを作成せず、移行もしません。未移行スキーマは起動を拒否します。
リリース前に同じイメージのコマンドを `migrate` にした単発処理を実行し、成功後に通常起動します。
これは常駐する3つ目のコンテナを追加する設計ではありません。

既存DBを更新するときは、復元可能性とavailable状態を確認したRDS snapshot ARNを
`KUSAKARI_EC_MIGRATION_BACKUP_REFERENCE` / `KUSAKARI_CANVAS_MIGRATION_BACKUP_REFERENCE` に渡します。
アプリは形式と指定有無を検査しますが、AWS APIで実在・復元可能性まで確認しません。確認責任は実行者にあります。
スキーマ移行前に書込を停止し、旧版へ戻す際はDBと画像ストレージを整合する時点へ復元してください。
新形式のS3参照を保存した後、旧版アプリだけに戻すことはできません。

終了シグナルはAPIへ直接届きます。猶予30秒、タスクstopTimeout60秒です。
ルートFSは読み取り専用、`/tmp` だけ書込可能です。永続ファイルをコンテナ内へ置きません。
Dockerfileの`VOLUME`と所有者10001の設定で、Fargateの一時領域にも書込権限を引き継ぐ構成です。

## 画像互換性・運用上の制約

ローカル既定は従来どおりDB保存です。S3選択時は新規写真/履歴/サムネイルをS3へ保存し、DBにはキーを記録します。
既存のDB画像は読み続けられ、自動一括移送は行いません。APIのData URL形式は維持するため、転送量は従来どおりです。
期限付きURLはDBへ保存しません。画像書込完了後にDBトランザクションで参照を更新し、画像I/O中は行ロックを保持しません。
保存競合・DB失敗では未参照画像が残る場合があります。庭削除でも共有画像を即削除しません。
S3の全オブジェクトを無差別に期限削除しないでください。参照中画像を壊します。参照照合と保持期間を設けた整理は運用側で実施します。
DBとS3のバックアップ/バージョニング/削除方針は一体で管理してください。

## 検証

```powershell
$env:KUSAKARI_DEPLOY_SITE='配布成果物のsiteフォルダーの絶対パス'
npx playwright test --config playwright.deployment.config.js
```

専用MySQLのE2E DBで2 APIを起動し、同一オリジンの静的成果物で検証します。APIモックは使いません。
両APIはcontainer設定を使用しますが、検証用MySQLだけはloopback・TLS無効です。
Canvasの検証起動ヘルパーが専用E2E設定を子プロセス内で読み、資格情報をテストレポートへ含めないようにしています。
`node scripts/verify-deployment-config.mjs` はAWSへ接続せず、雛形・容量配分・経路・安全な出力条件を確認します。
`--work-root '<既存の検証専用フォルダー>'`を指定すると、生成する雛形と結果JSONをその下の新しい実行フォルダーへ保存します。結果の絶対パスは終了時に表示します。
指定しない場合は従来どおり結果を`artifacts/deployment/config-verification.json`、雛形をOSの一時フォルダーへ保存します。
Linuxイメージ、S3実接続、RDS TLS、AWSネットワーク、別PC実機、SysOverRay可視操作はこのテストの保証範囲外です。
実行結果と未検証事項はCanvas側 `docs/deployment-refactor.md` に記録します。

Dockerが使えない場合でも、Canvasのbackendフォルダーから次の補助検証を実行できます。
これはLinuxコンテナやAWSでの成功を代替するものではありません。

```powershell
.\.venv\Scripts\python.exe -m verification.verify_object_storage --storage-executable '<検証済みSeaweedFSのweed.exe>' --storage-directory '<まだ存在しない検証データフォルダー>'
.\.venv\Scripts\python.exe -m verification.verify_database_tls --mysql-executable '<MySQLのmysqld.exe>' --java-executable '<Java 21のjava.exe>'
```

前者は専用E2E DBとloopbackのS3互換サービスを使用し、画像実体とDBキー、再起動、旧画像互換性を確認します。
後者は新規の隔離MySQLと一時CAを作り、実コンテナ用設定で両APIの移行・起動・読書き、未信頼CAとホスト名不一致の拒否を確認します。
`--ec-root` でECの配置先を指定できます。既存MySQLサービスやOS/Javaの標準証明書ストアは変更しません。
両検証とも所有する子プロセスだけを停止し、診断用データを保持します。TLSの確認に使う仕様は[MySQL Connector/Jの証明書・ホスト名検証](https://dev.mysql.com/doc/connector-j/en/connector-j-connp-props-security.html)です。
結果はCanvasの `artifacts/deployment-refactor/{object-storage,database-tls}.json` に保存します。

### Linuxイメージの統合検証

両イメージをビルド済みでDocker DesktopのLinuxエンジンが動作する場合は、Canvasのbackendで実行します。

```powershell
docker pull chrislusf/seaweedfs:4.48
docker pull mysql:8.4
.\.venv\Scripts\python.exe -m verification.verify_linux_containers --canvas-image kusakari-canvas-api:preview --ec-image kusakari-ec-api:preview --site '<配布成果物のsiteフォルダー>'
```

新規の専用DB・S3互換サービスと、配布する2 APIの実イメージを使用します。
DBは一時CAによるTLS必須、APIは非root・読み取り専用ルート・共有ネットワーク名前空間です。
通常起動の未移行DB拒否、明示移行の再実行、画像保存先、Chromiumによるモデル・カート・再読込、終了シグナル、サービス再起動後の復元を確認します。
検証用MySQLとS3はAWS外部サービスの代役です。Fargateタスクの常駐コンテナは2つのままです。
ホストへの公開は127.0.0.1の専用ポートだけです。CookieのSecure属性だけをこのローカルHTTP検証では無効にし、配布雛形のHTTPS設定は変えません。
一時/システムドライブの空きが5GiB未満ならフィクスチャ作成前に拒否します。Dockerの保存先にも十分な空きを確保してください。
Windowsで利用可能な仮想メモリが1GiB未満ならブラウザーを起動しません。これらは最低限の停止条件であり、負荷に対する容量保証ではありません。
検証専用DBは768MiB、S3互換サービスは384MiB、ブラウザー検証Nodeは384MiBのヒープ上限です。配布用Fargateの容量設定は変更しません。

結果と画面はCanvasの `artifacts/deployment-refactor/kusakari-verify-<実行ID>/` に保存します。
検証ファイルを別ドライブへ置く場合は、既存の専用フォルダーを`--work-root`に指定します。
この場合、新規DB/S3データ、診断ログ、ブラウザー一時ファイル、結果と画面は`<work-root>/<実行ID>-<乱数>/`の下へ保存し、結果はその`evidence/`に置きます。
`--site`も移動後の静的サイトのパスを指定してください。Docker全体の保存先、既存DB、イメージ、APIの検証用`/tmp`ボリュームは移動しません。
外付けドライブがWindowsから見えても、Docker内部から見えるとは限りません。bind mount元が存在しないというエラーでは両方の認識状態を確認してください。
Docker Desktopの再起動は既存コンテナにも影響するため、停止の合意を得てから行い、復旧も確認します。初期化や全体pruneを復旧手順として実行しないでください。
資格情報は新規の検証専用値で、レポートへ含めません。診断用の一時フォルダー、停止済みコンテナ、ラベル付きボリューム・ネットワークは保持します。
再実行は毎回独立した名前を作り、既存データを採用・削除しません。後で整理するときはレポート内の保持対象と所有ラベルを照合してください。
Docker障害で停止処理に失敗した場合は `ownedContainersStopped: false` と対象名を残します。復旧後にその実行IDの所有ラベルを照合して停止状態を確認してから、新たな検証を実行してください。
これはAWSのタスクロール、RDS実機、Fargate上のネットワーク・権限・負荷の成功を保証するものではありません。
S3互換サービスの起動方法は[SeaweedFS公式資料](https://github.com/seaweedfs/seaweedfs#docker)に基づきます。

参考: [ECSタスクロール](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)、
[RDS MySQL TLS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/ssl-certificate-rotation-mysql.html)、
[ECS一時ボリュームと所有者](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/bind-mounts.html)、
[S3署名URLの期限](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)。
