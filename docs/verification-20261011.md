# 機能要件対応・出店者統合の確認記録

確認日: 2026-10-11

## 変更した範囲

- 購入者: アカウント操作、店舗紹介、通知、サンプル注文状態・キャンセル申請、Canvasの商品候補。
- 出店者: ダッシュボード、商品登録・編集、在庫・公開停止、受注・発送、売上・精算、店舗プロフィール、問い合わせ、出店申請、通知。
- 運営者: 出店審査、会員・出店者管理、商品審査、カテゴリ、全注文、手数料・精算。
- Canvas: 実APIによる庭の複製、実配置数量の変更、施工範囲の面積・距離、条件別サンプル植物候補、写真・3DからのPNG、ECへの購入導線。
- ECとCanvasのタブアイコンを統一。庭一覧・編集画面とEC各画面のヘッダーにも同じファビコンPNG画像を使用。PNGのSHA256一致も確認。
- Canvasの390px画面で発見した固定幅のはみ出しを修正。庭一覧・編集画面は縦に並べる。

[61項目の対応表](functional-requirements.md) に画面と実API／モックの区別を記録しています。No.1〜61の欠番・重複がないことを確認しました。

## 実APIとモックの境界

商品CRUD・店舗在庫・商品候補照合・カート・デモ注文・庭保存／複製は既存APIとMySQLを利用します。4素材の対応商品・在庫・素材コードは追加Flyway V3で登録します。実決済は行いません。

認証、パスワード操作、出店申請・審査、通知、サンプル発送・キャンセル申請、カテゴリ管理、精算、植物候補は画面モックです。状態は同一タブ内のメモリで共有し、再読み込みで初期化します。メール送信・アクセス制御・外部AIは実装していません。入力されたパスワードは保存しません。

商品画像URLは実APIへ保存します。ファイル選択はプレビューだけです。停止した商品の再公開は既存APIの範囲外です。サンプル取消申請は実注文取消・在庫返却を行いません。

## 確認結果

| 確認 | 結果 |
|---|---|
| EC型チェック・lint・Webビルド・Javaビルド | 成功 |
| Canvas lint・Webビルド・Python lint／コンパイル | 成功 |
| EC既存API/MySQLと画面E2E | 16件通過 |
| Canvas関連E2E | 13件通過。配置、編集、保存・復元、写真校正、施工範囲を確認 |
| 写真と3Dの完成イメージ出力 | 写真校正テストを追加実行して通過。PNGの寸法が元写真と一致 |
| EC・Canvas統合E2E | 1件通過。数量2→商品照合→実カート→再読み込み、保存503失敗時の画面維持と再試行、複製の独立ID・元データ保持 |
| モック連動 | 登録→会員一覧、出店申請→承認→出店者通知、発送→購入者通知、精算状態共有を確認 |
| 入力・不正受け渡し | 短いパスワード、却下理由未入力、負の数量、不明コードを確認 |
| 画面遷移 | 購入者・出店者・運営者21経路を表示し、スクリプト例外なし |
| PC／スマートフォン | EC・Canvasの画面を確認。390pxでページ全体の横はみ出しなし。表・素材列は領域内で横スクロール |
| 通常の開発起動 | EC 5186/API 8086、Canvas 5173/API 8080で起動・実データ取得を確認 |

E2Eは専用MySQL DBを使用しました。統合テストで作成した庭だけを後片付けし、開発用の庭は削除していません。正常系のAPIをモックへ差し替えていません。保存失敗ケースだけ意図的に503を注入しました。

Canvasビルドには既存の大きなJSチャンクの警告、Three.jsにはClock非推奨の警告が残ります。ビルドや今回の操作確認は成功しています。全61項目を個別に自動テストしたという意味ではなく、対応表と主要操作の確認結果です。

## 再実行

ECルート:

```powershell
npm run check
npm run test:e2e
npx playwright test --config playwright.integration.config.js
```

Canvasルート:

```powershell
npm run lint
npm run lint:api
npm run compile:api
npm run build:web
npm run test:e2e -- --grep "O\.|S\."
```

## スクリーンショット・証跡

- [出店者ダッシュボード](../artifacts/e2e/workspace-dashboard.png)
- [受注・発送](../artifacts/e2e/workspace-seller-orders.png)
- [運営管理](../artifacts/e2e/workspace-operator.png)
- [スマートフォンの運営画面](../artifacts/e2e/workspace-mobile.png)
- [CanvasからECの商品候補](../artifacts/e2e/canvas-to-ec.png)
- [Canvas完成イメージ](../artifacts/e2e/canvas-completion-image.png)
- [共通アイコンを反映したCanvas庭一覧](../artifacts/e2e/canvas-brand-desktop.png)
- [Canvasスマートフォン編集画面](../artifacts/e2e/canvas-editor-mobile.png)
- [実カートのJSON](../artifacts/e2e/canvas-integration-cart.json)
- [庭複製のJSON](../artifacts/e2e/canvas-integration-gardens.json)

写真校正後の完成イメージはCanvasの `artifacts/e2e/camera-calibrated-completion.png` に保存しています。元の出店者HTMLは参照資料として保持しています。

## ECヘッダー・商品一覧・出店者サイドバーの調整

### 反映内容

- 出店者画面を全幅にし、サイドバーを画面左端へ配置しました。出店者の各メニューと補助リンクにLucide Reactのアイコンを付けました。
- ヘッダーのデモ画面切り替えプルダウンを削除し、管理者への入口と管理者画面のヘッダーを「管理者画面」にしました。
- 「出店者」を「Kusakariについて」の隣へ移し、通知へのヘッダーリンクを削除しました。出店者通知はサイドバーから開きます。
- アカウントを人型アイコン付きの丸い背景で表示し、注文履歴には履歴アイコンを付けました。
- ECのバッグ表記・アイコンをカートへ統一しました。
- 商品一覧の左右をメインビジュアルと揃え、最大幅を1500pxにしました。スマートフォンでは余白を保持します。
- メインビジュアル下の3項目の案内帯と、商品一覧の受取店舗選択を削除しました。注文手続きの店舗選択は維持しています。
- メインビジュアルの2つの入口を「Canvasでお気に入りの植物を探す」に統合しました。鉛筆と定規のアイコンを使い、実際にCanvasへ遷移します。

### 確認結果

- `npm run check`：型確認・lint・フロントビルド・Javaビルド成功。
- `npm run test:e2e -- e2e/workspace.spec.js e2e/shop.spec.js`：実API・専用MySQLを使用する10件が成功。カート、注文、注文時の店舗変更、出店申請・承認・通知の既存動作を確認しました。
- 表示を伴うChromiumで通常起動中のEC（5186）を操作し、アカウント・注文履歴・管理者・出店者通知・カート・Canvas（5173）への遷移を確認しました。
- 320・390・768・1024・1200・1280・1440・1920pxでページ全体の横はみ出しがないことを確認しました。
- ブラウザー操作中のJavaScript例外は0件です。

### 今回の画面証跡

- [ECヘッダーと統合したCanvasボタン](../artifacts/e2e/ec-header-final.png)
- [幅を広げた商品一覧](../artifacts/e2e/ec-catalog-final.png)
- [出店者サイドバー](../artifacts/e2e/seller-sidebar-final.png)
- [スマートフォンのEC画面](../artifacts/e2e/ec-header-mobile-final.png)
- [スマートフォンの出店者画面](../artifacts/e2e/seller-sidebar-mobile-final.png)
- [通常起動環境のブラウザー確認結果](../artifacts/e2e/ui-request-verification.json)
