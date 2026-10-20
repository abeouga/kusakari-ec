# EC / Canvas バックエンド検証記録

実施日: 2026-10-20。対象はローカルのkusakari-ec / kusakari-canvas。実装構成とAPIは [業務バックエンド](business-backend.md) を参照。

## 開発環境の保存データ

| 項目 | 結果 |
|---|---|
| 出店者 | test.seller@example.com、既存会員ID・店舗1を維持 |
| 出品 | 有効31件を複製せず紐付け・公開 |
| 移行時の保持確認 | ID、SKU、価格、画像URL、モデルハッシュ、在庫合計605点が移行前後で一致 |
| 非有効商品 | 15件を維持、再公開なし |
| 旧匿名注文 | 1件を保持、購入者を付け替えず |
| 購入者 | test.user@example.com |
| 購入商品 | オリーブ / 50ee707f-cd6a-47ed-9ab9-89e0a0d954c1 / 1点 |
| 商品在庫 | 20 → 19。店舗1の対象31商品合計は購入後604点 |
| 注文ID | 9d4fa17f-668d-4651-8b0c-33467bfe7cab |
| 庭ID | 9f48877d-3890-406e-afe5-ca9a97625f0e |
| 配置 | 同じproductId、モデル構成、座標を保存。購入後も1個を保持 |
| カート | 購入後0点 |
| 会員間の一致 | 購入者・出店者画面に同じ注文ID・オリーブ1点を表示 |
| 管理者 | test.admin@example.com、ADMIN、有効。招待メール送信なし |

最終コードでEC・Canvas APIを再起動後、受け入れ試験1件を再実行して成功した（再購入なし）。両Webと両APIの準備確認はすべてHTTP 200。

注文と庭は削除していない。開発環境の購入試験は注文IDを記録し、再実行では新規購入せず保存済みデータを照合する。

証拠: [購入記録](../artifacts/acceptance/purchase.json)、[画面/API照合](../artifacts/acceptance/verified.json)、[DB照合](../artifacts/acceptance/database-verification.json)、[購入者画面](../artifacts/acceptance/buyer-orders.png)、[出店者画面](../artifacts/acceptance/seller-orders.png)、[購入後の庭](../artifacts/acceptance/garden-after-purchase.png)。

## 専用DB・実Cognitoの受け入れ試験

`npm run test:business` は実Java/FastAPI、専用MySQL、実Cognito、Chromiumを使用する。正常系APIモック・H2・SQLite・localStorage代替は使用していない。

| シナリオ | 確認結果 |
|---|---|
| 商品公開・カート・庭配置・購入・受取・通知 | 成功。再読込・再ログイン・二重送信・既読保存を含む |
| 保存済み商品の販売停止 | モデルを保持して表示し、購入不可の理由を表示。解除後に購入可能 |
| 最後の在庫の同時注文 | 200 / 409。片方のみ購入 |
| キャンセル承認の同時実行 | 200 / 409。在庫を一度だけ復元 |
| 価格変更・店舗停止・アクセス制御 | 旧価格と停止中購入を409で拒否。権限不足403、他人の注文・庭・書類404 |
| キャンセル申請と受取準備の競合 | 片方のみ成功。READYまたはCANCELLEDと在庫の整合を確認 |
| 履歴非表示 | 購入者一覧のみ非表示。出店者・運営者の記録を保持 |
| 出店申請・書類・審査 | 実保存、承認で店舗作成・出店者権限付与。重複申請拒否、却下理由と再申請を確認 |
| 住所・店舗プロフィール・カテゴリ | 保存・再読込。住所削除、使用中カテゴリ削除の拒否を確認 |
| 会員停止・再開・退会 | 既存セッションにも反映。退会時はDB無効化と未認証化 |
| パスワード変更 | 専用一時Cognitoアカウントで現在パスワード確認、変更、再ログイン。終了時に一時アカウント削除 |
| カスタムログイン回帰 | 実認証、CSRF、セッション更新、EC/Canvas往復、再読込、ログアウト後の拒否、外部returnTo拒否 |

テスト定義は8件。最後の全体実行は7件成功、共有管理者アカウントのパスワード復元で1件失敗した。管理操作で元の資格情報を復元してログイン確認後、試験を一時アカウントへ分離し、該当1件の再実行が成功した。単一実行で8件成功したという記録ではない。

証拠: [全体実行](../artifacts/business/full-run.json)、[修正後のパスワード再試験](../artifacts/business/password-rerun.json)、[業務フローJSON](../artifacts/business/flow.json)、[競合試験JSON](../artifacts/business/conflicts.json)、[販売停止中の庭](../artifacts/business/suspended-garden.png)。パスワードやトークンを残さないためtrace/HARは無効にした。

## 静的確認・ビルド

- EC: checkJs、ESLint、Viteビルド、Java 21のclean packageに成功。
- Canvas: ESLint、Ruff、Pythonコンパイル、checkJs、Viteビルドに成功。
- 変更ソースは全件500行未満。差分の空白エラーなし。変更ソース・検証JSONへの秘密値混入なし。
- Canvasには既存の大きなバンドルの警告が残る。ビルド失敗ではない。
- 開発DBはFlyway V10まで適用済み。庭DBは既存Alembicスキーマを維持。

## 検証範囲

実決済、外部メール配信、配送、手数料・精算、デプロイは対象外。Cognitoの新規登録・リセット導線は維持したが、新規登録メールやリセットメールの受信試験は行っていない。画像生成・写真編集の既存機能は保持し、今回の購入フロー試験で有料の画像生成を実行していない。

バックアップは `%LOCALAPPDATA%/Kusakari/backups/backend-implementation-20261020-113844/`。両DBのSQLと変更前ソース・画像を保存した。資格情報は既存のGit管理外ファイルで管理する。
