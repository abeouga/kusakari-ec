# Windows 一括セットアップ

## Context

従来は `.env` の手動作成、Node / JDK / MySQL / .NET の導入が前提でした。
DB作成後にアプリユーザーの認証やFlywayを検証せず、別PCで起動できない場合がありました。

## Decision

Windows 10/11 x64のWindows PowerShell 5.1で `setup.bat` → `start.bat` を入口にします。
初回の端末入力で接続設定を決め、現在のWindowsユーザーだけが読める `.env` に保存します。
管理者パスワードを画面やコマンド引数に表示しません。既存MySQLの管理者パスワードは保存しません。
MySQL CLIの一時設定ファイルはユーザー専用ACLで作成し、処理終了後に削除します。MySQL CLIが日本語を含む作業パスの設定ファイルを開けない環境に備え、Windows一時フォルダーを優先して使い、必要な場合は8.3形式のパスを使います。
既存DBを削除しません。`kusakari@localhost` はこのローカルデモ専用アカウントとして、必要に応じてパスワードを`password`へ揃えます。

### 初回の操作

1. ソースを任意のフォルダーに配置し、`setup.bat` をダブルクリックします。
2. `127.0.0.1:3306` のMySQLが動作していれば、それを自動選択します。この場合だけrootパスワードを1回入力します。
3. MySQLが応答しなければ、Kusakari専用MySQLを`127.0.0.1:3307`で自動作成・起動します。専用rootパスワードも`password`に自動設定し、入力を求めません。
4. アプリユーザーは`kusakari`に固定し、アプリ用パスワードは`password`に自動設定します。
5. 依存復元、ビルド、開発/E2E DBのFlywayと実API起動確認の完了を待ちます。
6. `start.bat` をダブルクリックします。Web、API、ブラウザー、SysOverRayを起動します。

既存MySQLのrootパスワードが`password`なら入力不要です。異なる場合だけ非表示入力します。専用MySQLとアプリ用DBパスワードは`password`で固定します。これは127.0.0.1限定のローカルデモ用設定です。
DB名は `kusakari` / `kusakari_e2e` に固定し、接続先は `127.0.0.1` に限定します。
アプリでrootアカウントを使用しません。アプリユーザーにはこの2つのDBだけに権限を付与します。
接続・Flyway・カタログを検証できなければセットアップ成功と表示しません。

MySQL Serverを事前にインストール済みのPCでは、`script-for-mysql\setup.bat`を実行してから`script-for-mysql\start.bat`を実行します。この経路はTCP 3306の既存MySQLを使用し、rootパスワード`password`を先に試します。認証されない場合は、rootパスワードを非表示で入力します。rootパスワードは保存しません。`.env`が既存MySQL設定になっている場合は、通常の`start.bat`もこの経路へ自動的に切り替わります。

### 再実行・設定変更

通常の `setup.bat` は保存済みの設定で認証確認し、入力を省略します。
設定を作り直す場合だけ `setup.bat -Reconfigure` を端末から実行します。既存MySQLを選んだ場合はrootパスワードを再入力します。
直前の `.env` をGit対象外の `.runtime/env.previous` にユーザー専用ACLで退避します。
`-SkipInstall` は依存・ビルドが既にある場合のDB再確認専用です。

Node.js LTS（22.12以上）、Temurin JDK 21、.NET 10 SDKが不足する場合は、
公式配布情報とチェックサムを使って `%LOCALAPPDATA%/Kusakari/tools` に導入します。
.NET 10 SDKは公式release metadataのSHA-512で検証し、SDK 10と`Microsoft.WindowsDesktop.App 10`の両方を確認します。
Mavenはリポジトリ内のWrapperを使います。システムPATHの変更は不要です。
ツールの位置をGit対象外の `.runtime/toolchain.json` に記録し、起動時に読み込みます。
このファイルはPCごとに再生成します。

専用MySQLは公式ZIPのSHA-256とOracle署名を検証して導入します。
データ・状態は `%LOCALAPPDATA%/Kusakari/mysql` に保存し、root秘密はWindows DPAPIで保護します。
既存MySQLサービス、他プロジェクトのデータ・プロセスは変更しません。
専用サーバーはローカルだけで待ち受け、PC再起動後も `start.bat` が同じデータで復帰します。
専用MySQL自身が専用データディレクトリでポートを占有していれば停止・復旧します。別サーバーは停止しません。
停止スクリプトはWeb/APIを停止し、専用MySQLは継続稼働します。

### 強制復旧

`1009修正スクリプト.bat`は、カレントディレクトリではなくスクリプトの配置からプロジェクトを特定します。`/dry-run`で対象PIDと削除対象の生成物を確認できます。通常実行では、このプロジェクト所有と判定できたWeb/API/Overlayだけを強制終了し、固定ポートを別プロセスが使用中なら停止して終了します。

再構築の対象は`node_modules`、`frontend/node_modules`、`backend/target`、`frontend/dist`、`sysover-ray2/app`です。`.env`の値、MySQLのスキーマ・データとサービス、Dockerボリューム、`.runtime`の設定・バックアップは削除しません。`.env`に旧`KUSAKARI_*`名があれば、現在のユーザーだけが読めるバックアップを`.runtime`へ作成してから`KUSAKARI_EC_*`へ変更し、値を保持します。既存MySQLのrootパスワードは`password`を先に試し、拒否された場合は非表示入力を求めます。未認識のDBスキーマでは変更前に停止します。

## Alternatives

環境変数を手作業で設定する方法は、入力漏れとPC依存を残すため既定にしません。
MySQLをシステムサービスとして自動導入する方法は、既存サービスと競合するため採用しません。

## Consequences

初回はネット接続と空き容量が必要です。MySQL用Visual C++ランタイムが不足する場合は、
署名確認済みMicrosoftインストーラーで管理者権限が必要です。
他PCへ `.env`、`.runtime`、DBデータ、DPAPI秘密をコピーせず、各PCでsetupを実行します。
既存MySQLの管理者認証情報が不明な場合は、rootパスワードを求められない専用MySQLへ自動的に切り替えるため、既存方式の選択は不要です。
API/Webは従来の8086/5186に固定し、他プロジェクトのプロセスを停止しません。

## Verification scope

実MySQL・Chromiumで注文と再読み込みを検証し、画面とAPI JSONを保存します。
端末入力、資格情報の再利用、未知スキーマ拒否、誤パスワード診断、専用MySQL再起動、
ツール未導入状態はブラウザーE2Eでは確認できないため、独立した実セットアップ検証を行います。
ログ、専用検証データ、資格情報はGit対象外に保持します。

### 検証結果（2026-10-05）

- Windows PowerShell 5.1からsetup.batを実行し、実MySQL 8.4の開発/E2E DB認証、Flyway、商品データ、実API起動を確認しました。
- Node/JavaがPATHにない状態で、Node LTS・Temurin JDK 21の取得・チェックサム検証・実行に成功しました。.NET 10 SDKも自動取得し、SysOverRayをビルドしました。
- 既存MySQLのrootパスワードが`password`と異なる場合だけ非表示入力し、アプリ資格情報は自動設定する動作、設定ファイルのユーザー専用ACL、一時資格情報ファイルの削除を確認しました。
- 当時の既存環境に保存されていたMySQL実行ファイルとZIPを再利用し、保存済みmanaged設定で`instance.json`が無い場合の専用DB初期化・ユーザー・スキーマ作成を確認しました。
- 別ポート・別データディレクトリの一時環境で、他PCを想定した`setup.bat -SkipInstall`のDB初期化、Flyway、実API起動を確認しました。
- 保存済み資格情報でsetup.batを再実行し、開発DB全テーブルのチェックサムと接続設定が不変であることを確認しました。
- 専用MySQLの初回作成、別サーバーのポート占有時の拒否、停止後の復帰とデータ保持を確認しました。
- 未知スキーマではユーザー作成・設定保存前に拒否し、既存テーブルの内容を保持しました。誤パスワードでは1045を表示し、秘密値を表示しませんでした。
- start.batでAPI/Web・Web経由API、SysOverRayの可視ウィンドウ・最前面属性・操作ボタンを確認しました。
- JavaScript型確認・lint・Web/Javaビルド・変更ファイルの整形確認に成功しました。実MySQLのChromium E2E全7件が成功し、注文再読み込み後の画面と実API JSONを保存しました。

別PC実機での検証、およびVisual C++ランタイムの新規導入/UAC操作は未実施です。
