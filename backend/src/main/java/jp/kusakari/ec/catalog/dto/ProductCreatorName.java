package jp.kusakari.ec.catalog.dto;

/** 商品を追加した会員の表示名。店舗の商品管理と運営の画面だけで使い、購入者には返さない。 */
public record ProductCreatorName(String productId, String displayName) {}
