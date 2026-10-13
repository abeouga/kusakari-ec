package jp.kusakari.ec.catalog.controller;

import jakarta.validation.Valid;
import java.util.Map;
import jp.kusakari.ec.catalog.dto.CatalogDtos;
import jp.kusakari.ec.catalog.dto.ProductRequest;
import jp.kusakari.ec.catalog.service.ProductEditorService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/products")
public class ProductEditorController {

  private final ProductEditorService service;

  public ProductEditorController(ProductEditorService service) {
    this.service = service;
  }

  @PostMapping
  public CatalogDtos.ProductView create(@Valid @RequestBody ProductRequest input) {
    return service.create(input);
  }

  @PutMapping("/{id}")
  public CatalogDtos.ProductView update(@PathVariable String id, @Valid @RequestBody ProductRequest input) {
    return service.update(id, input);
  }

  @DeleteMapping("/{id}")
  public Map<String, Boolean> delete(@PathVariable String id) {
    service.delete(id);
    return Map.of("deleted", true);
  }
}
