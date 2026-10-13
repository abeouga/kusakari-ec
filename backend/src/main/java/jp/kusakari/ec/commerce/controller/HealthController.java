package jp.kusakari.ec.commerce.controller;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
public class HealthController {

  @GetMapping
  public Map<String, String> health() {
    return Map.of("status", "ok", "application", "kusakari-ec", "backend", "spring-boot");
  }
}
