package jp.kusakari.ec.store.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import jp.kusakari.ec.store.service.OrganizationSuspensionService;
import jp.kusakari.ec.store.service.OrganizationSuspensionService.OrganizationView;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/** 運営による組織の受付停止・停止・取り消し（#109）。 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/operator/organizations")
public class OrganizationController {

  private final OrganizationSuspensionService service;

  /** 受付停止とまとめてキャンセルは理由が必須。 */
  public record ReasonRequest(@NotBlank @Size(max = 500) String reason) {}

  /** 取り消し・再開の理由は任意。 */
  public record ResumeRequest(@NotNull @Size(max = 500) String reason) {}

  @GetMapping
  public List<OrganizationView> list() {
    return service.list();
  }

  @PostMapping("/{id}/stop-accepting")
  public OrganizationView stopAccepting(@PathVariable long id, @Valid @RequestBody ReasonRequest in) {
    return service.stopAccepting(id, in.reason());
  }

  @PostMapping("/{id}/resume")
  public OrganizationView resume(@PathVariable long id, @Valid @RequestBody ResumeRequest in) {
    return service.resume(id, in.reason());
  }

  @PostMapping("/{id}/order-cancellations")
  public OrganizationView cancelOrders(@PathVariable long id, @Valid @RequestBody ReasonRequest in) {
    return service.cancelOrders(id, in.reason());
  }
}
