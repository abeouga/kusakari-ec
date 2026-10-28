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

## 5. 出店者・運営者の権限を付ける

Cognitoの利用者は共通ですが、権限（`USER`/`SELLER`/`ADMIN`）はECの`auth_members`に保存され、PCごと・DBごと（開発`kusakari`、E2E`kusakari_e2e`）に別です。初回ログインでは必ず`USER`として作られます。別PCの権限、既存の庭や商品は自動同期されません。

1. ECを`.\start.bat`で起動し、`test.seller@example.com`と`test.admin@example.com`でそれぞれ一度ログインしてからログアウトします。
2. ECルートのPowerShellで次を実行します。E2E用DBにも設定する場合は、同じコマンドに`-Database kusakari_e2e`を付けて実行します。

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\set-member-role.ps1 -Email test.seller@example.com -Role SELLER -StoreId 1
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\set-member-role.ps1 -Email test.admin@example.com -Role ADMIN
   ```

3. ECの画面を再読み込みし、`http://127.0.0.1:5186/api/auth/me`が`role: SELLER`、`storeIds: [1]`を返すことを確認します。再ログインは不要です。

スクリプトは`.env`のDB接続と`KUSAKARI_COGNITO_ISSUER`を使い、そのUser Poolでログイン済みの有効な会員1件だけを変更します。MySQLクライアントやrootパスワードは不要です。未ログイン、利用停止中・退会済み、存在しない店舗、ADMINから`SELLER`への変更は、変更せずに停止します。出店の取り消し（`SELLER`から`USER`へ戻す操作）は`scripts/revert_store_approval.py`で行います。

権限名はアプリが大文字の完全一致で判定します。Flyway V14より前のDBは`seller`や`Seller`も受け付けたため、ログインはできても出店者画面に入れないことがありました。V14が既存値を大文字へ揃え、以後は`USER`/`SELLER`/`ADMIN`以外を拒否します。判断の記録は[会員権限の値](member-roles.md)を参照してください。

## 6. 動作確認とよくある失敗

1. ECでログインし、再読み込み後も`/api/auth/me`が`authenticated: true`であることを確認します。
2. Canvasで自分の検証用庭を作成し、再読み込みして保存を確認します。
3. 別利用者でログインし、前の利用者の庭一覧と庭IDにアクセスできないことを確認します。
4. ECでログアウトし、ECが未認証、Canvasの庭取得が401になることを確認します。既存の庭は削除しません。

- Cognito未設定表示: 設定適用と両APIの再起動を確認します。`/api/auth/status`はCanvasのmode、`/api/auth/me`はECのmodeと会員状態です。
- redirect mismatch: Callbackのホスト・ポート・パスが上の表と一致するか確認します。
- Canvasで認証確認エラー: EC API 8086への疎通、両画面の127.0.0.1統一、Cookie有効化を確認します。
- 出店者画面に入れない・出店者操作が403: そのPCのDBで5.の権限付与を実行したか、`/api/auth/me`の`role`と`storeIds`を確認します。
- セッション消失: EC再起動時や有効期限到達時は再ログインします。

通常のログインにOpenAIキーは不要です。未設定ならAI画像生成などの有料AI機能は別途利用できません。AWS管理キー、DBパスワード、Cognitoのトークン/Cookie、Terraform state/planはGitへ含めないでください。既存プールに接続するPCではTerraform applyを実行しません。
