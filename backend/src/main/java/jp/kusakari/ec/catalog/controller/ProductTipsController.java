package jp.kusakari.ec.catalog.controller;

import jakarta.validation.Valid;
import jp.kusakari.ec.catalog.dto.ProductTips;
import jp.kusakari.ec.catalog.service.ProductTipsService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/products/{id}/tips")
@RequiredArgsConstructor
public class ProductTipsController {

  private final ProductTipsService tips;

  @GetMapping
  public ProductTips get(@PathVariable String id) {
    return tips.get(id);
  }

  @PutMapping
  public ProductTips update(@PathVariable String id, @Valid @RequestBody ProductTips input) {
    return tips.update(id, input);
  }
}
