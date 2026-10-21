# 別PCでEC・CanvasのCognito認証を動かす

既存の東京の開発用User Poolを共用します。各PCでCognitoを作り直す必要はなく、通常のログインにAWSアクセスキーやOpenAI APIキーは不要です。Windows 10/11 x64向けです。初回の依存取得とCognito通信にはインターネット接続が必要です。

## 1. 2つのリポジトリを並べる

Gitを導入済みのPowerShellで、任意の作業用フォルダーに取得します。保存先はそれぞれ`kusakari-ec`と`kusakari-canvas`にします。

```powershell
git clone https://github.com/abeouga/kusakari-ec.git kusakari-ec
git clone https://github.com/abeouga/kusakari-canvas.git kusakari-canvas
```

既に取得済みの場合は、各PCの変更を退避・コミットしてから両方のmainを更新してください。他PCの`.env`、`.runtime`、DBのデータフォルダーをコピーしないでください。

## 2. 各PC専用のDBと依存を準備する

```powershell
cd kusakari-ec
.\setup.bat
cd ..\kusakari-canvas
.\setup.bat
cd ..\kusakari-ec
```

各セットアップはNode/JavaまたはPython、MySQL、必要な依存を準備します。既存MySQLを利用する場合はそのPCの管理者情報を入力し、生成されたアプリ用DB資格情報を各リポジトリのGit対象外`.env`に保持します。秘密情報はGitHubへ追加しません。セットアップが失敗した状態では次へ進まず、各READMEのセットアップ診断を確認してください。

既存DBを使う場合は先にバックアップしてください。ECの初回起動でFlyway V8が`auth_members`と所有者列を追加します。既存のカートや庭を新しい利用者へ自動で移管しません。

## 3. 公開可能な接続設定だけを適用する

ECルートで実行します。両方のセットアップが作成した`.env`が必要です。

```powershell
node scripts/configure-cognito.mjs --check
node scripts/configure-cognito.mjs
```

EC・Canvasの`config/cognito.development.json`から、許可した接続設定だけを`.env`へ反映します。DBパスワードとAPIキーは保持し、Cognitoの利用を明示的に有効にします。ファイルの全置換や資格情報の配布は行いません。配置が異なる場合は`--canvas-root C:\work\kusakari-canvas`を両コマンドへ追加します。設定後にセットアップを`-Reconfigure`でやり直した場合も、再度この設定を適用してください。

共有する非秘密情報は以下です。

|項目|値|
|---|---|
|リージョン|ap-northeast-1（東京）|
|User Pool ID|ap-northeast-1_HvkWp5qwE|
|Client ID|1pmnu6u8nh1g4o63e7t0tjlu5m|
|Issuer|https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_HvkWp5qwE|
|ドメイン|https://kusakari-497746198728-dev.auth.ap-northeast-1.amazoncognito.com|
|Callback|http://127.0.0.1:5186/api/auth/callback/cognito|
|Logout URL|http://127.0.0.1:5186/|

このクライアントはシークレットを生成しない公開クライアントです。ID・URLだけではAWSの管理操作はできません。[AWS公式のクライアント設定](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html)も参照してください。

## 4. 起動と実ログイン

ECルートで`.\start.bat`、別ウィンドウでCanvasルートの`.\start.bat`を実行します。ソースから起動する場合は、各リポジトリで`npm run dev:api`と`npm run dev:web`を別ターミナルで起動できます。ECを先に起動してください。

- EC: http://127.0.0.1:5186/account/login
- Canvas: http://127.0.0.1:5173/
- API疎通: http://127.0.0.1:8086/api/health / http://127.0.0.1:8080/health/ready

ブラウザーの「ログイン」からCognitoへ進み、既存のテストアカウントまたはメール確認済みの利用者でログインします。テストアカウントは`test.user@example.com`と`test.seller@example.com`です。パスワードは管理者から別の経路で受け取り、リポジトリには記載しません。

両画面は必ず`127.0.0.1`で開きます。`localhost`やPC名と混在させないでください。ポート5186/8086/5173/8080が使用中なら競合を解消します。CognitoのCallbackはポートまで一致する必要があるため、別ポートへの自動退避やLAN公開はこの設定では利用しません。

## 5. 別DBで出店者権限を準備する

Cognitoの利用者は共通ですが、ECの`auth_members`、商品、カート、Canvasの庭は各PCのDBです。初回ログインでは必ずUSERが作成されます。別PCのSELLER/ADMIN設定、既存の庭や商品は自動同期されません。

`test.seller@example.com`で一度ログインした後、そのPCのDB管理者がMySQLクライアントへ接続し、次のように対象を確認して店舗1のSELLERへ変更します。MySQLパスワードは対話入力し、SQLファイルやGitに保存しないでください。MySQLやコマンド操作に慣れていない場合は、5.1から順に進めます。

### 5.1 PowerShellとMySQLクライアントの基本

- **PowerShellを開く**: スタートメニューで「PowerShell」と入力し、「Windows PowerShell」を開きます。管理者として実行する必要はありません。
- **コマンドの実行**: この手順のコマンドをコピーし、PowerShellの画面で右クリックすると貼り付けられます（`Ctrl+V`でも可）。Enterで実行します。複数行のSQLも、まとめて貼り付けて構いません。
- **画面の切り替わり**: 先頭が`PS C:\...>`ならPowerShell、`mysql>`ならMySQLクライアントへの入力です。SQLは`mysql>`の状態で、PowerShellのコマンドは`PS ...>`の状態で実行します。
- **SQLの終わり**: SQLは最後の`;`まで入力して初めて実行されます。先頭が`->`のまま止まった場合は、`;`を入力してEnterを押します。
- **入力のやり直し**: 入力途中で取り消したいときは、`mysql>`では`\c`を入力してEnter、PowerShellでは`Ctrl+C`を押します。
- **終了**: `mysql>`で`exit`を入力すると、PowerShellへ戻ります。

### 5.2 このPCのMySQLを確認する

ECルートで次を実行し、DBの方式とポートだけを表示します。`.env`全体はパスワードを含むため、画面共有中に開かないでください。

```powershell
Select-String -Path .env -Pattern '^KUSAKARI_EC_(DATABASE_MODE|DB_PORT)='
```

|表示|MySQLの種類|ポート|
|---|---|---|
|`KUSAKARI_EC_DATABASE_MODE=managed`|`setup.bat`が用意したKusakari専用MySQL|通常3307|
|`KUSAKARI_EC_DATABASE_MODE=existing`|そのPCに以前からインストールされているMySQL|通常3306|

以降のコマンドの`3307`は、表示された`KUSAKARI_EC_DB_PORT`の値に置き換えます。接続前に、ECの`.\start.bat`でMySQLを起動しておいてください。

### 5.3 管理者パスワードを用意する

**managedの場合**、rootパスワードはセットアップ時に自動生成され、WindowsのDPAPIで暗号化して`%LOCALAPPDATA%\Kusakari\mysql\admin.secret`に保存されています。次のコマンドで復号して表示します。

```powershell
$s = Get-Content -Raw "$env:LOCALAPPDATA\Kusakari\mysql\admin.secret" | ConvertTo-SecureString; (New-Object Management.Automation.PSCredential('root', $s)).GetNetworkCredential().Password
```

- 前半は、暗号化されたファイルを読み、現在のWindowsユーザーの鍵で復号して、保護された文字列（SecureString）として`$s`へ入れます。代入なので、何も表示されません。
- 後半は、`$s`を普通の文字列へ戻して表示します。PowerShellでは代入しない結果がそのまま画面に出るため、`echo`は不要です。`echo $s`では`System.Security.SecureString`と表示されるだけです。
- 復号できるのは、セットアップを実行したPCの同じWindowsユーザーだけです。データの変更は行いません。
- パスワードは画面に表示されるため、周囲や画面共有に注意してください。ファイルやメモへ保存せず、接続後に`cls`で画面を消します。

**existingの場合**は、そのPCのMySQL管理者が設定したrootパスワードです。セットアップ時に入力を求められなかった場合は`password`です。

### 5.4 MySQLクライアントで接続する

**managedの場合**は、セットアップが取得したクライアントを使います。

```powershell
& "$env:LOCALAPPDATA\Kusakari\tools\mysql-8.4.11-winx64\bin\mysql.exe" -h 127.0.0.1 -P 3307 -u root -p kusakari
```

**existingの場合**は、インストール済みの`mysql.exe`を探し、表示されたパスで同じように接続します。

```powershell
Get-ChildItem "$env:ProgramFiles\MySQL" -Recurse -Filter mysql.exe | Select-Object -ExpandProperty FullName
```

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -h 127.0.0.1 -P 3306 -u root -p kusakari
```

|部分|意味|
|---|---|
|`&`|`"..."`で囲んだパスをプログラムとして実行します。省略するとパスが文字列として表示されるだけです|
|`-h 127.0.0.1`|接続先のホストです。自分のPCを指します|
|`-P 3307`|接続先のポートです。**大文字**の`P`です|
|`-u root`|MySQLのユーザー名です|
|`-p`|パスワードを入力します。**小文字**の`p`です。値を続けて書かないことで、非表示の対話入力になります|
|`kusakari`|接続後に使うEC用DBです。`-p`との間にスペースが必要です。`-pkusakari`と書くと、`kusakari`がパスワードとして扱われます|

`Enter password:`と表示されたら、5.3のパスワードを貼り付けてEnterを押します。入力した文字は表示されません。`mysql>`が表示されれば接続できています。

- `Can't connect to MySQL server on '127.0.0.1:3307'`: MySQLが起動していないか、ポートが違います。`.\start.bat`の起動と5.2のポートを確認します。
- `Access denied for user 'root'`: パスワードが違います。貼り付け時に前後へ空白が入っていないか確認します。

### 5.5 対象を確認して出店者へ変更する

`mysql>`の状態で、対象の会員と店舗を確認します。

```sql
SELECT id, issuer, subject, email, role, store_id, enabled
FROM auth_members
WHERE issuer = 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_HvkWp5qwE'
  AND email = 'test.seller@example.com';
SELECT id, name FROM stores WHERE id = 1;
```

結果は表形式で表示され、最後に`1 row in set`のように件数が出ます。次を確認します。

- 1つ目の結果が1行で、`enabled`が`1`であること。`Empty set`の場合は、`test.seller@example.com`でECへまだログインしていません。
- 2つ目の結果に店舗1が表示されること。

対象が有効な1行であることと店舗の実在を確認してから、取得した会員IDを指定します。メール文字列を認可の根拠にはしません。

`id`列の値（`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`形式の36文字）を、マウスで範囲選択し、Enterでコピーします（Windows Terminalでは`Ctrl+C`）。次のSQLの`<上のSELECTで確認した会員ID>`を、前後の`'`を残したまま置き換えてから実行します。

```sql
UPDATE auth_members SET role = 'SELLER', store_id = 1
WHERE id = '<上のSELECTで確認した会員ID>'
  AND issuer = 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_HvkWp5qwE'
  AND enabled = TRUE;
```

MySQLクライアントでは、`UPDATE`は実行した時点で確定します。取り消しの確認は出ません。

- `Query OK, 1 row affected`: 変更されました。
- `Query OK, 0 rows affected`かつ`Rows matched: 1`: すでにSELLERの店舗1です。
- `Rows matched: 0`: 何も変更されていません。会員IDの貼り付け間違いや`'`の消失がないか確認します。

`exit`でMySQLクライアントを終了します。ECの画面は再ログインせず、再読み込みで反映されます。

`http://127.0.0.1:5186/api/auth/me`が`role: SELLER`、`storeIds: [1]`を返すことを確認します。無効な会員を有効化したり、管理者へ自動昇格したりする手順ではありません。

## 6. 動作確認とよくある失敗

1. ECでログインし、再読み込み後も`/api/auth/me`が`authenticated: true`であることを確認します。
2. Canvasで自分の検証用庭を作成し、再読み込みして保存を確認します。
3. 別利用者でログインし、前の利用者の庭一覧と庭IDにアクセスできないことを確認します。
4. ECでログアウトし、ECが未認証、Canvasの庭取得が401になることを確認します。既存の庭は削除しません。

- Cognito未設定表示: 設定適用と両APIの再起動を確認します。`/api/auth/status`はCanvasのmode、`/api/auth/me`はECのmodeと会員状態です。
- redirect mismatch: Callbackのホスト・ポート・パスが上の表と一致するか確認します。
- Canvasで認証確認エラー: EC API 8086への疎通、両画面の127.0.0.1統一、Cookie有効化を確認します。
- 出店者操作が403: そのPCのDBの会員ロールと担当店舗を確認します。
- セッション消失: EC再起動時や有効期限到達時は再ログインします。

通常のログインにOpenAIキーは不要です。未設定ならAI画像生成などの有料AI機能は別途利用できません。AWS管理キー、DBパスワード、Cognitoのトークン/Cookie、Terraform state/planはGitへ含めないでください。既存プールに接続するPCではTerraform applyを実行しません。
