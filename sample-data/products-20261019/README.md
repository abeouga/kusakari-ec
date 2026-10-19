# 2026-10-19 商品サンプル

共有された `kusakari-ec-product-handoff-20261019-113948.zip` の店舗1のスナップショットです。
31商品のID、価格、在庫、植物モデル設定・構成、素材対応を保持しています。
これはデモ商品であり、実際の販売価格・在庫ではありません。
出所と取得日時は `export-metadata.json`、ファイル検証値は `checksums.json` に記録しています。
商品画像・モデルプレビュー60枚は `frontend/public/images/` にあります。

## 手動での取り込み

ECの依存、MySQL、`.env` をセットアップした後、ECリポジトリ直下で実行します。

```sh
node scripts/import-product-sample.mjs
node scripts/import-product-sample.mjs --apply
```

最初のコマンドは事前確認のみです。`--apply` は127.0.0.1の開発DB `kusakari` に限り、
商品関連4テーブルのSQLバックアップを `artifacts/product-backup-日時/` に保存してから、
既存カタログを非公開化し、この31商品を1トランザクションで登録します。
店舗1の在庫はスナップショットに置き換わるため、購入操作と同時には実行しないでください。
注文・カート・庭データは変更しません。同じIDは更新し、異なるIDとのSKU重複は拒否します。

## Context / Decision / Alternatives / Consequences

- Context: MySQLへの登録内容はGitに含まれず、開発PC間で商品サンプルが異なっていた。
- Decision: JSONと画像、明示的な取り込みコマンドをGit管理対象にする。旧商品の削除は既存APIと同じ非公開化とする。
- Alternatives: DB全消去は注文・カートに影響するため採用しない。起動時のデータ入れ替えやFlywayによる全環境への自動反映もしない。
- Consequences: メンバーはコード取得だけでなく取り込みコマンドを明示実行する。新商品は一覧に31件表示され、旧商品は履歴参照用に残る。
  スキーマ変更は不要で、既存Flywayマイグレーションは変更しない。

`.gitignore` は `artifacts/`・`.runtime/`・`.env` などを除外します。
この `sample-data/` と `frontend/public/images/` は除外されません。
バックアップや認証情報をGitへ追加しないでください。

## 日時の保存・読み出し

- Context: MySQLのセッションがWindowsのJSTを継承し、HibernateのUTC設定と食い違うと、正しく保存したTIMESTAMPがAPIで9時間ずれる。
- Decision: Hikari接続初期化でMySQLセッションをUTCに固定する。インポーターもUTCセッションで添付ISO日時を保存する。
- Alternatives: 商品の日時自体を9時間ずらす回避は、保存値を壊すため採用しない。
- Consequences: 接続再作成後はDBのOS設定に依存せず、商品・履歴のTIMESTAMPをUTCとして扱う。既存行の日時は書き換えない。

取り込み後は `node scripts/verify-product-sample.mjs` で、現行APIの31商品・画像60枚のSHA-256・素材候補31件を確認できます。

検証では元のJSONを変更せず、APIから廃止された `floweringDescription`、`seasonalCare`、`styleDescription` のみ比較対象から除外します。追加された `publicationStatus` は `PUBLISHED`、旧植物モデルの `botanicalForm` はAPIの既定値 `null` と比較します。それ以外の項目の欠落や値の相違は引き続きエラーです。

旧検証スクリプトで `floweringDescription: undefined !== ''` が出る場合は、APIとの形式の不一致です。修正版を取得して検証を再実行してください。このエラーだけを理由に `--apply` を再実行する必要はありません（再取り込みは在庫も置き換えます）。
