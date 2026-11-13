# API契約

開発URL: `http://127.0.0.1:8086/api`。ブラウザーはViteの `/api` プロキシを使用します。
リクエストと応答はJSON、金額は税込JPYの整数、数量は1〜99の整数です。
未定義フィールド・必須項目の欠落・小数の個数は400です。

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/health` | アプリ名と状態 |
| GET | `/products` | 購入者に見える全店舗の商品。商品、SKU、単価、単位、画像、在庫、出所/更新日時と、商品の店舗（`sellerStoreId`・`sellerStoreName`。受取店舗も同じ）。`?storeId=1` でその店舗の商品だけ |
| GET | `/stores?latitude=35.6812&longitude=139.7671` | 指定地点から直線距離順の店舗。座標は両方省略可能。各店舗は`latitude`・`longitude`（店舗の緯度・経度）を含む |
| GET | `/cart` | ログインした会員のカート。初回はサーバーが作成。カートは店舗を持たず、各明細の `storeId`・`storeName` はその商品の店舗（受取店舗） |
| GET | `/cart`（#119） | 開いたときに、店舗の閉鎖・運営の停止・組織の停止・商品の削除で買えなくなった明細を外し、`removedItems`（`productId`・`name`・`storeName`・`quantity`・`reason`）で返す。外さなかったときは空の配列。各明細の `unavailableReason` は今は買えない理由（非公開・商品の停止・組織の受付停止など。買えるなら null） |
| — | 購入者の API（#108） | `/cart/**`・`/orders`・`/orders/{id}` 系・`/shopping-lists/**`・`/cart/shopping-lists/**` は、店舗側（`SHOP_OWNER`・`SHOP_STAFF`）と申請中（`SHOP_OWNER_APPLICANT`）のアカウントに 403 `BUYER_REQUIRED` を返す。購入者（`USER`）と運営（`ADMIN`）は使える |
| POST | `/products/references` | `{ "productIds": [...] }`。削除済みも含めて店舗名・在庫・`purchasable` を返す。`unavailableReason` は買えない理由（`purchasable` が true なら null）：`DELETED`・`STORE_CLOSED`・`STORE_SUSPENDED`・`ORGANIZATION_SUSPENDED`（庭の配置を外す）、`STORE_CLOSING`・`STORE_UNPUBLISHED`・`ORGANIZATION_NOT_ACCEPTING`・`PRODUCT_SUSPENDED`・`HIDDEN`・`OUT_OF_STOCK`（配置を残す）。在庫0は `purchasable:false` |
| POST・DELETE | `/seller/stores/{id}/closure`、`/operator/stores/{id}/closure` | 店舗の閉鎖を始める・取り消す（#79。オーナーか運営）。始めると閉鎖中になり新しい注文を受けない。未完了の注文（支払い待ち・注文受付・受取準備完了）がなくなると自動で閉鎖済み。運営が始めた閉鎖をオーナーが取り消すと403 `CLOSED_BY_OPERATOR`、閉鎖済みは409 `STORE_CLOSED` |
| POST | `/operator/stores/{id}/order-cancellations` | `{ "reason": "..." }`。閉鎖中の店舗の注文受付・受取準備完了の注文を運営がまとめてキャンセルし、在庫を戻し、カードで支払い済みなら返金し、購入者に通知する。`{ "cancelled": 件数, "store": 店舗 }` |
| GET | `/operator/organizations` | 組織の一覧。`status`（`ACTIVE`・`NOT_ACCEPTING`・`SUSPENDED`）、店舗数、未完了の注文の件数、履歴（#109） |
| POST | `/operator/organizations/{id}/stop-accepting`、`/resume`、`/order-cancellations` | 受付停止（理由必須）、受付停止の取り消し・停止の解除（理由は任意）、受付停止中の組織の未完了の注文のまとめてキャンセル（理由必須）。受付停止中に未完了の注文がなくなると自動で停止 |
| GET | `/stores/{id}` | 店舗の公開ページ。購入者・未ログインには公開中と閉鎖予定（`closingStartedAt` あり）の店舗だけを返し、非公開・停止・閉鎖済み・組織の停止は404。オーナー・担当者（ロール未割り当てを含む）・運営は扱える店舗を見られる |
| PUT | `/cart/items/{productId}` | `{ "quantity": 2, "revision": 0 }`。数量0で削除。受取店舗は商品の店舗で、その商品の在庫で検証 |
| POST | `/orders` | 下記の確定要求。受取店舗ごとに1件の注文を作り `{ "orders": [...], "payment": ... }`（店舗ID順）を返す。保存済みの同一要求は同じ注文群を返す。カードのときは `payment` に決済（`id`・`status`・`amountYen`・支払い待ちなら `clientSecret`）、店頭払いは `payment: null` |
| GET | `/payments/config` | `{ "cardAvailable": true }`。テスト用の Stripe の鍵がそろっていなければ false（画面はカードを出さない） |
| POST | `/payments/stripe/webhook` | Stripe の通知。会員認証なし・CSRF の対象外。届いたままの本文で署名を確かめ、不正なら400 `INVALID_WEBHOOK` で何もしない。処理済みの通知は `processed:false` で何もしない（[決済の決定](decisions/2026-11-13-stripe-card-payment.md)） |
| GET | `/orders` | ログインした会員の注文（履歴から非表示にしたものを除く）。単価・商品名は注文時の記録 |
| POST | `/materials/quote` | 材料コードごとの商品候補と必要金額。`storeId` を省くと全店舗の商品から候補を出す |
| GET | `/seller/orders?storeId=1` | 店舗の注文（受け渡しの画面）。店舗・運営向けの注文の応答は `sales`（`commissionRateBp`・`commissionYen`・`netYen`・`counted`）を含む。購入者向けの応答では null（#130） |
| GET | `/seller/sales/stores` | 注文実績を見られる店舗（`id`・`name`・`closedAt`）。閉鎖した店舗はオーナー・ORG_ADMIN・運営だけに出る（#130） |
| GET | `/seller/stores/{storeId}/sales` | 店舗の注文実績。`storeName`・`closedAt`・注文1件を1行の `orders`（注文金額・注文時の手数料率・手数料・差引額）・`totals`。見られない店舗は403。手数料は表示だけで、請求・精算はしない（[記録](decisions/2026-11-13-commission-and-closed-store-sales.md)） |
| GET | `/operator/stores/{storeId}/sales` | 運営が店舗管理から開く、同じ形の注文実績 |

## 注文要求

```json
{
  "requestId": "4502d427-883d-4a61-bd56-9f1177fbb81e",
  "revision": 2,
  "expectedTotalYen": 13600,
  "paymentMethod": "CARD"
}
```

`paymentMethod` は `CARD`（Stripe のテストモードのカード）か `PAY_AT_STORE`（店頭払い）。店頭払いの注文は `ACCEPTED`、カードの注文は `PENDING_PAYMENT` で作り、Stripe の支払い成功の通知で `ACCEPTED` にする。注文の応答の `paymentStatus`（`PENDING`/`SUCCEEDED`/`FAILED`/`EXPIRED`、店頭払いは null）と `refundStatus`（`REQUESTED`/`SUCCEEDED`/`FAILED`、返金なしは null）で、支払いと返金の状態を返す。

`requestId` は操作ごとにUUIDを生成し、通信失敗後の再試行では同じ値を使います。
レスポンスは `orders` 配列で、各要素は注文ID、状態、保存日時、受取店舗のID・名前、合計金額、商品ID/SKU/商品名/数量/単価/小計の明細です。各注文の明細は、その受取店舗の在庫から減算されます。注文群の合計は `expectedTotalYen` と一致します。
受取連絡先（氏名・電話・メール）は `/account/pickup-contact` で会員ごとに保存し、注文時に注文へ複製します。受取店舗は商品の店舗で、購入者が選ぶ操作はありません。カード番号は受け取りません（画面の Stripe の入力欄から Stripe へ直接送られます）。

## 画面案に対応したCRUD

| メソッド | パス | 内容 |
|---|---|---|
| POST | `/products` | 商品を `storeId` の店舗に登録し、その商品の在庫を設定（商品は1つの店舗に属し、在庫は商品ごとに1行）。在庫が1未満なら400 `STOCK_REQUIRED` で何も保存しない（編集の`PUT`は売り切れとして0を許可） |
| PUT | `/products/{id}` | 商品属性・画像と在庫を更新。`expectedStock`（省略時は`stock`）が現在の在庫と異なれば409 `STOCK_CHANGED` で何も保存しない |
| PUT | `/seller/products/{id}/stock` | `{storeId, expectedStock, stock}`。商品の在庫だけを更新（`storeId` は商品の店舗）。在庫行をロックして`expectedStock`と照合し、異なれば409 `STOCK_CHANGED` |
| DELETE | `/products/{id}` | 販売終了。カート・注文記録は保持 |
| GET/PUT/DELETE | `/account/pickup-contact` | 会員の受取連絡先（`recipientName`・`recipientPhone`・`contactEmail`）の取得・保存・削除 |
| PUT | `/orders/{id}` | 注文受付の自分の注文の受取者・連絡先を更新。支払方法は変えない |
| DELETE | `/orders/{id}` | 自分の注文を履歴から非表示。注文取消・在庫復元は行わない |

商品入力は `ProductRequest.java`、受取連絡先は `DeliveryDtos.java` を正本とします。
商品には生産者、日照、手入れレベル、用途、温度、耐暑性・耐乾性、樹齢、高さ、鉢径、科名、開花、季節管理、空間との相性、追加画像を含みます。
価格は1〜100,000円、店舗在庫は0〜10,000点、追加画像は4枚までです。
商品番号（`sku`）は登録時に空ならサーバーが `KS-yyyyMMdd-XXXXXX` 形式で自動採番します。更新時は空または現在の値だけを受け付け、異なる値は409 `SKU_IMMUTABLE` で何も保存しません。
高さ（`heightCm`）は省略可能で、指定する場合は10〜1500cmです（庭オブジェクトの高さと同じ範囲）。
登録で商品番号が重複した場合は409 `SKU_EXISTS`、入力不正・未知フィールドは400です。

受け取りは店舗受け取りだけで、配送・送料はありません（[配送を作らない経緯](decisions/2026-11-05-remove-address-management.md)、将来の発送は #120）。
カート・注文の応答の `details` は `paymentMethod`, `recipientName`, `recipientPhone`, `contactEmail` だけを持ちます。カートの `paymentMethod` はお会計まで `NONE`、注文は `CARD` か `PAY_AT_STORE` です。
金額は商品の合計だけです（カートの `subtotalYen` は `totalYen` と同じ値）。注文後の金額は固定です。他人の注文への編集・削除は404です。

## 材料から商品への対応付け

```json
{
  "items": [
    { "materialCode": "plant.olive", "quantity": 1, "unit": "piece" },
    { "materialCode": "plant.herb", "quantity": 2, "unit": "piece" }
  ]
}
```

`storeId`（任意）を付けるとその店舗の商品だけから探します。省くと全店舗の商品から探します。
材料ごとに `materialCode / status / candidates` を返します。
候補には `product / purchaseQuantity / lineTotalYen / available` を含めます。
`plant.herb` はラベンダーとローズマリーの2候補を返し、どちらを購入するかを人が選びます。
代替候補の小計を全部足した金額を「材料全体の合計」とは扱いません。選択後のカートが正しい合計です。

| 材料コード | 商品 |
|---|---|
| plant.olive | オリーブ |
| plant.lavender | ラベンダー |
| plant.rosemary | ローズマリー |
| plant.monstera | モンステラ |
| plant.herb | ラベンダー、ローズマリー |

50行まで受け付け、未対応コードは `UNMAPPED` です。単位は `piece`（鉢）のみです。

### Kusakari Canvas（仮称）からの商品候補連携

1. Canvas側でGardenDocumentの配置内容を商品候補照合用の `materialCode / quantity / unit` へ変換します。Three.jsのScene/Object3Dは送信しません。
2. Kusakariの `/materials/quote` に送り、利用者が候補商品を選択します。受取店舗は選んだ商品の店舗です。
3. 選択した `productId / quantity` をECのカートへ追加します。
4. EC側で最新価格・在庫を確認し、注文確認画面で利用者が確定します。

Canvasは配置素材から本APIへ自動照合し、既存のカートAPIで追加・数量変更・削除を行います。Canvas許可Originは `KUSAKARI_EC_CANVAS_ORIGIN`（既定 `http://127.0.0.1:5173`）です。許可したOriginに限りCookie付きCORSとContent-Typeのプリフライトを許可します。既存のHttpOnly/SameSite=Strict Cookieを同一ホストのECとCanvasで共有します。EC ViteのCORSミドルウェアは無効とし、APIプロキシ先のLocalApiFilterで処理します。
クライアントからの価格やownerIdは採用しません。

## エラー

```json
{ "code": "CART_CHANGED", "message": "別の操作でカートが更新されました。最新の内容を確認してください。" }
```

- 400 `INVALID_INPUT` / `INVALID_LOCATION`: 不正な入力。
- 403 `ORIGIN_REJECTED`: 許可していないブラウザーOriginまたはHost。
- 404 `STORE_NOT_FOUND` / `PRODUCT_NOT_FOUND`: 存在しないID。
- 409 `CART_CHANGED`: 古いrevision。
- 409 `OUT_OF_STOCK`: 商品の在庫不足。
- 409 `PRICE_CHANGED`: 確認した金額と現在の合計が異なる。
- 409 `EMPTY_CART`: 空カートの注文。
- 409 `REQUEST_REUSED`: 同じ注文キーを異なるrevision/金額で再利用。
- 503 `DATABASE_UNAVAILABLE`: DB処理失敗。例外詳細・SQL・認証情報は応答に含めない。

開発Originは `http://127.0.0.1:5186`、E2Eでは `http://127.0.0.1:15186` です。
カートと注文はログインした会員のものです。セッションのCookieは他人へ共有しません。
