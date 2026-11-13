# Stripe（テストモード）のカード決済と返金の実装（#132・#133）

## Context

[残りの決定](2026-11-12-remaining-decisions.md) の 1-1〜1-17 で、支払方法（カードと店頭払い）、請求の確定（注文時）、単位（お会計1回に PaymentIntent 1つ）、在庫の確保と30分の時間切れ、返金のルールを決めた。テーブル（`payments`・`stripe_events`・`refunds`、`orders.payment_id`、注文の状態 `PENDING_PAYMENT`）は V1 に入っている。

実装するにあたり、次のことを決める必要があった。

- Stripe を呼ぶ時点と、DB のトランザクション・ロックとの関係
- Webhook の検証、二重処理の防ぎ方、届く順番がずれたときの扱い
- 時間切れの動かし方と、取り消した注文に後から支払いが届いたときの扱い
- 返金を呼ぶ場所と、返金の結果の反映
- 鍵の確認（制限付きキーを使う）と、鍵・Stripe CLI の用意の仕方

## Decision

### 鍵と設定

- 環境変数は `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`（API 用）と `VITE_STRIPE_PUBLISHABLE_KEY`（画面用）。作業フォルダーの `.env` に入れる。`.env` は Git の対象外。値をログ・エラー応答・試験の成果物に出さない。
- 秘密鍵は `sk_test_`（標準のキー）か `rk_test_`（テストモードの制限付きキー）で、Webhook の値が `whsec_` で始まるときだけカード決済を使える。決定 1-15 の `sk_test_` だけから `rk_test_` に広げた。制限付きキーは、必要な権限（PaymentIntent の作成・取得・キャンセル、Refund の作成）だけを持たせられるため。本番の鍵（`sk_live_`・`rk_live_`）は受け付けない。
- 鍵がそろわないときは起動を止めない。`GET /api/payments/config` が `cardAvailable:false` を返し、画面はカードの選択肢を出さず店頭払いだけにする。画面の公開鍵が `pk_test_` で始まらないときも出さない。`POST /api/orders` にカードを送っても 409 `CARD_PAYMENT_UNAVAILABLE`。
- 制限付きキーに要る権限：PaymentIntents（書き込み）、Refunds（書き込み）。試験は Events（読み取り）も使う。

### お会計（`POST /api/orders`）

1. 1つのトランザクションで、カートと在庫をロックし、金額を DB から計算し、`payments` を1行（`PENDING`、全店舗の合計）と、受取店舗ごとの注文（`PENDING_PAYMENT`、`payment_id` つき）を作り、在庫を減らし、カートを空にする。通知はまだ送らない。
2. コミットした後で、PaymentIntent を作る（`amount` は `payments.amount_yen`、`currency=jpy`、`capture_method=automatic`、`automatic_payment_methods` でリダイレクトする支払方法を除く、`metadata.payment_id`、Idempotency-Key は `requestId`）。PaymentIntent の ID を `payments` に保存し、応答の `payment.clientSecret` で返す。
3. Stripe の呼び出しが失敗したら 502 `PAYMENT_PROVIDER_ERROR`。注文は支払い待ちのまま残り、同じ `requestId` の再送で同じ PaymentIntent（Idempotency-Key が同じ）を作り直して返す。再送しなければ時間切れで取り消す。
4. 店頭払いは今と同じ。決済を作らず、注文を `ACCEPTED` で作って通知する。
5. 画面は注文確認でカードを選ぶと「注文してカードで支払う」で注文を作り、Stripe の Payment Element（`@stripe/react-stripe-js`）を出す。カード情報は Stripe の入力欄から Stripe へ直接送られ、このサイトのサーバーを通らない。支払った後は「支払いを確認しています」を出し、注文の API（`GET /api/orders/{id}`）で全注文が `ACCEPTED` になったら注文完了を出す。画面での支払いの成功は信用しない。断られたら、注文が取り消されたことを確かめて知らせる。

### Webhook（`POST /api/payments/stripe/webhook`）

- 会員認証なし・CSRF の対象外。届いたままの本文（512 KB まで）で Stripe の署名を確かめ（時刻のずれは5分まで）、不正なら 400 `INVALID_WEBHOOK` で何もしない。
- 通知の ID を `stripe_events` に `INSERT IGNORE` で記録し、記録できなかった（処理済みの）通知は何もしない。記録と処理は1つのトランザクションで、処理が失敗したら記録ごと取り消され、Stripe の再送で処理し直す。
- `payment_intent.succeeded`：決済を `SUCCEEDED`、支払い待ちの注文を `ACCEPTED` にし、購入者と店舗に通知する。
- `payment_intent.payment_failed`：決済を `FAILED`、注文を `CANCELLED` にして在庫を戻し、購入者に通知する。コミットの後で PaymentIntent をキャンセルし、取り消した注文に同じ入力欄から支払えないようにする。
- `refund.created`・`refund.updated`・`refund.failed`・`charge.refunded`（Charge に返金の一覧が含まれるときだけ）：返金の状態を反映する（`succeeded` → `SUCCEEDED`、`failed`・`canceled` → `FAILED`）。
- `charge.dispute.created`（チャージバック）などそのほかの通知は、`stripe_events` に記録するだけ。
- 決済は PaymentIntent の ID で探し、まだ保存していなければ `metadata.payment_id` で探す。返金は Stripe の Refund の ID で探し、まだ保存していなければ `metadata.refund_id` で探す。
- ロックの順は、決済 → 注文（注文 ID の順）→ 在庫（商品 ID の昇順）。お会計とキャンセルの承認と同じ在庫の順なので、デッドロックしない。

### 時間切れ

- アプリ内の定期処理（`@Scheduled`、1分ごと、起動の10秒後から）が、作ってから `kusakari.ec.payment-timeout-minutes`（既定 30）分を過ぎた `PENDING` の決済を `EXPIRED` にし、注文を取り消して在庫を戻し、購入者に通知し、コミットの後で PaymentIntent をキャンセルする。1件ずつ別のトランザクションで行い、1件の失敗で残りを止めない。
- 取り消した後に支払い成功の通知が届いた（キャンセルの直前に支払われた）ときは、決済を `SUCCEEDED` にし、注文は取り消したままで、注文ごとに全額を返金する（返金を始めた人は null）。

### 返金（`RefundService`）

- 返金の処理を `RefundService.refundCancelledOrder(order, requestedBy)` の1か所にまとめる。キャンセル申請の承認（`OrderWorkflowService.decideCancellation`）から呼ぶ。店舗の閉鎖・組織の停止のまとめてキャンセル（#79・#109）も、注文を取り消した同じトランザクションの中でこれを呼べばよい。
- カードで支払い済み（決済が `SUCCEEDED`）の注文だけを返金する。店頭払いと未払いの注文は何もしない。
- 返金の行（`REQUESTED`、金額はその注文の合計）を呼ぶ側のトランザクションで作り、コミットの後で Stripe に Refund を作る（Idempotency-Key は `refund-` と注文 ID、`metadata.refund_id`・`metadata.order_id`）。Stripe を呼ぶ間はロックを持たない。注文1件に返金は1行（`uk_refunds_order`）で、承認は注文の行をロックして状態を確かめるので、同じ承認を2回送っても2回目は 409 になり、返金は1回だけ。
- 結果は Webhook で反映する。Stripe の呼び出し自体が失敗したときは、返金を `FAILED` にする。
- 返金の状態は注文の応答の `refundStatus` で返し、購入者・店舗・運営の注文の画面に出す。返金の失敗は店舗と運営の注文画面に、Stripe の管理画面で確かめて購入者に連絡するよう表示する。
- Stripe の管理画面から返金されたもの（受け取り後の返品など、決定 1-7）は、金額が一致し、まだ返金のない同じ決済の注文1件に、返金を始めた人なしで記録する。注文の状態は変えない。一致する注文がなければ `stripe_events` に残るだけ。

### 注文の画面

- 購入者（注文履歴）・店舗（店舗受け取り）・運営（全注文管理）の注文に、支払方法と、カードの支払いの状態（支払い待ち・支払い済み・支払いの失敗・期限切れ）、返金の状態（返金の処理中・返金済み・返金の失敗）を出す。注文の状態に「支払い待ち」を足した。

### 他の PC での用意（鍵の値はここに書かない）

1. Stripe のアカウントを作り、管理画面をテストモードにする（本番の審査は申し込まない）。
2. 開発者 → API キーで、公開可能キー（`pk_test_`）を控え、制限付きキー（`rk_test_`。PaymentIntents と Refunds を書き込み、Events を読み取り）を作る。標準の秘密鍵（`sk_test_`）でも動く。
3. Stripe CLI を入れる（`winget install Stripe.StripeCli`）。`stripe login` でアカウントにつなぐ。
4. `stripe listen --print-secret` で表示される Webhook の値（`whsec_`）を控える。
5. 作業フォルダーの `.env` に `STRIPE_SECRET_KEY=`、`STRIPE_WEBHOOK_SECRET=`、`VITE_STRIPE_PUBLISHABLE_KEY=` を書く。
6. 開発中にカードで支払うときは、別の端末で `stripe listen --events payment_intent.succeeded,payment_intent.payment_failed,refund.created,refund.updated,refund.failed,charge.refunded,charge.dispute.created --forward-to http://127.0.0.1:8086/api/payments/stripe/webhook`（今の Stripe CLI は `--events` が必須） を動かしたままにする（通知が届かないと、支払っても注文受付にならず、30分で取り消される）。

## Alternatives

- PaymentIntent をお会計のトランザクションの中で作る：Stripe の失敗で注文ごと取り消せて単純だが、Stripe を呼ぶ間、店舗と在庫の行をロックし続け、同じ店舗の他のお会計を待たせる。コミット後に作り、再送と時間切れで回復する形にした。
- 支払方法を `payment_method_types=card` でカードだけにする：このアカウントの API のバージョンでは拒否された（支払方法は管理画面で管理する形）。`automatic_payment_methods` でリダイレクトする支払方法だけを除いた。
- 支払いが断られても PaymentIntent を残し、同じ入力欄で別のカードを試せるようにする：決定 1-4 で、`payment_intent.payment_failed` で注文を取り消すと決めている。取り消した注文に支払えてしまわないよう、PaymentIntent もキャンセルする。
- 返金の結果を Refund を作った応答で反映する：決定（結果は Webhook で反映）と、管理画面からの返金も同じ経路で扱えることから、Webhook だけで反映する。Stripe に届かなかったときだけ、その場で失敗にする。
- `stripe_events` をエンティティにする：記録して重複を見るだけなので、`INSERT IGNORE` の1文にした。
- 時間切れを注文を見たときに判定する：誰も見ない注文の在庫が戻らないので、定期処理にした（決定 1-4）。
- Webhook の署名の検証に `Webhook.constructEvent` を使う：stripe-java が固定する API のバージョンと、通知の API のバージョンが違うと中身を読めないことがあるので、署名だけを確かめ、本文は JSON として読む。

## Consequences

- 支払い待ちの注文は、購入者の注文履歴・店舗・運営の注文の画面に「支払い待ち」で出る。店舗への通知は支払いの成功で届く。
- 画面を再読み込みしたり閉じたりすると、支払い待ちの注文の支払いを再開する画面はない。30分で取り消され、在庫が戻る。
- カードが断られたときは注文を取り消すので、カートは空になる。購入者はもう一度カートに入れて注文する。
- 返金の失敗をやり直す操作は作っていない。Stripe の管理画面で返金し直すと、Webhook で反映される。
- 時間切れの分数は設定値で、試験は作成日時を過去にずらして確かめる。
- 業務 E2E の決済の試験（`e2e/business-stripe.spec.js`）は、`.env` に鍵がそろい、Stripe CLI がある PC だけで動き、ない PC ではスキップする。試験は `stripe listen` を起動し、表示される Webhook の値が `.env` と同じことを（値を表示せずに）確かめる。
