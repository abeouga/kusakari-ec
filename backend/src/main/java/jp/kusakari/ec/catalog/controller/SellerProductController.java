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

  @GetMapping
  public List<ProductView> list(@RequestParam long storeId) { return service.list(storeId); }

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
