package jp.kusakari.ec.catalog.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import jp.kusakari.ec.catalog.service.ProductModerationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/operator/products")
public class ProductModerationController {

  private final ProductModerationService service;

  public record Input(boolean suspended, @NotBlank @Size(max = 500) String reason) {}

  @GetMapping
  public List<ProductModerationService.Product> list() {
    return service.list();
  }

  @PutMapping("/{id}/moderation")
  public Map<String, Boolean> moderate(@PathVariable String id, @Valid @RequestBody Input in) {
    service.suspend(id, in.suspended(), in.reason());
    return Map.of("suspended", in.suspended());
  }
}
