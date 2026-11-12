package jp.kusakari.ec.catalog.service;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import jp.kusakari.ec.catalog.persistence.repository.ProductRepository;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Assigns a product number when a seller leaves it blank (issue #25), e.g. KS-20261105-7Q2M4X.
 * The registration date keeps numbers readable; the random part avoids a per-store counter row.
 * 商品番号は店舗の中で一意。The unique index on (store_id, sku) stays the final guard against a concurrent duplicate.
 */
@Component
@RequiredArgsConstructor
class ProductSkuGenerator {

  private static final String LETTERS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  private static final DateTimeFormatter DAY = DateTimeFormatter.BASIC_ISO_DATE;
  private static final ZoneId TOKYO = ZoneId.of("Asia/Tokyo");
  private final SecureRandom random = new SecureRandom();
  private final ProductRepository products;

  String next(long storeId) {
    String prefix = "KS-" + LocalDate.now(TOKYO).format(DAY) + "-";
    for (int attempt = 0; attempt < 5; attempt++) {
      StringBuilder sku = new StringBuilder(prefix);
      for (int i = 0; i < 6; i++) sku.append(LETTERS.charAt(random.nextInt(LETTERS.length())));
      if (!products.existsByStoreIdAndSku(storeId, sku.toString())) return sku.toString();
    }
    throw new ApiException(503, "SKU_UNAVAILABLE", "商品番号を自動で設定できませんでした。もう一度お試しください。");
  }
}
