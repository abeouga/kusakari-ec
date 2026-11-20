# MySQL のセッションの時刻を UTC に固定する

この記録は、もとは `sample-data/products-20261019/README.md` にあった。31商品をマイグレーション（V7）で入れるようにして sample-data を消したとき（[記録](2026-11-20-sample-products-and-creator.md)）に、ここへ移した。

## Context

MySQL のセッションが Windows の日本時間を引き継ぎ、Hibernate の UTC の設定と食い違うと、正しく保存した TIMESTAMP が API で9時間ずれる。

## Decision

Hikari の接続の初期化（`spring.datasource.hikari.connection-init-sql`）で、MySQL のセッションを UTC に固定する。初期データの日時は、UTC の値として入れる（V7 は `+00:00` 付きの値で入れる）。

## Alternatives

- 商品の日時そのものを9時間ずらす：保存した値を壊すので採らない。

## Consequences

- 接続を作り直した後は、DB の OS の設定によらず、商品や履歴の TIMESTAMP を UTC として扱う。既存の行の日時は書き換えない。
