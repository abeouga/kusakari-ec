# Java一時ディレクトリの比較検証（2026-10-20）

## Context

EC起動時の `Unable to establish loopback connection` /
`Invalid argument: connect` を、一時ディレクトリのパス長が原因と説明していた。
当時のJavaプロセスのTEMP実測値は残っていないため、同じJDK 21.0.9で比較した。
稼働中のEC・Canvasは停止せず、HTTPクライアント初期化だけを行う別Javaプロセスを使用した。

## Method

Java自身からTEMP、TMP、java.io.tmpdir、jdk.net.unixdomain.tmpdirを出力した。
各条件につき新規JVMで3回実行し、HttpClient生成と、
Unixドメインソケットの自動パスでのbind・connect・acceptを確認した。
子プロセスのJavaオプション環境変数を除外し、指定した条件だけを適用した。
HTTPリクエストやCognito認証は実行していない。

検証プログラム、実行スクリプト、各回のログとJSONは
`artifacts/java-temp-investigation/` に保存した。
`python artifacts/java-temp-investigation/run.py unrestricted` および
`python artifacts/java-temp-investigation/run.py path-spelling` で再実行できる。
これらの引数は結果ファイルのラベルであり、権限を変更する機能ではない。
比較にはサンドボックス外で実行した結果を使用した。
サンドボックス内では別の `Permission denied` が発生するため、原因判定から除外した。

## Results

以下の長さはディレクトリ部分のASCII文字数で、ソケット名は含めない。

| Javaが使用する条件 | HttpClient | Unixソケット |
| --- | --- | --- |
| 継承TEMP `C:\Users\<短縮名>~1\AppData\Local\Temp`（36文字）、対策なし | 3/3失敗 | 3/3失敗 |
| 同じフォルダーを正式表記 `C:\Users\<ユーザー名>\AppData\Local\Temp`（38文字）で指定 | 3/3失敗 | 3/3失敗 |
| 継承TEMPのまま、プロパティで検証用フォルダー（69文字）を指定 | 3/3成功 | 3/3成功 |
| プロジェクト内の65文字のTEMP、対策なし | 3/3成功 | 3/3成功 |
| プロジェクト内の80文字のTEMP、対策なし | 3/3成功 | 3/3成功 |
| プロジェクト内の90・100・110文字のTEMP、対策なし | 各3/3成功 | 各3/3失敗 |
| 上記すべての長さで、プロパティによる69文字のフォルダー指定あり | 各3/3成功 | 各3/3成功 |

36・38文字の既定TEMPでは、以前のEC起動ログと同じ
`UnixDomainSockets.connect0` の `Invalid argument: connect` を再現した。
36文字のTEMPで生成されたソケットパス全体は53～54バイトだった。
同じ既定TEMPをプロパティで直接指定しても、短縮表記・正式表記とも各3回失敗した。
したがって、短縮表記だけが原因でもない。

一方、90文字以上の検証用TEMPでは、明示的なUnixソケット検証が
bind時の `Unix domain path too long` で失敗した。
これは以前のconnect時のエラーとは異なる。これらの条件でもHttpClient生成は成功した。

## Decision

今回の起動エラーを「パスが長いため」と断定した説明を訂正する。
より短い既定TEMPで失敗し、より長い別フォルダーで成功したため、
今回の比較ではパス長を原因とする説明は支持されない。

既存の `-Djdk.net.unixdomain.tmpdir` 対策は維持する。
確認できた効果は、ソケット作成先を既定TEMPから別フォルダーへ変更すると
初期化が成功すること。TEMP環境変数そのものを変更する対策ではない。
今回の制御比較で指定した場所は検証用フォルダーであり、
通常起動の `.runtime/java-tmp` の検証は
`windows-cognito-startup-verification.md` に記録した別の確認結果である。

## Alternatives

TEMPの短縮表記を正式表記に変えるだけでは解消しなかった。
既定TEMP内のデータ削除やOS設定変更は行わない。

## Consequences / Limitations

当時のTEMPを後から復元できたわけではなく、同じエラーを現在の環境で再現した結果である。
本検証はJava初期化の切り分けであり、API全体や認証E2Eの再実行ではない。
原因の切り分けは次節「追加切り分け（2026-10-21）」を参照。

## 追加切り分け（2026-10-21）

### Context

上記では、既定TEMPでconnectが失敗する原因を、権限・Windows・JDKのいずれとも断定できていなかった。
稼働中のEC・Canvasと既存の一時ファイルには触れず、新規作成した専用フォルダーだけで調べた。
作成したフォルダーとソケットファイルは、検証後にすべて削除した。

### Method

- `native_probe.py` / `native_matrix.py`：JavaなしでWinsockのAF_UNIX `bind`・`listen`・`connect` を直接呼ぶ。
- `native_matrix.py`：フォルダーの場所とACLを入れ替えて比較する。引数で親フォルダーを指定できる。
- `run-outside.bat` / `run-outside-java.bat`：エクスプローラー経由で起動し、
  エージェントアプリのプロセスツリー（Job）の外で同じ検証を行う。
- 結果は `matrix-*.json`、`outside-last.log`、`outside-java.log` に保存した。

### Results

ClaudeデスクトップアプリのJob内（`IsProcessInJob=True`、親は `Claude.exe` のMSIXパッケージ）：

| 新規フォルダーの親 | connect |
| --- | --- |
| `%USERPROFILE%`、`Documents`、`C:\Users\Public`、プロジェクト内 | 成功 |
| プロジェクト内＋TEMPと同じ継承なしACL | 成功 |
| `AppData`、`AppData\Local`、`AppData\Local\Programs`、`AppData\LocalLow`、`AppData\Roaming` | WSAEINVAL(10022) |
| `AppData\Local\Temp`（既定ACL、Authenticated Users追加、プロジェクト相当ACL） | WSAEINVAL(10022) |

- 失敗時も `bind`・`listen` は成功する。作成されたソケットファイルはAF_UNIXのreparseタグ
  `0x80000023` を持つが、`AppData` 配下では同じプロセスから開けず `ERROR_CANT_ACCESS_FILE`(1920) になった。
  プロジェクト内では同じタグを正常に読めた。
- Job内から `AppData\Local` 直下に作ったフォルダーは、Job外から見ると存在せず、実体は
  `AppData\Local\Packages\Claude_<パブリッシャーID>\LocalCache\Local\` にあった。
  MSIXパッケージアプリの `AppData` ファイルシステム仮想化（リダイレクト）が働いている。
- Job外（エクスプローラー起動、`IsProcessInJob=False`）では、`AppData\Local\Temp`・`AppData\Roaming`・
  `Documents`・プロジェクト内のすべてでconnectが成功した。
- Job外でJavaの `TempProbe` を対策なし・既定TEMP（`C:\Users\<短縮名>~1\AppData\Local\Temp`、36文字）で実行すると、
  `HttpClient=PASS`、`UnixSocket=PASS` だった。
- Codexデスクトップアプリも `OpenAI.Codex_<パブリッシャーID>` のMSIXパッケージである。
  以前の「サンドボックス外」の比較もCodexアプリ配下で実行しており、同じ仮想化の対象だったと考えられる。

### Decision

原因は、JDK・フォルダーの権限・パス長ではなく、MSIXパッケージのデスクトップアプリ配下のプロセスで、
`AppData` ツリーに作ったAF_UNIXソケット（reparseポイント）へ接続できないWindowsの挙動と判断する。
JDKはWindowsで `HttpClient` の内部パイプにAF_UNIXソケットを使い、既定ではTEMP（`AppData\Local\Temp`）に作るため、
Codex・Claudeから起動したEC APIだけが初期化に失敗した。

`-Djdk.net.unixdomain.tmpdir=<作業フォルダー>\.runtime\java-tmp` の対策は維持する。
`AppData` の外を指定するため、エージェントアプリ配下からの起動でも、通常起動でも動作する。

### Alternatives

- 対策を外す：利用者がエクスプローラーから `start.bat` を起動する場合は不要だが、
  エージェントアプリからの起動・再起動で再発するため採用しない。
- TEMP環境変数を変更する：Java以外の子プロセスにも影響するため採用しない。

### Limitations

- どのフィルタードライバー（`bindflt`、`bfs` 等）がreparseポイントの解決を拒否しているかは、
  `fltmc` に管理者権限が必要なため特定していない。確認できたのは、パッケージアプリのJob内に限り
  `AppData` 配下で再現し、Job外では再現しないことまでである。
- Job内から作ったソケットファイルはJob内から削除できず、Job外から削除した。
  JDKが失敗時に残したソケットファイルが既定TEMPに残っている可能性があるが、既存ファイルのため触れていない。
