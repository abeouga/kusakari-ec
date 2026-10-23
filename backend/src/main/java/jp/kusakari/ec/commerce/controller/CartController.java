package jp.kusakari.ec.commerce.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CartView;
import jp.kusakari.ec.commerce.dto.CommerceDtos.ItemRequest;
import jp.kusakari.ec.commerce.dto.CommerceDtos.StoreRequest;
import jp.kusakari.ec.commerce.service.CartService;
import jp.kusakari.ec.commerce.session.CartSessionResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/cart")
@RequiredArgsConstructor
public class CartController {

  private final CartService carts;
  private final CartSessionResolver sessions;

  @GetMapping
  public CartView get(HttpServletRequest request, HttpServletResponse response) {
    return carts.read(sessions.resolve(request, response));
  }

  @PutMapping("/items/{productId}")
  public CartView updateItem(
    @PathVariable String productId,
    @Valid @RequestBody ItemRequest input,
    HttpServletRequest request,
    HttpServletResponse response
  ) {
    return carts.updateItem(sessions.resolve(request, response), productId, input);
  }

  @PutMapping("/store")
  public CartView updateStore(
    @Valid @RequestBody StoreRequest input,
    HttpServletRequest request,
    HttpServletResponse response
  ) {
    return carts.updateStore(sessions.resolve(request, response), input);
  }

  @PutMapping("/guest-items")
  public CartView mergeGuestItems(
    @Valid @RequestBody jp.kusakari.ec.commerce.dto.CommerceDtos.GuestCartRequest input,
    HttpServletRequest request,
    HttpServletResponse response
  ) {
    return carts.mergeGuestItems(sessions.resolve(request, response), input);
  }
}
