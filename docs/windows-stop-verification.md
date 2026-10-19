# Windows PowerShell 5.1の停止処理（2026-10-19）

## 原因と修正

`Get-NormalizedCommandPaths` は全Java/Nodeプロセスの起動引数を走査する。
Windows PowerShell 5.1の.NET Frameworkでは、`Path.IsPathRooted` も
パスとして不正な文字に対して例外を投げる。従来はこの呼び出しがtryの外にあり、
別のNodeプロセスのインラインコード等によって、所有判定と停止処理全体が中断していた。

`IsPathRooted` と `GetFullPath` を同じtry内に置き、不正な引数だけを無視するよう修正。
この作業フォルダのJAR/Viteの絶対パス一致と、PID・作成日時・種別による再確認は維持する。
`common.ps1` はUTF-8 BOM付きで保存した。

## 検証

この不具合はOSの.NET実装とプロセス起動引数に依存するため、Chromium E2Eではなく
実際のWindows PowerShell 5.1で停止スクリプトを検証した。

- `inline < code` に対する旧パス判定の例外を再現。
- 修正版で不正な引数を無視して対象JARを検出し、別フォルダの同名JARを一致させないことを確認。
- 実際のNodeプロセス2件に、旧判定で例外を発生させる引数があったことを確認（引数内容は保存しない）。
- 所有判定したECのWeb/APIを停止し、5186/8086の解放を確認。
- 2回目の停止も成功。
- 実行時にCanvasの5173/8080リスナーは存在しなかったため、稼働中Canvasの維持は未検証。
- SysOverRayのボタン操作自体は未検証。同ボタンが呼ぶ実際の `scripts/stop.ps1` を使用した。

ローカル検証スクリプトと結果はGit対象外の `artifacts/stop-verification/` に保存した。
