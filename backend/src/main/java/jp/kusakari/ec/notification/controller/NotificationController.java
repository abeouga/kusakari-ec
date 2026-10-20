package jp.kusakari.ec.notification.controller;

import java.util.*;
import jp.kusakari.ec.notification.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/notifications")
public class NotificationController {

  private final NotificationService service;

  @GetMapping
  public List<NotificationService.Notice> list() {
    return service.list();
  }

  @PutMapping("/{id}/read")
  public Map<String, Boolean> read(@PathVariable String id) {
    service.read(id);
    return Map.of("read", true);
  }
}
