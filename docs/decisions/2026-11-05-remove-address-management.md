# 住所管理を削除する

## Context

商品の受け取りは、購入者が受取店舗へ行く店舗受け取りに決まった（issue #11）。アカウント設定の「住所管理」（`/account/address`、`GET/PUT/DELETE /api/account/address`、`member_addresses`）は、注文・受け取りのどこからも使われていない。店舗受け取りの連絡先は「受取連絡先」（`member_pickup_contacts`）で扱っている。

## Decision

- 画面の「住所管理」、住所フォーム、`/api/account/address` の GET / PUT / DELETE、`AddressEntity`・`AddressRepository`・`MemberService.Address` を削除する。`/account/address` は「ページが見つかりません。」になり、APIは404を返す。
- `member_addresses` テーブルは削除せず、読み書きしない状態で残す。

## Alternatives

- 新しいFlywayマイグレーションで `member_addresses` を `DROP` する案は、登録済みの住所が起動時に消えるため採用しない（起動時にデータを消去しない方針）。不要データの削除は、保持期間とバックアップを決めたうえで別の作業として行う。
- 画面だけ隠してAPIを残す案は、使われない入力口が残り続けるため採用しない。

## Consequences

- `member_addresses` の既存行は残るが、アプリは参照しない。会員の退会処理にも影響しない（もともと住所を参照していない）。
- E2E は住所の保存・削除の確認を外し、`e2e/business-account-no-address.spec.js` で削除後の画面・API・他のアカウント設定を確認する。
