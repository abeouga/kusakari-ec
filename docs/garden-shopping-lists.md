# 庭の買い物リスト

## Context

Canvasの庭ごとの買い物リストと、ECの購入用カートを分けて持つ。庭に置いた物と、ECの商品カードから庭へ追加した商品から、購入する商品を選んでカートへ入れる。買い物リストは購入者（`USER`）と運営（`ADMIN`）の機能で、店舗側のアカウントと申請中のアカウントにはAPIが403 `BUYER_REQUIRED` を返す（[会員の種別とロールの値](member-roles.md)）。

## Decision

### カートへの入口

- 庭の商品をカートへ入れる入口は、カート画面の「庭に設置したものから追加」ポップアップだけとする。庭専用の一覧・詳細画面は持たない。
- `/cart?garden={gardenId}` でカート画面を開くと、ポップアップを自動で開き、その庭を選ぶ。`?garden=` は先頭の庭を選ぶ。ポップアップを閉じるとクエリを外し、再読み込みで再表示しない。Canvasの「リストを確認」と、商品カードの追加先ダイアログのリンクはこのURLを開く。
- 古いURL `/cart/gardens/{gardenId}` と `/cart#garden-shopping-lists` は、履歴を増やさずに上のURLへ置き換える。
- カートはログインした会員だけが使えるので、未ログインで `/cart?garden=...` を開くと専用ログイン画面へ移動し、ログイン後に同じURLへ戻る（[未ログイン時のカート利用](decisions/2026-11-09-login-required-cart.md)）。
- 見送りがあった追加結果の「庭から選び直す」は、同じ庭のポップアップを開く。

### 必要数とカートへの追加

- ECサーバーがCanvasの集計APIを呼ぶ。接続先は `KUSAKARI_CANVAS_API_URL`。写真や3D構成は受け取らず、商品ID・材料コードからECの商品・価格・在庫を解決する。受取店舗は商品の店舗で、購入者は選ばない。材料コードに複数の候補商品がある行は、購入する商品を選ばせる。
- 必要数はCanvasの配置数とする。ECで追加した商品は「1点以上必要」として扱い、必要数を `max(配置数, 1)` とする（配置数に足さない）。
- 選択分をカートへ加算するAPIは `POST /api/cart/shopping-lists/{gardenId}/items`。庭の版（`gardenRevision`）・EC追加分の版（`listRevision`）・カートのrevision、行キーと商品IDだけを受け取り、数量はサーバーで取り直す。在庫不足・販売終了・数量上限・種類上限は商品ごとに見送り、成功分を1つのトランザクションで追加する。同じ商品の数量は合算する。庭またはEC追加分の版が古いときは変更せず409（`GARDEN_CHANGED`・`SHOPPING_LIST_CHANGED`）を返す。
- 庭を編集してもカートの数量は変えない。買い物リストはカートへの追加後も残る。カートに入れた後の数量は通常どおり編集できる。

### 商品カードからの追加

- 商品カードのカート追加ボタンの左にリスト追加ボタンを置く。押すと、庭プロジェクト名・サムネイル付きの追加先ダイアログを表示する。庭が5件以上あるときは名前で検索できる。
- `PUT /api/shopping-lists/{gardenId}/items/{productId}` で1点を保存する。同じ商品・庭・アカウントへの再送は冪等で、数量を増やさない。在庫なしの商品も保存でき、購入時に在庫を確かめる。販売終了の商品は保存しない（409 `PRODUCT_ARCHIVED`）。1庭につき追加分は200種類まで（`SHOPPING_LIST_LIMIT`）。
- 庭の存在と所有者はCanvasで確かめる。ECの保存キーは、サーバーで解決した会員のカートID・庭ID・商品ID。クライアントから所有者を指定できない。
- ダイアログの庭一覧の最下部に「新しい庭プロジェクトを作成」カードを置く。押すと `POST /api/shopping-lists/items/{productId}` が、Canvasの `POST /api/gardens` で「買い物リストN」を作り、その庭へ商品を1点保存して詳細を返す。Nは、会員の庭名のうち「買い物リスト＋数字」に一致するものの最大値＋1（なければ1）。名前の一意制約はなく、欠番は埋めない。庭の作成と保存は別トランザクションで、保存に失敗すると空の庭が残る。
- 手動の追加とカートへの追加は、同じ会員カートのロックで直列にする。CanvasとのHTTP通信はロックを取る前に終える。
- `GET /api/shopping-lists/{gardenId}/saved-items` は、会員のカートIDに対するEC追加分（商品ID・商品名）と `listRevision` を返す。Canvasはこれと編集中の配置を画面上で合わせて表示する。このAPIはCanvasへ通信しない。

### 庭のサムネイル

- 庭のサムネイルは、最新の生成履歴のAfter画像を優先し、次に現在のrevisionのCanvasキャプチャ、最後に現在の配置から描く配置図を使う。履歴の削除や配置の変更は、一覧のポーリング（3秒ごと、画面が非表示のあいだは止める）で反映する。
- Canvasは `garden_thumbnails` に、読み込み・保存が落ち着いた時点の640×400px以内のPNGを保存する。写真モードでは写真と配置を合成する。撮影中の操作ハンドルは含めない。
- ECは自分の `/api/shopping-lists/{gardenId}/thumbnail` から画像を取得し、Canvas側で所有者を確かめる。一覧のJSONには画像本体を含めない。

## Alternatives

- Canvasが直接カートを更新する方式、リスト全件や配置商品の自動追加は、購入する商品を選ぶ手順がなくなるため採用しない。
- 商品カードから3D配置を自動で作る方式は、位置や配置数を決められないため採用しない。
- 新しい庭の名前を入力させる方式は、「押すだけで追加する」要件に合わないため採用しない。
- 庭専用の詳細画面を残す方式は、入口が2つになるため採用しない。
- 未撮影の古い庭を画像なしにせず、配置図で表示する。サムネイルのために有料の画像生成を呼び出さない。

## Consequences

- Canvasの配置とECの商品選択を別々に保存し、表示するときに合わせる。EC追加分はMySQLに保存され、再読み込み・再ログイン後も残る。EC追加分だけを削除する操作はない。
- Canvasが止まっているときは、ポップアップと追加先ダイアログだけに取得エラーと再取得を表示し、ECの通常のカート・注文の操作は続けられる。Canvasが応答しないときは503を返し、庭は作られない。
- Canvasで庭を削除すると所有者の確認が404になり、その庭のリストは表示・操作できなくなる。EC側の保存行は残る。
- ポップアップではカートにある商品を選べないので、「カートの数量に加算する」操作はない。見送り理由は各行に表示する。
- サムネイルの生成画像は最後に生成した時点の画像で、その後の配置の変更では作り直さない。

## 検証

- ポップアップとカートへの追加：`npx playwright test --config e2e/configs/playwright.business.config.js business-canvas-cart-popup business-cart-add-from-garden`（実Cognito・実API・専用MySQL）。
- 商品カードからの追加：`npx playwright test --config e2e/configs/playwright.shopping-picker.config.js`。
- 既存の購入・出品の回帰：`npm run test:shopping-regression`。
- Canvas側：`npm run test:shopping`。APIの契約はCanvasの `docs/garden-shopping-lists.md` にある。

経緯と過去の検証結果は [kusakari-document の記録](https://github.com/abeouga/kusakari-document/blob/main/開発の記録/kusakari-ec/商品とカート/2026-10-16_garden-shopping-lists_経緯.md) にある。
