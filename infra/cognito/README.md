# CognitoのTerraform定義

ECとCanvasで1つのUser Pool、公開クライアント、Managed Loginドメインを共用します。東京の開発用接続先は`../../config/cognito.development.json`、他PCでの利用は`../../docs/cognito-setup.md`を参照してください。

**既存プールに接続するPCではapplyしません。** 起動にTerraformやAWS管理キーは不要です。共有プールのstateはこのGitリポジトリに含めていません。空のstateからapplyして既存プールを再作成・引き継ぎできるという意味ではありません。

このフォルダーは管理者がインフラ定義をレビュー・変更するためのものです。現在の運用stateは管理者の既存`kusakari-terraform`で管理しています。複数のstateから同じリソースを更新しないでください。新しい環境を作る場合は、対象アカウント、ユニークなドメイン、Callback/Logout URLを明示し、管理者がアクセス制御・費用とplanを確認します。

```powershell
terraform init -backend=false
terraform fmt -check -recursive
terraform validate
```

`*.tfstate*`、`*.tfplan`、実際の`*.tfvars`、AWSキーはGit対象外です。公開するのは定義、プロバイダーロック、非秘密情報のtfvars例です。プール削除保護を有効にしています。開発用のパスワードポリシーを本番に転用しないでください。AWSの支出制御や管理者の個人メールは他PC用の認証設定に含めていません。
