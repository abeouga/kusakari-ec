package jp.kusakari.ec.commerce.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CheckoutRequest;
import jp.kusakari.ec.commerce.dto.CommerceDtos.OrderView;
import jp.kusakari.ec.commerce.dto.DeliveryDtos.DetailsRequest;
import jp.kusakari.ec.commerce.service.CheckoutService;
import jp.kusakari.ec.commerce.service.OrderService;
import jp.kusakari.ec.commerce.session.CartSessionResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {

  private final CheckoutService checkout;
  private final OrderService orders;
  private final CartSessionResolver sessions;

  @PostMapping
  public OrderView checkout(
    @Valid @RequestBody CheckoutRequest input,
    HttpServletRequest request,
    HttpServletResponse response
  ) {
    return checkout.placeOrder(sessions.resolve(request, response), input);
  }

  @GetMapping
  public List<OrderView> list(HttpServletRequest request, HttpServletResponse response) {
    return orders.list(sessions.resolve(request, response));
  }

  @PutMapping("/{id}")
  public OrderView updateDetails(
    @PathVariable String id,
    @Valid @RequestBody DetailsRequest input,
    HttpServletRequest request,
    HttpServletResponse response
  ) {
    return orders.updateDetails(sessions.resolve(request, response), id, input);
  }

  @DeleteMapping("/{id}")
  public Map<String, Boolean> delete(
    @PathVariable String id,
    HttpServletRequest request,
    HttpServletResponse response
  ) {
    orders.delete(sessions.resolve(request, response), id);
    return Map.of("deleted", true);
  }
}
