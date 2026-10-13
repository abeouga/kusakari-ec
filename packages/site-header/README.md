# 共通ヘッダー

ECのトップとCanvasの一覧・編集画面は、同じ `@kusakari/site-header` を使用します。

- `KusakariHeader.jsx`: ロゴ、上部の帯、ナビゲーション、アカウント、注文履歴、カート。
- `style.css`: ECを基準にした配色・余白・文字組み・画面幅別の表示。
- `onPanel`: EC内の既存ダイアログを開きます。
- `onNavigate`: EC内の画面切替、Canvasの未保存確認を呼び出します。
- `cartCount`: ECが取得した実際のカート件数です。Canvasでは取得していないため `—` と表示し、ツールチップでECで確認することを伝えます。件数を推測表示しません。

## 配布

ECはnpm workspaceでこのソースを参照します。Canvasは `vendor` に保存したnpmパッケージを参照します。Canvasのインストール・ビルド時にECのフォルダは不要です。

変更時はpackage.jsonとdata-header-versionのバージョンを更新し、ECのfrontend/package.jsonも合わせます。ECのルートで `npm install` を行った後、次のように配布します。出力先には移動後のCanvasのvendorフォルダも指定できます。

```powershell
npm pack ./packages/site-header --pack-destination ../kusakari-canvas/vendor
```

Canvasのfrontend/package.jsonの `@kusakari/site-header` を新しい `file:../vendor/kusakari-site-header-バージョン.tgz` に変更し、Canvasのルートで `npm install` を実行します。起動中のWeb開発サーバーは再起動して新しい依存を読み込み、両方のlint・ビルド・ブラウザ表示を確認します。

Canvas用のCSSを別途コピー・編集せず、変更の正本をこのフォルダに維持します。

## 開発時のアイコン配信

両方のVite設定で、共通ヘッダーは `optimizeDeps.exclude`、`lucide-react` は `optimizeDeps.include` に指定します。ヘッダーの依存アイコンを事前にまとめ、使用していない個別アイコンへの要求を防ぎます。設定変更後は開発サーバーを再起動して依存キャッシュを更新します。
