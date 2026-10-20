package jp.kusakari.ec.catalog.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import jp.kusakari.ec.catalog.service.CategoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class CategoryController {

  private final CategoryService service;

  public record Input(@NotNull @Size(max = 30) String previous, @NotBlank @Size(max = 30) String name) {}

  @GetMapping("/api/categories")
  public List<String> list() {
    return service.list();
  }

  @PutMapping("/api/operator/categories")
  public Map<String, Boolean> save(@Valid @RequestBody Input in) {
    service.save(in.previous(), in.name());
    return Map.of("saved", true);
  }

  @DeleteMapping("/api/operator/categories/{name}")
  public Map<String, Boolean> delete(@PathVariable String name) {
    service.delete(name);
    return Map.of("deleted", true);
  }
}
