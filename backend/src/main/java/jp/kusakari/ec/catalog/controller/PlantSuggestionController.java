package jp.kusakari.ec.catalog.controller;

import jakarta.validation.Valid;
import jp.kusakari.ec.catalog.dto.PlantSuggestionRequest;
import jp.kusakari.ec.catalog.dto.PlantSuggestionView;
import jp.kusakari.ec.catalog.service.PlantSuggestionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class PlantSuggestionController {

  private final PlantSuggestionService service;
  private final jp.kusakari.ec.auth.AuthService auth;

  @PostMapping("/api/products/plant-model-suggestions")
  public PlantSuggestionView suggest(@Valid @RequestBody PlantSuggestionRequest input) {
    auth.requireSellerRole();
    return service.suggest(input);
  }
}
