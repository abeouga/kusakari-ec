package jp.kusakari.ec.commerce.controller;

import java.util.Map;
import javax.sql.DataSource;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
@RequiredArgsConstructor
public class HealthController {
  private final DataSource database;
  private final ApplicationAvailability availability;

  @GetMapping
  public Map<String, String> health() {
    return Map.of("status", "ok", "application", "kusakari-ec", "backend", "spring-boot");
  }

  @GetMapping("/ready")
  public ResponseEntity<Map<String, String>> ready() {
    if (availability.getReadinessState() != ReadinessState.ACCEPTING_TRAFFIC) {
      return ResponseEntity.status(503).body(Map.of("status", "starting-or-stopping"));
    }
    try (var connection = database.getConnection()) {
      if (connection.isValid(3)) return ResponseEntity.ok(health());
    } catch (java.sql.SQLException ignored) {
      // Health checks must not expose a database URL, credentials or SQL errors.
    }
    return ResponseEntity.status(503).body(Map.of("status", "unavailable"));
  }
}
