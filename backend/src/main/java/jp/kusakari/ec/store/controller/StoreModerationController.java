package jp.kusakari.ec.store.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;
import jp.kusakari.ec.moderation.dto.ModerationDtos;
import jp.kusakari.ec.store.service.StoreModerationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/** 運営による店舗の警告・利用停止と、その履歴（EC-A11、#16）。 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/operator/stores/{id}")
public class StoreModerationController {

  private final StoreModerationService service;

  /** 利用停止（enabled=false、理由は必須）・再開（enabled=true、理由は空でよい）。理由は出店者への通知と履歴に入る。 */
  public record EnabledRequest(boolean enabled, @Size(max = 500) String reason) {}

  @PutMapping("/enabled")
  public ModerationDtos.State enabled(@PathVariable long id, @Valid @RequestBody EnabledRequest in) {
    return service.enable(id, in.enabled(), in.reason());
  }

  @PutMapping("/warning")
  public ModerationDtos.State warning(@PathVariable long id, @Valid @RequestBody ModerationDtos.WarningRequest in) {
    return service.warn(id, in.warned(), in.reason());
  }

  @GetMapping("/moderation-events")
  public List<ModerationDtos.EventView> events(@PathVariable long id) {
    return service.events(id);
  }
}
