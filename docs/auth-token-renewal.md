# 認証の更新トークン方式

## Context

ECのCognitoログインでは、ID tokenの有効期限が60分、サーバーセッションのアイドル期限が30分でした。
サイト間を移動するとすぐにログインが切れるため、利用者の操作を続けている間はログインを維持する必要があります。
従来はrefresh tokenをECで使用していませんでした。

## Decision

- Cognitoのrefresh tokenの有効期間を30日にします（`refresh_token_validity = 30`）。ID tokenとaccess tokenは従来どおり60分です。
- refresh tokenはサーバーのHTTPセッション属性（`COGNITO_REFRESH_TOKEN`）だけに保持し、ブラウザーやAPIレスポンスへ返しません。
  - OAuth2ログインは、成功時にSpring Securityの認可クライアントからrefresh tokenを取り出し、即座に認可クライアントを削除してセッションへ移します。
  - パスワードログインは`InitiateAuth`の`RefreshToken`を同じ属性へ保存します。
- ID tokenの期限が切れたリクエストでは`SessionValidityFilter`が`REFRESH_TOKEN_AUTH`でID tokenを更新します。
  - 更新後のID tokenの`sub`が元のセッションと一致しない場合は拒否します。
  - 更新に成功したら新しい認証情報をセッションへ保存し、元のリクエストを続行します。
  - refresh tokenが失効・取り消された場合は401 `LOGIN_REQUIRED`とし、セッションを破棄します。
  - Cognitoに接続できない場合は503を返し、セッションは残します。
- サーバーセッションのアイドル期限と`KUSAKARI_SESSION`クッキーの有効期限を30日にします。
- refresh tokenはローテーションしません。refresh tokenは発行から30日で失効し、その後は再ログインが必要です。

## Alternatives

- ID tokenの期限チェックを外す方式は採用しません。Cognitoでの再確認が30日間なくなるためです。
- ブラウザーにrefresh tokenを保存する方式は採用しません。既存のHttpOnly Cookie方式を維持するためです。
- 定期的なポーリングでID tokenを更新する方式は採用しません。期限切れ時の遅延更新で足りるためです。
- refresh tokenのローテーションは今回は行いません。ローテーションには同時リクエストの競合処理が必要なためです。

## Consequences

- 利用者は30日間、再ログインなしで利用できます（操作が途切れなければサーバーセッションも30日間維持されます）。
- refresh tokenはサーバーメモリ上で30日間有効です。EC再起動で全セッションが失われるため、複数タスク運用は別途検討が必要です。
- ログアウト時にCognitoのrefresh tokenを取り消す処理は今回含めていません。ローカルのセッションは破棄されるため、ブラウザーからrefresh tokenは取り出せません。
- パスワード変更は既存のセッションを破棄します。Cognito側のrefresh tokenの取り消しは行わないため、必要ならCognitoのグローバルサインアウトを検討します。
- Terraformの変更（`refresh_token_validity`）は新しく発行されるrefresh tokenから適用されます。既存のrefresh tokenは発行時の有効期限のままです。
- Terraformは`infra/cognito`と隣接の`kusakari-terraform`に同じ定義があります。適用は実User Poolへの変更のため、利用者の確認後に行います。
