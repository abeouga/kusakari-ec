# 会員権限の値

## Context

会員の権限は`auth_members.role`に`USER`/`SELLER`/`ADMIN`で保存し、API・画面は大文字の完全一致で判定します。列の照合順序が大文字小文字・全角半角を区別しない`utf8mb4_0900_ai_ci`だったため、CHECK制約は`seller`や`Ｓｅｌｌｅｒ`も通しました。別PCでSQLを手入力して権限を付けると、ログインはできても出店者画面に入れず、出店者APIは403になりました。権限の付け方もSQL手順で、User Poolのissuerを手で書き写す必要がありました。

## Decision

- Flyway V14で既存の値を`USER`/`SELLER`/`ADMIN`へ揃え、列を`ascii_bin`に変更します。CHECK制約はバイナリ比較にし、大文字小文字・全角・末尾空白の違いを拒否します。
- 権限付与は`scripts/set-member-role.ps1`で行います。`.env`のDB接続と`KUSAKARI_COGNITO_ISSUER`を使い、そのUser Poolでログイン済みの有効な会員1件だけを`SELLER`（担当店舗付き）または`ADMIN`に変更します。値は大文字で保存します。

## Alternatives

アプリ側で大文字小文字を無視して比較する方法は、判定箇所がJava・EC画面・Canvas画面に分散しており、1か所の漏れで同じ不具合が残るため採用しません。Cognitoグループへ権限を移す方法は、各PCのDBごとに権限を持つ現行の設計とE2Eの準備手順を変えるため、今回は採用しません。

## Consequences

V14の適用後は、MySQLクライアントで直接変更する場合も大文字の`USER`/`SELLER`/`ADMIN`しか保存できません。既存の小文字・全角の値は意味を変えずに正規の値へ変換されます。出店の取り消し（`SELLER`から`USER`へ戻す操作）は商品・注文の扱いを伴うため、引き続き`scripts/revert_store_approval.py`で行います。
