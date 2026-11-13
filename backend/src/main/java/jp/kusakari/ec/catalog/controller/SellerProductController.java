package jp.kusakari.ec.catalog.controller;

import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import jp.kusakari.ec.catalog.dto.CatalogDtos.ProductView;
import jp.kusakari.ec.catalog.dto.ProductStatusRequest;
import jp.kusakari.ec.catalog.dto.StockUpdateRequest;
import jp.kusakari.ec.catalog.service.SellerProductService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/seller/products")
@RequiredArgsConstructor
public class SellerProductController {
  private final SellerProductService service;
  private final jp.kusakari.ec.catalog.service.ProductModerationService moderation;

  @GetMapping
  public List<ProductView> list(@RequestParam long storeId) { return service.list(storeId); }

  /** 運営が警告・停止している自分の店舗の商品と、警告の理由（#16）。 */
  @GetMapping("/moderation")
  public List<jp.kusakari.ec.moderation.dto.ModerationDtos.ProductNotice> moderation(@RequestParam long storeId) {
    return moderation.noticesAt(storeId);
  }

  @PatchMapping("/status")
  public Map<String, Boolean> update(@Valid @RequestBody ProductStatusRequest request) {
    service.update(request);
    return Map.of("updated", true);
  }

  @PutMapping("/{id}/stock")
  public ProductView updateStock(@PathVariable String id, @Valid @RequestBody StockUpdateRequest request) {
    return service.updateStock(id, request);
  }
}
