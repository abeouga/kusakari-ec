# 他の PC を新しい DB 構成（v3）へ移す手順（issue #113）

## Context

店舗側アカウントの作り直し（#103）で、EC の DB は新しい構成（v3、Flyway の `V1__schema.sql` から）に置き換わった。旧構成（V1〜V15）の DB を持つ PC では、新しい main を取得しただけでは API が起動しない（Flyway の履歴が合わない）。既存のデータは移行しない（#102 決定事項2）ので、EC と Canvas の DB を初期化して作り直す。

初期化のスクリプト（EC の `DB-reset.bat`、Canvas の `DB-reset.bat`）はそれぞれの文書（[EC](database-reset.md)、Canvas の `docs/database-reset.md`）にある。この文書は、他の PC が両方を正しい順番で行い、使える状態に戻すまでの手順をまとめる。

## Decision

### 初期化で失われるもの（元に戻せない）

- EC の `kusakari`（開発用）と `kusakari_e2e`（E2E 用）の全データ：会員、組織・店舗・商品・在庫、カート・注文・決済の記録、通知、出店申請
- Canvas の `kusakari_canvas` と `kusakari_canvas_e2e` の全データ：庭、写真、配置、画像の履歴
- 消す前のバックアップは各リポジトリの `.runtime\backups` に残る（会員の情報を含むので共有しない）。バックアップから新しい構成へ戻す手段はない
- Cognito のユーザーは消えない。初期化の後、初めてログインしたときに購入者（`USER`）の会員が作られる（[会員の種別とロールの値](member-roles.md)）

### 手順

EC と Canvas のフォルダーで、それぞれ次の順に行う。PowerShell は EC・Canvas のフォルダーで開く。

1. 両方の `stop.bat` で、Web と API を止める
2. 両方で `git fetch origin` し、`main` を取得する（`git switch main` → `git pull`）。自分の変更があるときは、先にコミットするか退避する
3. EC で依存を入れ直す：`npm install`。**`npm ci` は使わない**（Windows で `frontend` のソースを消したことがある）
4. EC で API を作り直す：`npm run build:api`。初期化の後の確認は、このフォルダーの API の JAR でテーブルを作るため、古い JAR のままにしない
5. EC で `DB-reset.bat -DryRun` を実行し、表示された MySQL・ポート・DB（`kusakari`、`kusakari_e2e`）が自分の PC のものかを確かめる。Windows の確認（ユーザー アカウント制御）では「はい」を選ぶ
6. EC で `DB-reset.bat` を実行し、`RESET kusakari` と入力する。「EC の DB の初期化が完了しました」と出るまで待つ
7. Canvas で `DB-reset.bat -DryRun` → `DB-reset.bat`（`RESET kusakari_canvas` と入力）。EC だけを初期化すると、庭の持ち主（EC の会員 ID）と買い物リストの庭 ID が食い違うので、必ず両方を行う
8. 両方の `start.bat` で起動する
9. ブラウザーで EC（http://127.0.0.1:5186）にログインし、商品一覧・カート・Canvas の庭の一覧が開けることを確かめる

### 権限の付け方（開発用）

初期化の後は、どのアカウントも購入者（`USER`）として作られる。運営や店舗側として使うアカウントは、一度ログインしてから、EC のフォルダーで次を実行する（[会員の種別とロールの値](member-roles.md)）。

- 運営：`powershell -ExecutionPolicy Bypass -File scripts\set-member-role.ps1 -Email <メールアドレス> -Role ADMIN`
- サンプルの組織（店舗1〜3）のオーナー：`... -Role SHOP_OWNER -OrganizationId 1`
- 店舗の担当者：`... -Role SHOP_STAFF -StoreId 1 -StoreRole MANAGER`（または `STAFF`）

ふだんの運用では、出店申請（企業様向けの登録 → 申請 → 運営の承認）と、店舗の招待キーでの登録を使う。店舗側のアカウント（`SHOP_OWNER`・`SHOP_STAFF`）と申請中のアカウントでは、カート・注文・Canvas を使えない（#108）。購入を試すときは購入者のアカウントを使う。

### カード決済（Stripe のテストモード）

鍵がなくても EC は起動し、お会計は店頭払いだけになる。カードの流れを試す PC だけ、[Windows のセットアップ](windows-setup.md) の「カード決済（Stripe のテストモード）を使うとき」のとおり、テスト用の鍵（`pk_test_` と `rk_test_` または `sk_test_`）、Webhook の値（`whsec_`）、Stripe CLI を用意し、`.env` に書いて `start.bat` で起動し直す。鍵の値は Git・ログ・チャットに書かない。

### うまくいかないとき

- 初期化の確認が「Found more than one migration with version 1」で止まる：古いビルドの残りが `backend\target` にある。EC の `backend` で `.\mvnw.cmd clean package -DskipTests` を実行してから `setup.bat` を実行する（空の DB にテーブルが作られる）
- `DB-reset.bat` が「対象を確かめられない」で止まる：何も消していない。表示された理由（ポート、ほかのプロセスの接続、マイグレーション履歴がない DB など）を直してからやり直す。ほかの作業フォルダーの API や E2E が DB に接続していると止まる
- 初期化の後に `start.bat` で API が起動しない：`setup.bat` を実行して、接続設定とマイグレーションを確かめ直す

## Alternatives

- 旧構成の DB を移行する：#102 で既存のデータを移行しないと決めているので作らない
- EC と Canvas の初期化を1つのスクリプトにまとめる：Canvas は別のリポジトリで、置き場所が PC によって違う（#106 の決定）。この文書で順番を固定し、スクリプトは分けたままにする

## Consequences

- 移行した PC では、以前の会員・店舗・注文・庭は戻らない。必要なものは初期化の前に画面で控える
- 開発用の権限は、初期化のたびにスクリプトで付け直す必要がある
- この手順の確認：2026-11-13 時点で、この PC の開発用の DB（3306）では試していない。初期化の本体の確認は [EC の記録](database-reset.md) と Canvas の記録のとおり、使い捨ての MySQL（33999）で行った。別の PC での通しの実行はまだ行っていない（#113 の完了条件の残り）
