# 共通ヘッダー

ECのトップとCanvasの一覧・編集画面は、同じ `@kusakari/site-header` を使用します。

- `KusakariHeader.jsx`: ロゴ、上部の帯、ナビゲーション、アカウント、注文履歴、カート。
- `style.css`: ECを基準にした配色・余白・文字組み・画面幅別の表示。
- `onPanel`: EC内の既存ダイアログを開きます。
- ログインボタンは `login` パネルを開きます。CanvasではECの `/?panel=login` へのリンクとなり、未保存確認を経由します。
- 注文履歴（0.1.13）: `onPanel` の有無にかかわらず、ECのアカウント画面 `/purchases` へのリンクです。旧 `/?panel=orders` はECで `/purchases` へ置き換えます。
- `onNavigate`: EC内の画面切替、Canvasの未保存確認を呼び出します。
- `authenticated`（0.1.7）: 認証済みの場合はログインボタンを表示しません。ECはセッション取得結果、Canvasは認証ゲートの確認結果を渡します。
- ナビは画面中央に配置します（0.1.12）。1400px以下は従来どおり2段に折り返します。
- ヘッダーの高さ（0.1.11）: 帯26px・本体64px（狭い画面は56px）に縮小し、内部の要素を縦中央に揃えました。ECの旧 `.site-header` CSSは削除済みで、見た目の正本はこのCSSだけです。
- アカウントボタン（0.1.9）は `authenticated` が真の場合だけ表示します。未ログイン・認証確認中は表示しません。
- `showAdmin`（0.1.7）: 管理者画面へのリンクの表示条件です。両アプリとも、認証済みでメールが `test.admin@example.com`、権限が `ADMIN` の場合だけ渡します。既定は非表示です。
- `showSeller`（0.1.8）: 出店者画面へのリンクの表示条件です。両アプリとも、認証済みで権限が `SELLER` または `ADMIN` の場合だけ渡します。一般会員・未ログイン・認証確認中は非表示です。
- `cartCount`: ECが取得した実際のカート件数です。CanvasでもEC APIから取得した件数を渡します。未取得時は `—` と表示します。件数を推測表示しません。

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

- `cartText`（0.1.5）: 画面上のカートリンク文言。既定は「カート」、Canvasは「ECでカートを確認」。遷移先は共通のEC /cartです。
