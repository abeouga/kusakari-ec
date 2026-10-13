# EC SysOverRay 起動・停止・再起動の検証

検証日: 2026-10-13。実際に表示されたEC SysOverRayのボタンをWindows UI Automationで操作した。

## 原因と修正

1. scripts/common.ps1: npmが起動したViteの引数には node_modules\.bin\..\vite が含まれる。従来の文字列比較では自身のWebプロセスを認識できず、5186番を別プロセスの使用と判定していた。引数の絶対パスを正規化し、対象パスとの完全一致で所有プロセスを識別するよう修正。
2. sysover-ray2/SysOverRay/KusakariEcController.cs: 起動・停止スクリプトの標準出力、標準エラー、終了コードをoverlay.logに記録。Windows PowerShell 5.1を明示し、日本語をUTF-8で取得する。サービスへのパイプ継承で操作が完了待ちにならないよう、終了後のログ排出待ちを2秒に制限。

## 実行結果

.NET Release publish成功。修正後の同一SysOverRayプロセス（PID 40772）で以下を確認。

| 操作 | 結果 | 証跡 |
| --- | --- | --- |
| 再起動 | 11:59:49完了。API PID17796、Web PID17200へ交代。両ヘルスチェック正常 | artifacts/launcher-validation/restarted.json / .png |
| 停止 | 12:00:19完了。8086・5186の待受なし | artifacts/launcher-validation/stopped.json / .png |
| 起動失敗時のログ | 5186に一時的なTCPリスナーを置いて起動。別プロセスのポート使用を拒否し、stderrの日本語詳細とexit=1を記録。リスナーはfinallyで解放 | artifacts/launcher-validation/rejected.json / .png |
| 通常起動 | 12:03:27完了。API PID41100、Web PID29728。両ヘルスチェック正常 | artifacts/launcher-validation/started.json / .png |

ヘルスチェック: http://127.0.0.1:8086/api/health と http://127.0.0.1:5186/api/health が application=kusakari-ec、status=ok を返した。成功・失敗とも操作後にボタンが再度有効になることを確認。起動・再起動画面と失敗画面の画像も確認した。

ログ: C:\Users\t_abe\AppData\Local\KusakariOverlay\overlay.log。今回の検証区間を artifacts/launcher-validation/overlay-validation.log に保存。

Canvasは8080（PID24232）、5173（PID14288）のまま継続稼働。ECは最後に稼働状態で残した。DB設定やデータの変更は行っていない。

## 以前の診断の訂正

MySQL一時設定ファイルの削除時のアクセス拒否はPowerShell 7から診断した際の結果であり、SysOverRayが使用するWindows PowerShell 5.1で同じ失敗は再現しなかった。SysOverRayの実際の起動失敗として確認できた原因は、上記のViteプロセス識別である。