package jp.kusakari.ec.commerce.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import jp.kusakari.ec.commerce.dto.CommerceDtos.OrderView;
import jp.kusakari.ec.commerce.service.OrderWorkflowService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class OrderWorkflowController {

  private final OrderWorkflowService service;

  public record StatusRequest(
    @NotBlank String expectedStatus,
    @Pattern(regexp = "READY|COMPLETED") @NotNull String status
  ) {}

  public record CancellationRequest(@NotBlank @Size(max = 500) String reason) {}

  public record DecisionRequest(boolean approved, @NotNull @Size(max = 500) String reason) {}

  @GetMapping("/api/orders/{id}")
  public OrderView buyer(@PathVariable String id) {
    return service.buyerOrder(id);
  }

  @GetMapping("/api/seller/orders")
  public List<OrderView> seller(@RequestParam long storeId) {
    return service.sellerOrders(storeId);
  }

  @GetMapping("/api/seller/orders/{id}")
  public OrderView sellerOrder(@PathVariable String id) {
    return service.sellerOrder(id);
  }

  @GetMapping("/api/operator/orders")
  public List<OrderView> all() {
    return service.allOrders();
  }

  @PutMapping("/api/seller/orders/{id}/status")
  public OrderView status(@PathVariable String id, @Valid @RequestBody StatusRequest input) {
    return service.changeStatus(id, input.expectedStatus(), input.status());
  }

  @PostMapping("/api/orders/{id}/cancellation")
  public OrderView request(@PathVariable String id, @Valid @RequestBody CancellationRequest input) {
    return service.requestCancellation(id, input.reason());
  }

  @PutMapping("/api/seller/orders/{id}/cancellation")
  public OrderView decide(@PathVariable String id, @Valid @RequestBody DecisionRequest input) {
    return service.decideCancellation(id, input.approved(), input.reason());
  }
}
