# 店舗の招待キーと、人事のロールの権限（#111、#112）

## Context

店舗側のアカウントは、組織のオーナー（`SHOP_OWNER`）と、店舗の担当者（`SHOP_STAFF`）に分かれている（[DB 構成 v3](2026-11-11-shop-organization-db-v3.md)）。担当者を作る手段は、開発用の `scripts/set-member-role.ps1` と E2E の準備しかなかった。#105 で、招待キーの扱い（有効期限30日、1回限りか何回でもかを発行時に選ぶ、取り消せる、発行済みの一覧と使った人を見られる、新規登録のときだけ使える）と、ロールの権限の大枠を決め、[残りの決定](2026-11-12-remaining-decisions.md)の 2-3〜2-5 でアカウント一覧の範囲・割り振りの範囲・ORG_ADMIN の店舗切り替えの候補を決めた。テーブル（`store_invitations`、`store_invitation_uses`、`organization_members.role`）は V1 にある。

この記録は、それを実装したときに決めた細部（キーの形式と保存のしかた、登録の手順、画面の入口、権限表の置き場所）をまとめる。

## Decision

### 招待キー

- キーは 32 バイトの暗号論的な乱数を URL で使える Base64（パディングなし、43 文字）にしたもの。DB にはキーそのものを残さず、SHA-256 の16進（`store_invitations.key_hash`、64 文字）だけを保存する。キーは発行した直後の応答（`POST /api/seller/stores/{storeId}/invitations`）でだけ返し、画面は「この画面を離れると再表示できない」と案内する。
- 有効期限は発行から30日（`expires_at`）。`singleUse: true` なら `max_uses = 1`、`false` なら空（期限内なら何回でも）。
- 発行・一覧・取り消しができるのは、オーナーと ORG_ADMIN（組織の全店舗）、MANAGER（自分の店舗）。STAFF・ロールなし・別の組織は 403（別の組織の店舗は 404）。停止中・閉鎖済みの店舗には発行できない（409）。
- 一覧（`GET /api/seller/stores/{storeId}/invitations`）は、各キーの状態（`ACTIVE`・`EXPIRED`・`REVOKED`・`USED_UP`）と使った人を返す。取り消し（`POST /api/seller/invitations/{id}/revoke`）は `revoked_at` を入れるだけで、使った人の所属は変えない。
- 登録の入口は、ログインのカードの「招待キーで登録（店舗の担当者）」。企業様向けの登録（チェックボックス）とは別の入口にし、招待キーの入口では企業様向けの選択を出さない。登録用 URL は `/account/login?invite=<キー>` で、開くとキーが入力済みになる。
- 新規登録（`POST /api/auth/signup` に `invitationKey`）は、次の順で1つのトランザクションで行う。
  1. キーのハッシュで `store_invitations` の行を `SELECT ... FOR UPDATE` で読み、取り消し・期限切れ・使った人数（`store_invitation_uses` の件数）が上限に達していないか、店舗が停止・閉鎖済みでなく組織が停止していないかを確かめる。使えなければ 400 `INVITATION_INVALID`（理由を分けない1つの文言）を返し、Cognito には登録しない。
  2. Cognito の `SignUp` を呼ぶ（行のロックを持ったまま）。
  3. 会員（`SHOP_STAFF`、メール確認前）、組織への所属（`organization_members`、人事のロールなし）、店舗の担当（`store_members`、ロールなし）、使用記録（`store_invitation_uses`）を作る。
- すでにログインしている購入者のアカウントでは使えない（新規登録だけ）。ログイン中に登録用 URL を開くと「招待キーは新規登録のときだけ使えます」と出す。既存の購入者のメールアドレスで登録しようとすると、Cognito が拒否する（409 `EMAIL_IN_USE`）。
- キーで登録してメール確認まで進まなかった会員は、ほかの未確認の会員と同じく消さない（無期限に残す、#109・#126）。

### 人事のロールの権限表

判定は `StaffPolicy`（`backend/src/main/java/jp/kusakari/ec/store/service/StaffPolicy.java`）1か所で行い、API の応答（`GET /api/seller/accounts`）に、操作する人が選べるロール（`assignableRoles`）・担当を外せるか（`removable`）・ORG_ADMIN を変えられるか（`organizationRoleEditable`）を入れる。画面は判定せず、応答のとおりに選択肢を出す。

| できること | オーナー | ORG_ADMIN | MANAGER | STAFF・ロールなし |
| --- | --- | --- | --- | --- |
| アカウント一覧 | 組織の全員（オーナー自身を含む） | 組織の全員（オーナー自身を含む） | 自分の店舗の担当者だけ | 不可（403） |
| MANAGER の割り振り・解除 | 組織の全店舗 | 組織の全店舗 | 不可 | 不可 |
| STAFF・ロールなしへの変更 | 組織の全店舗 | 組織の全店舗 | 自分の店舗で、今 STAFF かロールなしの人だけ（自分自身は不可） | 不可 |
| 別の店舗の担当に加える・担当から外す | できる | できる | 不可 | 不可 |
| ORG_ADMIN の付け外し | できる | 不可 | 不可 | 不可 |
| 招待キーの発行・一覧・取り消し | 組織の全店舗 | 組織の全店舗 | 自分の店舗 | 不可 |

- オーナーは一覧に出るが、ロールを変えられない（オーナーは店舗のロールを持たず、組織の全店舗を扱う。API は 404 `ACCOUNT_NOT_FOUND`）。
- 商品・在庫・注文・店舗情報の操作は、ORG_ADMIN でも店舗のロールに従う（`AuthService.requireSeller`/`requireManager`）。
- API：`GET /api/seller/accounts`、`PUT /api/seller/accounts/{memberId}/stores/{storeId}`（`{"role":"MANAGER"|"STAFF"|"NONE"}`。担当でない店舗なら担当に加える）、`DELETE /api/seller/accounts/{memberId}/stores/{storeId}`、`PUT /api/seller/accounts/{memberId}/organization-role`（`{"organizationAdmin":true|false}`）。

### 店舗の切り替え（#112）

- `GET /api/seller/stores` の各店舗に、その店舗での自分の立場 `memberRole`（`OWNER`・`MANAGER`・`STAFF`・`NONE`＝所属でロールなし・`ADMIN`＝運営・空＝担当外）を足した。ORG_ADMIN には組織の全店舗を返し、ロールのない店舗は `memberRole` が空になる。
- 出店者画面は、`memberRole` が空の店舗を選ぶと、商品管理・店舗受け取り・注文実績・店舗プロフィールの代わりに「人事（アカウント・招待キー）の画面だけを使えます」と出す。
- 選んだ店舗は、ブラウザーの `localStorage` に保ち、再読み込みしても同じ店舗を選ぶ（端末ごとの表示の都合だけで、業務データではない）。
- `GET /api/auth/me` に `organizationRole`（ORG_ADMIN か空）を足した。出店者メニューの「アカウント」「招待キー」は、オーナー・ORG_ADMIN・どこかの店舗の MANAGER にだけ出す。

## Alternatives

- キーを平文で保存する：一覧からキーを再表示できるが、DB を読める人がキーで登録できてしまう。#104 で `key_hash` と決めたとおりハッシュだけにした。ハッシュは、キーが 256 ビットの乱数で総当たりできないので、ソルトや遅いハッシュ（bcrypt など）は使わない（一意キーで引けることを優先した）。
- 推測しやすい短いキー（6〜8 文字）：口頭で伝えやすいが、登録の API で総当たりされうる。渡し方はコピーと URL なので、長いキーにした。
- Cognito の登録を先に行い、後でキーを確かめる：キーが無効でも Cognito にユーザーだけが残る。キーを先に確かめ、ロックを持ったまま登録する形にした。外部の呼び出しの間（最大およそ15秒）同じキーの行がロックされるが、同じキーで同時に登録することはまれなので受け入れる。
- 有効なキーの理由（期限切れ・取り消し・使用済み）を分けて返す：キーを持っている人にしか分からない情報なので害はないが、画面で理由ごとの案内を作る必要がない。どれも「管理者に新しいキーを依頼する」で同じなので1つにした。
- ログイン中の購入者がキーで店舗側のアカウントに変わる：#105 で「既存の購入者は使えない」と決めた。購入者のカート・注文と店舗側の権限が1つのアカウントに混ざるため採らない。
- 権限の判定を画面にも書く：判定が2か所になり、食い違うと押せるのに拒否される操作ができる。サーバーの応答に選べる値を入れた。
- 選んだ店舗を URL のクエリに持つ：ページを移るたびにクエリを引き継ぐ必要がある。メニューのリンクが多いので、端末の保存にした。
- ORG_ADMIN の切り替え候補を担当店舗だけにする：[残りの決定](2026-11-12-remaining-decisions.md) 2-5 のとおり採らない。

## Consequences

- Cognito の `SignUp` の後で DB の保存に失敗すると（通常は起きない）、Cognito に未確認のユーザーだけが残り、会員は作られない。そのユーザーがメール確認してログインすると、購入者（`USER`）の会員になる。
- 招待キーで登録した人は、ロールが割り振られるまで、所属店舗の店舗情報と商品・在庫を見られるだけ（[残りの決定](2026-11-12-remaining-decisions.md) 2-2）。通知（新しい注文など）も届かない（`NotificationService.toStore` はロールのある担当者だけに送る）。
- 組織から外す操作（オーナー）は、まだ作っていない（#105 で決定済み。担当から外しても組織への所属は残る）。
- E2E（`e2e/business-invitations.spec.js`）は、実際に Cognito の `SignUp` を通す。確認コードは example.com 宛てで受け取れないので、管理用の API（`admin-confirm-sign-up`、`email_verified`）で確認済みにする。無効なキーの試験は Cognito に登録しない。
- 初回ログインの扱いは [会員の種別とロールの値](../member-roles.md) に書いた。
