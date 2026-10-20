package jp.kusakari.ec.store.controller;

import jakarta.validation.Valid;
import java.util.*;
import jp.kusakari.ec.store.service.StoreService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class StoreController {

  private final StoreService service;

  public record EnabledRequest(boolean enabled) {}

  @GetMapping("/api/stores/{id}")
  public StoreService.Profile get(@PathVariable long id) {
    return service.get(id);
  }

  @PutMapping("/api/seller/stores/{id}")
  public StoreService.Profile save(@PathVariable long id, @Valid @RequestBody StoreService.Input in) {
    return service.save(id, in);
  }

  @GetMapping("/api/operator/stores")
  public List<StoreService.Profile> list() {
    return service.list();
  }

  @PutMapping("/api/operator/stores/{id}/enabled")
  public Map<String, Boolean> enabled(@PathVariable long id, @RequestBody EnabledRequest in) {
    service.enable(id, in.enabled());
    return Map.of("enabled", in.enabled());
  }
}
