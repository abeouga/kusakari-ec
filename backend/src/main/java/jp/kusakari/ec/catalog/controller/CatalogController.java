package jp.kusakari.ec.catalog.controller;

import static jp.kusakari.ec.catalog.dto.CatalogDtos.*;

import jakarta.validation.Valid;
import java.util.List;
import jp.kusakari.ec.catalog.dto.ProductImageReference;
import jp.kusakari.ec.catalog.service.CatalogService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class CatalogController {

  private final CatalogService service;

  public CatalogController(CatalogService service) {
    this.service = service;
  }

  @GetMapping("/products")
  public List<ProductView> products(@RequestParam(defaultValue = "1") long storeId) {
    return service.products(storeId);
  }

  @GetMapping("/stores")
  public List<StoreView> stores(
    @RequestParam(required = false) Double latitude,
    @RequestParam(required = false) Double longitude
  ) {
    return service.stores(latitude, longitude);
  }

  @PostMapping("/products/references")
  public List<ProductImageReference> references(@Valid @RequestBody ProductReferenceRequest request) {
    return service.imageReferences(request.productIds());
  }

  @PostMapping("/materials/quote")
  public List<MaterialMatch> materials(@Valid @RequestBody MaterialRequest request) {
    return service.match(request);
  }
}
