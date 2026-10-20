# Windows通常起動とCognitoの確認（2026-10-20）

## Context

Cognito設定はECの`.env`に保存済みだったが、以前のJava起動エラー対策は
手動起動時の`JAVA_TOOL_OPTIONS`だけに設定されていた。
通常の`start.bat -NoBrowser`ではCognito設定を読めても、
`Unable to establish loopback connection` / `Invalid argument: connect`でAPIが起動しなかった。

## Decision

`scripts/start.ps1`で、この作業フォルダーの`.runtime/java-tmp`を作り、
Java起動引数に`-Djdk.net.unixdomain.tmpdir`を明示する。
親シェルの一時ディレクトリや一時的な環境変数に依存させない。
PowerShellファイルはUTF-8 BOM付きで保持する。

このPCのEC・Canvasの`.env`には、既存の
`node scripts/configure-cognito.mjs --canvas-root <Canvasの作業フォルダー>`
で公開開発設定を適用した。DBパスワード等は保持し、Gitには含めない。
ECの通常起動は`.env`のCognito設定を読み込み、
CanvasもEC Web 5186 / API 8086への接続先を明示する。

## Alternatives

手動起動のたびに`JAVA_TOOL_OPTIONS`を設定する方法は、
`start.bat`やSysOverRayの再起動に引き継がれる保証がないため採用しない。
認証省略や別ポートへの回避は行わない。

## Consequences

EC APIの通常起動で作業フォルダー内の専用ソケットディレクトリを使用する。
`npm run dev:api`の起動経路自体は変更していない。
追加の比較検証で、障害はパス長ではなく、MSIXパッケージのデスクトップアプリ
（Codex・Claude）配下から起動した場合に限り、`AppData` 配下でAF_UNIX接続が失敗することが原因と分かった。
エクスプローラーから通常起動した場合、既定TEMPのままでも失敗しない。
詳細は [Java一時ディレクトリの比較検証](java-temp-investigation.md) を参照。

## Validation

- `npm run check`：checkJs・lint・フロントビルド・Javaビルド成功。
- ECの`start.bat -NoBrowser`：API 8086 / Web 5186で起動。
- SysOverRay：可視ウィンドウ、API/Web稼働表示と操作ボタンを確認。
  「再起動」実行後も両方稼働中、「ブラウザを開く」も操作確認。
- Canvasの`start.bat -NoBrowser`：API 8080 / Web 5173で起動。
- 通常ポートの読取中心スモーク検証：USER・SELLER・ADMINの3件成功。
  実Cognitoログイン、EC商品・カートGET、権限API、Canvas一覧と再読み込みを確認。
  開発用の商品・カート・注文・庭は編集しない。
- 専用MySQLの実Cognito E2E：マウス・タッチの2件成功。
  Canvasへの移動、庭の保存・再読み込み、実寸入力の外側操作を確認。
  証拠はCanvasの`artifacts/cognito-validation/`に保存。

通常起動のスクリーンショットと安全なAPI結果要約は
`artifacts/startup-validation/`、起動ログは`.runtime/`に保存する。
認証情報を含めないためブラウザーtraceは無効。
今回の検証ではブラウザー自動起動を省略する`-NoBrowser`だけを付けており、
API・Web・Cognitoの起動経路は通常と同じ。
