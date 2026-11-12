-- 店舗の閉鎖（#79）で使うイベント。テーブル定義（schema.sql）とは別のファイルにしている。
-- マイグレーションには、店舗の閉鎖を実装する #79 で入れる。イベントを作るには DB ユーザーに EVENT 権限が要り、
-- セットアップが付ける権限の見直しが必要なため。
-- 閉鎖済みになってから90日たった店舗の連絡先を消す（#79）。1日1回。event_scheduler が ON の MySQL で動く
CREATE EVENT ev_stores_clear_closed_contacts
  ON SCHEDULE EVERY 1 DAY
  DO UPDATE stores SET contact_name = '', contact_email = ''
     WHERE closed_at IS NOT NULL AND closed_at < NOW(6) - INTERVAL 90 DAY
       AND (contact_name <> '' OR contact_email <> '');
