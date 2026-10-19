package jp.kusakari.ec.shopping;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.List;
import jp.kusakari.ec.commerce.session.CartSessionResolver;
import jp.kusakari.ec.shopping.ShoppingDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;

@RestController
@RequiredArgsConstructor
public class ShoppingController {
  private final ShoppingService shopping;
  private final CartSessionResolver sessions;
  @GetMapping("/api/shopping-lists")
  public List<Summary> summaries() { return shopping.summaries(); }
  @GetMapping("/api/shopping-lists/{gardenId}")
  public Detail detail(@PathVariable String gardenId, HttpServletRequest request, HttpServletResponse response) {
    return shopping.detail(gardenId, sessions.resolve(request, response));
  }
  @GetMapping("/api/shopping-lists/{gardenId}/thumbnail")
  public ResponseEntity<byte[]> thumbnail(@PathVariable String gardenId) {
    return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG)
      .header("Cache-Control", "private, no-cache").body(shopping.thumbnail(gardenId));
  }
  @PostMapping("/api/cart/shopping-lists/{gardenId}/items")
  public TransferResult transfer(@PathVariable String gardenId, @Valid @RequestBody TransferRequest input,
                                  HttpServletRequest request, HttpServletResponse response) {
    return shopping.transfer(gardenId, sessions.resolve(request, response), input);
  }
}
