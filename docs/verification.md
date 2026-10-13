# 検証記録

## 2026-10-13: アカウント・管理者・庭一覧の画面整理

- アカウント・管理者・出店者画面はトップページと同じKusakariHeaderを利用します。従来の専用ヘッダーは削除しました。
- 購入者画面の見出しは「ユーザーアカウント」です。ログイン・新規登録・住所管理・パスワード変更・再設定・退会は左サイドバーから選び、本文上部のタブは削除しました。各操作は `/account/login` などのURLで直接開けます。
- 管理者の戻り口は「戻る」です。「アカウント管理」は `/operator/members` を開き、登録済み会員の検索と利用状態の変更を管理者画面内で行います。
- 利用者に表示していたモック・デモ・サンプルの注記は削除しました。認証・審査・通知・精算は引き続きメモリ内の画面モックであり、再読み込みで初期化します。バックエンドの認証や決済を追加した変更ではありません。
- 通常起動した実ブラウザーの証跡は `artifacts/e2e/account-shared-header-*`、`operator-accounts-*`、`garden-options-normal-*` と `account-operator-options-browser.json` に保存します。

## 2026-10-13: サイドバー・ログイン画面モック

- 購入者用サイドバーはアカウント・通知一覧・注文状況・配置素材の商品候補をアイコン付きで表示します。商品を探す導線は「戻る」に置き換えます。アプリ内の遷移履歴があれば直前へ戻り、直接アクセスした場合は商品一覧へ戻ります。出店者・管理者のメニューにもLucideアイコンを付けます。
- 共通ヘッダーにログインを追加し、ログイン・一般向け新規登録・出店者向け新規登録をセグメントコントロールで切り替えるダイアログを表示します。アカウント画面内のログイン・登録機能はサイドバーから利用できます。
- このダイアログは入力確認だけの画面モックです。認証・アカウント作成API、ログイン状態の変更、入力値の永続化は行いません。送信確認後・方式切替後・閉じた後にパスワードを保持しません。
- `e2e/auth-dialog.spec.js` は3方式、確認用パスワードの不一致、キーボード切替、閉じる・再表示、書き込み通信0件、1600/1280/768/390/320px幅を確認します。
- `e2e/sidebar.spec.js` は直前画面への復帰、再読み込み後の復帰、直接アクセス時の商品一覧への復帰、購入者メニュー間の移動、各メニューのアイコンを確認します。
- 実API・専用MySQLを使う関連E2Eに加え、通常起動中の実ブラウザも確認します。画面と結果は `artifacts/e2e/auth-normal-*`、`sidebar-normal-*`、API JSONは `auth-dialog-api.json`、`sidebar-api.json` に保存します。
- 共通ヘッダーは0.1.4としてCanvasへ配布します。Canvasのログインリンクは未保存確認を経由してECの `/?panel=login` を開きます。

## 2026-10-09: Kusakari EC識別子移行・移設検証

実行先: `C:\Users\t_abe\Desktop\kusakari-ec`。移設試験は、空白と日本語を含む一時フォルダーへ独立コピーして行いました。

### 識別子と配置

- npmルート`kusakari-ec`、workspace`@kusakari-ec/frontend`、Java group/package`jp.kusakari.ec`、JAR`kusakari-ec-api`、Spring application`kusakari-ec-api`、SysOverRay`KusakariEcSysOverRay`を確認しました。
- Javaソース全47本のpackage名とディレクトリ階層が一致し、古いJavaソース階層は残っていません。
- `.env`の設定名は`KUSAKARI_EC_*`へ統一しました。値は検証出力に表示していません。
- BAT 8本の改行をCRLF、プロジェクトPowerShell 15本の構文とUTF-8 BOMを確認しました。
- スクリプトは実行場所からプロジェクトを特定します。`C:\Windows\Temp`から`script-for-mysql\common.ps1`でルート検出し、`1009修正スクリプト.bat /dry-run`も移設コピー上で終了コード0でした。

### 移設先での復旧と動作

- `1009修正スクリプト.bat`を移設コピー上で実行し、生成物削除、`npm ci`、Java 21ビルド、Viteビルド、SysOverRayビルド、既存MySQLの開発/E2E DB確認、API/Web/プロキシ、可視Overlay確認まで終了コード0でした。
- 既存DBはFlyway V1/V2で、各DBに4商品がある構成でした。初回復旧ではセットアップの許可テーブル一覧がV2の`product_images`、`cart_details`、`order_details`を含まず安全停止しました。許可一覧をV1/V2それぞれに対応させ、再実行で両DBのFlyway・商品データ確認を通しました。
- 移設後にMySQL CLIが日本語を含むプロジェクトパス配下の一時設定ファイルを開けない問題を再現しました。資格情報ファイルをACL制限したWindows一時フォルダーへ置き、必要時はASCIIの短縮パスを使うよう変更し、root/appユーザーの読み取り接続を再確認しました。
- 移設コピーからのChromium E2Eは実APIと専用MySQL `kusakari_e2e`で11件成功しました。ルートでも11件成功しました。E2Eは開発用カート・注文を削除せず、専用テストフィクスチャのみを片付けます。
- Web/APIの固定ポート5186/8086を別作業ディレクトリから起動し、APIの`application=kusakari-ec`、Web応答、Web経由API、SysOverRayの可視画面・最前面属性・操作部品を確認しました。
- `npm run check`（JavaScript型確認、ESLint、Vite、Maven）と`git diff --check`は成功しました。

再読み込み後の画面/API JSONは`artifacts/e2e/order-after-reload.*`と`artifacts/e2e/relocated-japanese-path/`に保存しました。移設試験のカタログ画面は`artifacts/e2e/relocated-japanese-path/catalog-desktop.png`です。

物理的に別のPCでの実行は未実施です。移設試験では同じWindowsホストのMySQLサービスと既存ツールチェーンを利用したため、未導入端末での全依存自動取得を今回の試験結果としては扱いません。

### 2026-10-09 追試: 旧`.env`名からの復旧

- ルートで`npm run check`と`npm run test:e2e`を再実行し、前者は終了コード0、後者は実API・MySQL・Chromiumで11件成功しました。
- 依存ディレクトリを含めず複製した、空白・日本語を含む別パスから`1009修正スクリプト.bat`を実行しました。`C:\Windows\Temp`からの`/dry-run`と通常復旧はいずれも終了コード0でした。通常復旧は`npm ci`（151 packages、監査上の脆弱性0）、Java 21向けAPI、Vite、SysOverRayを再構築し、DB・Flyway・商品データ、API/Web/プロキシ、可視Overlayを確認しました。
- 隔離コピーの`.env`だけを旧`KUSAKARI_*`名にして復旧を実行し、対象6キーの名前変更、値の完全一致、旧名残存なし、バックアップACLが現在のユーザーに限定されたことを確認しました。移行後のコピーからもChromium E2E 11件が成功しました。
- 追試で見つけたバックアップACL設定のPowerShellコマンドレット依存を除き、`.NET FileSecurity`でACLを設定する実装へ変更しました。Windows PowerShell 5.1の復旧BAT実行で旧`.env`移行を再確認しました。

### 2026-10-09 追試: 初回ツール導入を含む隔離プロファイル

- `.git`、`.runtime`、依存・ビルド生成物を含めずに複製したソースを、空白と日本語を含むパス`C:\Users\t_abe\AppData\Local\Temp\Kusakari EC fresh-profile_日本語_5790472f1c4242c7976a1b6a57544c0e`で実行しました。`1009修正スクリプト.bat`は`C:\Windows\Temp`から起動し、スクリプトの配置場所からプロジェクトルートを検出しました。
- Node/JDK/.NETとMaven・NuGet・npm・Playwrightのキャッシュを新しいユーザー一時プロファイルへ分離し、Node 24.21.0、Temurin JDK 21.0.12.1、.NET SDK 10.0.401を取得しました。SDKの`.runtime/toolchain.json`も隔離先を指すことを確認しました。検証時のPATHからNode/JDK/.NETのグローバル導入先は外しています。
- `1009修正スクリプト.bat`は依存復元、Vite、Maven、SysOverRayのビルドと、既存MySQL上の開発/E2E DB・Flyway・商品データ確認を終了コード0で完了しました。別途`npm run check`を隔離環境で実行し、checkJs、ESLint、Vite、Mavenの全工程が終了コード0でした。
- 同じコピーで実API・専用MySQL `kusakari_e2e`・ChromiumのE2E 11件が成功しました。注文の保存・再読み込み後の画面とAPI JSON、PC/モバイルのカタログ画面を`artifacts/e2e/isolated-profile-japanese-path/`へ保存しました。
- API 8086、Web 5186、Web経由APIとSysOverRayの可視画面・操作ボタンを確認し、検証コピーの`stop.bat`が終了コード0でAPI/Webを停止しました。MySQL 3306は稼働を維持しました。
- ルートの`1009修正スクリプト.bat /dry-run`も`C:\Windows\Temp`から実行し、終了コード0、`.env`のハッシュと生成ディレクトリの有無が実行前後で不変でした。
- `C:\Windows\Temp`から絶対パス指定でDocker Compose設定を解決し、終了コード0、プロジェクト名`kusakari-ec`と`api`/`mysql`/`web`サービス、`kusakari-mysql`論理ボリュームを確認しました。コンテナー自体は起動していません。

この追試は同じ物理PC上での隔離・移設試験です。MySQLは既存のローカルサービスを使っており、別PCでの実機実行、MySQL未導入環境、管理者権限が必要なVisual C++導入までは証明していません。

### 2026-10-09 追試: 実ルートのBAT入口

- `C:\Windows\Temp`を作業ディレクトリにして、実ルートの`setup.bat -SkipInstall`を実行しました。終了コード0で、MySQL 3306上の`kusakari`と`kusakari_e2e`を実API・Flyway・商品データで確認し、`.env`のSHA-256は実行前後で一致しました。
- 同じ条件で`start.bat -NoBrowser`を実行し、終了コード0、API healthの`application=kusakari-ec`、Web 200、Web経由API、API/Nodeの実行パスが当該ルート配下であることを確認しました。SysOverRayは可視・最前面の操作画面と操作部品まで確認しました。
- `stop.bat`は終了コード0でWeb/APIを停止し、5186/8086の待受がなくなりました。MySQL 3306は維持されました。SysOverRayは操作画面として残る仕様のため、検証で起動したPIDと実行パスを照合してから終了しました。
- すべてのBATは別の作業ディレクトリから起動しました。物理的な別PCでの試験ではありません。
- 続けて実ルートの`1009修正スクリプト.bat`を通常実行し、終了コード0でした。`npm ci`で151 packagesを導入し脆弱性0、Maven API・Vite Web・SysOverRayのビルド、両DBのFlyway・商品データ、API/Web/プロキシ、可視Overlayを確認しました。
- 復旧前の`node_modules\@kusakari\frontend`は存在しない旧`kusakari-mvp\frontend`を指すJunctionでした。復旧後は旧Junctionがなくなり、`node_modules\@kusakari-ec\frontend`が実ルートの`frontend`を指すJunctionとして再生成されました。
- 通常復旧前後で追跡ソース115ファイルのSHA-256一覧と`.env`のSHA-256が一致しました。復旧後に`stop.bat`を実行し、API/Webポートを解放、MySQL 3306を維持しました。検証で起動したOverlayは実行パス照合後に終了し、当該プロジェクトのJava/Node/Overlayプロセスは残っていません。

## 2026-10-06: Stitch画面案のCRUD拡張（検証中）

実行先: `C:\Users\t_abe\Desktop\kusakari-mvp`。

`npm run check` のcheckJs、ESLint、Viteビルド、Java 21向けMaven packageは成功しました。
Javaユニットテストは既存構成どおり追加せず、実API・MySQLでのCRUDと既存購入フローを検証します。

追加シナリオは `e2e/crud.spec.js` です。商品CRUDと画像・絞り込み、価格更新後の合計、販売終了商品の購入拒否、受取情報CRUD、注文情報の独立保存、他セッションの操作拒否、履歴削除後の注文再送、390px画面の保存・再読み込みを確認します。
保存した画像とAPI JSONは `artifacts/e2e/crud-*` に出力します。

現時点でE2Eは未完了です。MySQL80サービスが停止しており、APIはFlywayのDB接続段階で失敗しています。
`Start-Service MySQL80` は実行環境のサービス起動権限不足で失敗しました。
ログ: `.runtime/crud-e2e-api-diagnostic.log`。以下の過去の成功記録は今回のCRUD変更の検証結果ではありません。

開発DBの変更前バックアップはgitignore対象の `.runtime/backups/kusakari-before-crud-20261006.sql` に保存済みです。
V2マイグレーションは新API起動時に適用されます。現時点ではDBに未適用です。

## 2026-10-06: JavaScriptの簡素化

実行先: `C:\Users\t_abe\Desktop\kusakari-mvp`。

- 商品の絞り込みは`for...of`と条件分岐、価格順は昇順・降順それぞれの分岐にしました。不要な`useMemo`を削除しました。
- ページ内移動はHTMLリンクとCSSに変更し、スクロール用のJavaScriptを削除しました。カテゴリー選択の装飾は既存の`aria-pressed`をCSSで参照します。
- フロントの三項演算子、optional chaining、nullish代入、オブジェクトのスプレッドを、明示的な条件分岐または必要な引数へ置き換えました。Java起動スクリプトの入れ子の三項演算子も分岐にしました。
- HTTPはGET・PUT・POSTで必要な引数だけを渡します。商品・注文の取得は順に実行します。カートのrevision、操作中の再実行防止、注文再試行での同じ要求IDの保持は維持しています。
- コードの行数や配信容量の最小化ではなく、不要な処理の削除と読みやすい分岐への変更です。React、checkJs、API/MySQLの責務分離を維持しました。

| 検証 | 結果 |
|---|---|
| `npm run typecheck` | 成功 |
| `npm run lint` | 成功 |
| `npm run build:web` | 成功 |
| `npm run build:api` | 成功。Javaユニットテストは既存構成どおり実行せず |
| `npm run test:e2e` | 実API・専用MySQL `kusakari_e2e`・Chromiumで8件成功（50.9秒） |
| 変更したJS・JSX・CSSのPrettier確認 | 成功 |
| PC・390pxの画面 | 保存したスクリーンショットを目視確認。レイアウトと画像の表示を確認 |

既存の購入E2Eに、HTMLリンクによる移動、空白・小文字を含む品番検索、カテゴリーと検索の組み合わせ、価格降順の検証を追加しました。
注文要求の保持は、実APIが注文を保存した後でブラウザーへの応答だけを遮断するE2Eを追加して確認しました。再試行は同じ要求を送り、再読み込み後の注文1件と在庫減少1点を確認しました。正常応答はモックしていません。テストで購入した在庫だけを専用DBへ補充しています。

注文・再試行後のAPI JSONと画面は`artifacts/e2e/order-after-reload.*`、`artifacts/e2e/checkout-retry-after-reload.*`、一覧画面は`artifacts/e2e/catalog-desktop.png`、`artifacts/e2e/catalog-mobile.png`に保存しました。E2Eレポートは`artifacts/playwright-report/index.html`です。

フロント全体のPrettier確認では、今回変更していない14ファイルに整形警告がありました。無関係な整形変更は加えていません。依存・ロックファイル、Javaの業務コード、開発DB、Greenlyは変更していません。

## 2026-10-04: 作業フォルダの改名

作業フォルダを `C:\Users\hanam\Desktop\kusakari` から `C:\Users\hanam\Desktop\kusakari-mvp` に変更しました。SysOverRayのプロジェクト検出は固定フォルダ名ではなく、`package.json`、`backend/pom.xml`、`scripts/start.ps1`を確認する方式に変更しました。下記の2026-10-02記録は当時の実行場所を示すため旧パスを維持しています。

## 2026-10-04: SysOverRayと固定ポートの起動処理

| 検証 | 結果 |
|---|---|
| `dotnet build` (Release) | 成功。警告0、エラー0 |
| JavaScript型確認、lint、Viteビルド | すべて成功 |
| Windows PowerShell 5.1 | `sysover-ray2/start.ps1`が終了コード0。日本語を含むPowerShellファイル6本のUTF-8 BOMを確認 |
| `start.bat` | 作業フォルダ外から実行し、終了コード0。ブラウザーと専用WPF操作画面を起動 |
| `sysover-ray2/start.bat` | 作業フォルダ外から単独実行し、終了コード0。既存の専用画面を置き換え、可視画面と3操作ボタンを確認 |
| WPFの実画面 | `Kusakari 起動オーバーレイ`を直接表示して確認。API 8086・Web 5186が稼働中で、起動・再起動・停止ボタンを確認 |
| `stop.bat` | 終了コード0。固定ポートの待受0件、Kusakari専用Java/Nodeプロセス0件。WPFは停止中を表示 |
| WPFの起動ボタン | 停止状態から操作し、8086と5186へ再接続。Web経由のAPIが`application=kusakari`、`backend=spring-boot`、`status=ok`を返した |
| 再実行時のポート | `start.bat`を再実行しても5186/8086を使用。Web/APIのPIDが入れ替わったことを確認 |
| ブラウザー実画面 | 再読み込み後、4商品、在庫、商品画像を確認 |

確認したPIDの一例: 再実行前はWeb 37832/API 29972、再実行後はWeb 11460/API 33416。停止後に操作画面から再起動した際はWeb 28936/API 40216でした。PIDは実行ごとに変わります。
既存のブラウザータブがサービス再起動中の通信エラーを表示した場合、再読み込みで商品一覧に復帰することを確認しました。外部プロセスが固定ポートを占有する障害注入は実施していません。競合時に別ポートへ移らないことはスクリプトの分岐を確認しました。
この変更は起動・停止とWPF画面のみです。実MySQL/Chromiumの購入E2Eは再実行していません。以下の購入フロー結果は2026-10-02の記録です。

実施日: 2026-10-02。実行先: `C:\Users\hanam\Desktop\kusakari`。

## 結果

| 検証 | 結果 |
|---|---|
| JavaScript checkJs | 成功 |
| ESLint | 成功 |
| Vite production build | 成功。JS 251.79 kB / gzip 78.67 kB |
| Spring Boot Maven package | 成功。Java 21 target、実行JDK 25.0.1 |
| Java / JavaScript / CSS のPrettier確認 | 成功 |
| 実API・実MySQL・Chromium E2E | 最終実行 7 passed (13.6s) |
| PC / 390pxスマートフォンの画面 | スクリーンショットで目視確認。横方向のはみ出しなし |
| 起動済み状態でstart.bat再実行 | 同じWeb/APIプロセスを再利用 |
| stop.bat | 5186 / 8086の待受0件、専用Java/Nodeプロセス0件 |
| 再起動 | 5186経由のAPIプロキシと8086のAPI応答を確認 |
| setup.bat -SkipInstallの再実行 | 成功。既存テーブル・商品・注文を維持 |
| Greenlyとの分離 | 最新の停止・再起動区間で5173 / 8080のPIDが変わらないことを確認 |
| 開発DB保護 | 開発DB `kusakari` の注文0件。注文試験は `kusakari_e2e` のみ |

Javaのユニットテストは追加していません。Mavenの「Tests are skipped」はその構成に対応しており、業務フローの証拠は実API/MySQL E2Eです。
Maven実行時にJDK 25とJansiのnative-access警告が出ますが、コンパイル・JAR生成・実行は成功しています。

## E2Eの7シナリオ

1. API入力検証、カートrevision競合、確認金額と異なる注文の拒否、別セッションの分離、不許可Originの拒否。
2. 同じ確定要求の同時再送から注文1件のみを保存し、在庫が一度だけ減ること。
3. 2人が在庫1点の商品を同時購入した場合、200 / 409、在庫0、注文明細1件となること。
4. 検索・カテゴリー・価格順・商品詳細・数量変更・カート再読み込み・注文確定・履歴再読み込み。
5. 最寄り店舗の並べ替え、店舗変更後の在庫不足と購入制止、材料候補の選択、カートから削除。
6. モバイル表示、画像の正常表示、空検索の復帰、Escapeによるダイアログ終了。
7. 接続遮断を明示した障害注入と再試行による復帰。

正常系のAPIをモックしていません。テストはブラウザーとSpring Bootを専用ポート15186 / 18086で起動します。
同時注文は実APIを並列で呼び、MySQLの在庫と注文明細の件数も照合しています。

## 成果物

- `artifacts/e2e/catalog-desktop.png`
- `artifacts/e2e/catalog-mobile.png`
- `artifacts/e2e/order-after-reload.png`
- `artifacts/e2e/order-after-reload.json`
- `artifacts/e2e/concurrent-checkout.json`
- `artifacts/e2e/lifecycle.json`
- `artifacts/playwright-report/index.html`

注文試験ではオリーブ2鉢・税込13,600円がMySQLへ保存され、再読み込み後も同じ注文IDと明細を取得しました。
E2E購入で減った数量は専用DBにだけ補充します。

## 修正して再確認した点

- WindowsのPATH上のJavaランチャーが子JVMを作るため、初期の停止処理では子JVMが残りました。`java.home` の実行ファイルを直接起動するよう変更し、残留0件を確認しました。
- スマートフォンの見出しの折り返しを調整しました。
- 撮影用E2Eの見出し指定が改行を含むアクセシブル名に一致しなかったため、ページ内のlevel 1見出しを指定する形へ修正しました。失敗時traceは `artifacts/diagnostics/mobile-locator-failure/` に保存しています。
- 作業途中の古いGreenly PIDと最終時点のPIDは一致しませんでした。原因はこの検証では特定していません。直前・直後を採取し直した停止・再起動区間ではGreenly PIDが一致しており、両方の結果をlifecycle.jsonへ残しています。

## 範囲外

外部の実商品フィード、実店舗、決済、公開環境の認証、Greenlyからの呼び出しは検証していません。現在は接続を実装していないためです。
