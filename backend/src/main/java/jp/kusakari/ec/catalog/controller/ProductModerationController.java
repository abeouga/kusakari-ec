package jp.kusakari.ec.catalog.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import jp.kusakari.ec.catalog.service.ProductModerationService;
import jp.kusakari.ec.moderation.dto.ModerationDtos;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/** 運営による商品の警告・公開停止と、その履歴（EC-A10、#16）。 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/operator/products")
public class ProductModerationController {

  private final ProductModerationService service;

  /** 公開停止（suspended=true、理由は必須）・再開（suspended=false、理由は任意）。 */
  public record Input(boolean suspended, @Size(max = 500) String reason) {}

  @GetMapping
  public List<ProductModerationService.Product> list() {
    return service.list();
  }

  @PutMapping("/{id}/moderation")
  public ModerationDtos.State moderate(@PathVariable String id, @Valid @RequestBody Input in) {
    return service.suspend(id, in.suspended(), in.reason());
  }

  @PutMapping("/{id}/warning")
  public ModerationDtos.State warning(@PathVariable String id, @Valid @RequestBody ModerationDtos.WarningRequest in) {
    return service.warn(id, in.warned(), in.reason());
  }

  @GetMapping("/{id}/moderation-events")
  public List<ModerationDtos.EventView> events(@PathVariable String id) {
    return service.events(id);
  }
}
