# 新しい DB 構成（v3）の制約の試験

[../database-er.md](../database-er.md) の構成を MySQL に作り、「通るべき操作が通り、拒否されるべき操作が拒否される」ことを SQL だけで確かめるためのファイルです。アプリケーションは使いません。

| ファイル | 内容 |
| --- | --- |
| `schema.sql` | 27テーブルとイベント1つの定義。#107 のマイグレーションの元にする（2026-11-13 に組織の停止の履歴 `organization_moderation_events` を足して28テーブル。イベントはアプリの定期処理に置き換えた） |
| `cases.txt` | 試験の一覧。1行が1件で、期待（`OK` か `NG`）・題名・SQL を縦棒で区切る。`OK` は通るべき操作、`NG` は拒否されるべき操作。上から順に実行し、前の行のデータを後の行が使う |
| `run.sh` | `schema.sql` を作り直してから、`cases.txt` を1件ずつ実行する |
| `result.txt` | 2026-11-12 の結果（160件すべて期待どおり。拒否83件、許可77件） |

## 実行のしかた

開発用・E2E 用の MySQL（3306）では実行しません。`run.sh` は DB `kusakari_v3_check` を作り直すので、使い捨ての MySQL を別のポートに立てて使います。`run.sh` は、ポートが 3306 のときは何もせずに止まります。

Git Bash で、空の一時フォルダーに MySQL を初期化して起動します（`<一時フォルダー>` は、プロジェクトの外の空のフォルダーに置き換えます）。

```bash
"/c/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe" --no-defaults --initialize-insecure --datadir="<一時フォルダー>/data"
```

```bash
"/c/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe" --no-defaults --datadir="<一時フォルダー>/data" --port=33999 --bind-address=127.0.0.1 --mysqlx=OFF
```

別の Git Bash で試験を実行します。最後の行が `fail=0` なら、すべて期待どおりです。

```bash
bash docs/database-v3-check/run.sh
```

終わったら、使い捨ての MySQL を止めます。

```bash
"/c/Program Files/MySQL/MySQL Server 8.0/bin/mysqladmin.exe" --no-defaults -h 127.0.0.1 -P 33999 -u root shutdown
```

`mysql.exe` の場所やポートが違うときは、環境変数 `MYSQL_BIN` と `V3_CHECK_PORT` で指定します。

## 結果の読み方

- `PASS 番号 [OK] 題名`：通るべき操作が通った
- `PASS 番号 [NG] 題名 <- ERROR ...`：拒否されるべき操作が拒否された。`<-` の後ろが拒否の理由で、意図した制約（制約名）で拒否されたかをここで確かめる
- `FAIL`：期待と違った。下の行に MySQL の出力が出る
- 値の確認（「結果が合っている」という題名の行）は、`CHECK (ok = 1)` を付けた確認用のテーブル `t_assert` への INSERT で行う。条件が偽だと CHECK 制約で拒否され、`OK` の行が `FAIL` になる

## この試験で確かめていないこと

- アプリケーションからの動作、Flyway のマイグレーションとしての適用
- Stripe の API と通知そのもの（確かめているのは、通知を受けたときに DB で行う操作だけ）
- 同時実行（同じ在庫の同時購入、同じ招待キーの同時使用、同じ注文への同時の返金の要求）

連絡先を消すイベントの試験は、MySQL の `event_scheduler` が `ON`（MySQL 8.0 の初期値）のときに通ります。2026-11-13（#79）から、連絡先の削除はイベントではなくアプリの定期処理で行い、業務 E2E（`e2e/business-closure.spec.js`）で確かめます。この試験のイベントの項目は、作った当時の確認の記録です。イベントを今すぐ動かしてから4秒待つので、全体の実行に少し時間がかかります。

#107 でマイグレーションを作ったら、マイグレーションで作った DB に対してこの一覧を実行し直します。
