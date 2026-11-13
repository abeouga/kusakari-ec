-- 店舗の閉鎖（#79）で、閉鎖済みになってから90日たった店舗の連絡先を消す処理。
-- 2026-11-12 の決定（3-1）で、MySQL のイベント（CREATE EVENT）はやめ、アプリ内の定期処理（1日1回）で行う。
-- 既存の PC ではアプリ用の DB ユーザーに EVENT 権限を付け直せないため。
-- 実装：backend の ClosureSettlement.clearClosedContacts（StoreRepository.clearClosedContacts）。
-- アプリが行う更新は次と同じ（行は消さない。日時は UTC）。この SQL を DB に手で入れたり、イベントにしたりしない。
UPDATE stores SET contact_name = '', contact_email = '', revision = revision + 1
 WHERE closed_at IS NOT NULL AND closed_at < UTC_TIMESTAMP(6) - INTERVAL 90 DAY
   AND (contact_name <> '' OR contact_email <> '');
