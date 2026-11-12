package jp.kusakari.ec.catalog.dto;

/** 商品の店舗と、運営による停止の状態。大きな 3D モデルの JSON を読み込まずに確かめるために使う。 */
public record ProductStoreReference(String id, Long storeId, boolean suspended) {}
