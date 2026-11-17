# ほかの PC で実行するスクリプトと実行順

## 1. 実行順の全体図

```mermaid
flowchart LR
  subgraph FIRST["A. 初回セットアップ"]
    direction TB
    A1["EC：setup.bat"] --> A2["Canvas：setup.bat"] --> A3["EC：start.bat"] --> A4["Canvas：start.bat"]
    AT["※ A は環境を一から作るときだけ使います。すでに環境がある PC では実行しません"]:::note
  end

  subgraph RESET["B. DB を作り直す"]
    direction TB
    B1["両方：git switch main → git pull"]
    B1 --> B2["EC：DB-reset.bat"]
    B2 --> B3["Canvas：DB-reset.bat"]
    B3 --> B4["以降はCを実行"]
  end

  subgraph DAILY["C. 起動・停止"]
    direction TB
    C1["EC：start.bat / stop.bat"]
    C2["Canvas：start.bat"]
  end

  FIRST ~~~ RESET ~~~ DAILY

  classDef note fill:none,stroke:none
```

## 2. スクリプトの一覧

### EC（kusakari-ec）

| スクリプト | いつ | すること |
| --- | --- | --- |
| `setup.bat` | A で使います。<br>接続設定を作り直すときは `setup.bat -Reconfigure` | MySQL（3306 の既存のもの、なければ専用の MySQL を 3307 に用意）・接続設定（`.env`）・依存・ビルドを準備し、開発用と E2E 用の DB のテーブルを作って確かめる。最後にテスト用アカウント9つをそろえる。データは消さない |
| `start.bat` | C で使います | Web・API・ブラウザー・SysOverRay の操作画面を起動する |
| `stop.bat` | C で使います | API と Web を止める |
| `DB-reset.bat` | B で使います | Web と API を止め、`npm install` と API のビルドをしてから、`kusakari` と `kusakari_e2e` を削除して作り直す |
| `scripts\set-test-accounts.ps1` | A・B の `setup.bat` と `DB-reset.bat` が実行するので、単体では使いません | 開発用 DB に、テスト用アカウント9つの会員・種別・ロールと、テスト組織2を入れる |
| `scripts\set-member-role.ps1` | 通常は使いません | 一度ログインした会員1件の種別とロールを変える（[会員の種別とロールの値](member-roles.md)） |
| `MySQL-reset.bat` | MySQL の root のパスワードが分からず A が進まないときに使います | 管理者として MySQL のサービスを止め、root のパスワードを設定し直す |

### Canvas（kusakari-canvas）

| スクリプト | いつ | すること |
| --- | --- | --- |
| `setup.bat` | A | Node.js・uv・Python・依存・MySQL（なければ専用の MySQL）・GLB を準備する。データは消さない |
| `start.bat` | C | API（8080）と Web（5173）を起動する |
| `DB-reset.bat` | B | このフォルダーの `start.bat` で起動した Canvas を止め、Python の依存をロックファイルに合わせてから、確認なしで `kusakari_canvas` と `kusakari_canvas_e2e` だけを消して作り直す。ほかのプロセスの接続は切る |

## 3. 登録されているアカウント一覧

| アカウント | 種別とロール |
| --- | --- |
| user01@example.com | 購入者 |
| admin01@example.com | 運営 |
| owner01@example.com | サンプルの組織（店舗1〜3）のオーナー |
| orgadmin01@example.com | サンプルの組織の ORG_ADMIN、店舗2の MANAGER |
| manager01@example.com | 店舗1の MANAGER |
| staff01@example.com | 店舗1の STAFF |
| unassigned01@example.com | 店舗1の担当でロールなし |
| applicant01@example.com | 申請中（出店の申請を1回だけ試せる） |
| owner02@example.com | テスト組織2（非公開の店舗1つ）のオーナー |

**テスト用アカウント9つは、何もしなくてもそろいます。** EC の `setup.bat` と `DB-reset.bat`（どちらか片方でよい）が最後に `scripts/set-test-accounts.ps1` を実行し、開発用 DB に会員と種別を入れます。そのまま `user01@example.com` などでログインできます。

### 関係図

```mermaid
flowchart LR
  subgraph PLATFORM["プラットフォーム"]
    user01["user01<br/>USER 購入者"]
    admin01["admin01<br/>ADMIN 運営"]
    applicant01["applicant01<br/>SHOP_OWNER_APPLICANT"]
  end

  subgraph ORG1["組織1 サンプル組織"]
    S1["店舗1 二子玉川"]
    S2["店舗2 横浜"]
    S3["店舗3 大宮"]
  end

  subgraph ORG2["組織2 Kusakari テスト組織2"]
    S4["テスト組織2の店舗<br/>非公開"]
  end

  owner01["owner01<br/>SHOP_OWNER"] -- オーナー --> ORG1
  orgadmin01["orgadmin01<br/>SHOP_STAFF"] -- ORG_ADMIN --> ORG1
  orgadmin01 -- MANAGER --> S2
  manager01["manager01<br/>SHOP_STAFF"] -- MANAGER --> S1
  staff01["staff01<br/>SHOP_STAFF"] -- STAFF --> S1
  unassigned01["unassigned01<br/>SHOP_STAFF"] -. ロールなし .-> S1
  owner02["owner02<br/>SHOP_OWNER"] -- オーナー --> ORG2
  owner02 -. 操作できない .-x ORG1
  admin01 -. 申請を審査 .-> applicant01
  applicant01 -. 承認されると .-> NEWORG["新しい組織のオーナー"]
  user01 -. 購入・Canvas .-> ORG1
```
