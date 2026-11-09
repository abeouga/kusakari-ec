# 新規登録をログインカード内で行う（Issue #87）

## Context

- ログインはECのカスタム画面（`/account/login`）でメール・パスワードを受け取り、`POST /api/auth/login` からCognitoの `USER_PASSWORD_AUTH` を呼んでいる。
- 新規登録だけは `GET /api/auth/login?signup=true` からCognito Managed Login（Hosted UI）へリダイレクトしていた。英語・AWS既定デザインの画面に移るため、別サービスに飛ばされたように見えていた。
- User Poolはメールアドレスをユーザー名とし（`username_attributes = ["email"]`）、メールを自動検証する。アプリクライアントはシークレットなし（`generate_secret = false`）。

## Decision

- 新規登録はログインと同じ `main.login-card` の中でフォームを切り替えて行う。URLもページも移らない。見出しと説明文だけを「ログイン／新規登録／メールアドレスの確認」で切り替える。
- ECのAPIがCognitoの公開APIを呼ぶ。ブラウザーからCognitoへ直接通信しない。
  - `POST /api/auth/signup`（email, password, confirmPassword）→ `SignUp`
  - `POST /api/auth/signup/confirm`（email, code）→ `ConfirmSignUp`
  - `POST /api/auth/signup/resend`（email）→ `ResendConfirmationCode`
  - いずれもCSRF保護し、未ログインで呼べる。Cognitoのエンドポイントは設定済みissuerから決め、ブラウザー入力からは決めない。
- 確認コードが通ったら、画面のメモリに残したパスワードで通常の `POST /api/auth/login` を呼び、既存と同じセッション発行・会員登録（`auth_members`、USER固定）を行う。パスワードはサーバーにもブラウザーの保存領域にも残さない。
- ログイン時にCognitoが `UserNotConfirmedException` を返した場合は `409 EMAIL_NOT_CONFIRMED` とし、カードを確認コード入力に切り替える。登録途中で離脱した利用者もHosted UIを経由せずに確認を終えられる。
- Cognitoのエラーは日本語のメッセージとコードに変換する（`EMAIL_IN_USE`、`PASSWORD_REJECTED`、`CODE_MISMATCH`、`CODE_EXPIRED`、`AUTH_RATE_LIMITED` など）。上流の応答本文は返さない。
- `signup=true` によるHosted UIへのリダイレクトと `screen_hint=signup` の付与は削除する。パスワード再設定と追加の本人確認（`managed=true`）は従来どおりManaged Loginを使う。

## Alternatives

- **Hosted UIのブランディング（Managed Loginのスタイル設定）で見た目を寄せる**: 色やロゴは変えられるが、カードの形や文言をECの画面と完全には揃えられず、画面遷移も残るため採用しない。
- **ブラウザーからAmplify等でCognitoを直接呼ぶ**: ログインがサーバー経由なのに登録だけ経路が変わり、エラー変換やCSRFの扱いが分かれるため採用しない。
- **確認後にもう一度パスワードを入力させる**: 実装は単純になるが、登録直後に同じ入力を求めることになるため採用しない。画面のメモリに保持するだけで永続化しないため、保存リスクは増えない。

## Consequences

- 新規登録の成功までをE2Eで通すには、確認コードが届くメールボックスが必要になる。外部メール配信は試験対象外のため、E2E（`e2e/signup-card.spec.js`）はカード内の切り替え、パスワード不一致、既存メールアドレスに対する実Cognitoの `UsernameExistsException`、CSRF必須、旧 `signup=true` がHosted UIへ行かないことを確認する。新しいアカウントは作らない。
- 確認コード入力から登録完了・自動ログインまでの流れは、実メールで手動確認する。
- アカウント画面の `/account/register` も同じフォーム（`AuthPanel` の新規登録モード）を表示する。
