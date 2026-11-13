package jp.kusakari.ec.store.controller;

import jakarta.validation.Valid;
import java.util.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jp.kusakari.ec.store.service.StoreClosureService;
import jp.kusakari.ec.store.service.StoreService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class StoreController {

  private final StoreService service;
  private final StoreClosureService closures;

  /** 運営のまとめてキャンセルの理由。購入者への通知と、注文の回答の欄に入る。 */
  public record CancellationRequest(@NotBlank @Size(max = 500) String reason) {}

  @GetMapping("/api/stores/{id}")
  public StoreService.Profile get(@PathVariable long id) {
    return service.get(id);
  }

  @PutMapping("/api/seller/stores/{id}")
  public StoreService.Profile save(@PathVariable long id, @Valid @RequestBody StoreService.Input in) {
    return service.save(id, in);
  }

  public record PublishedRequest(boolean published) {}

  @GetMapping("/api/seller/stores")
  public List<StoreService.Profile> mine() {
    return service.mine();
  }

  @PostMapping("/api/seller/stores")
  @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  public StoreService.Profile create(@Valid @RequestBody StoreService.Input in) {
    return service.create(in);
  }

  @PutMapping("/api/seller/stores/{id}/published")
  public StoreService.Profile publish(@PathVariable long id, @RequestBody PublishedRequest in) {
    return service.publish(id, in.published());
  }

  @GetMapping("/api/operator/stores")
  public List<StoreService.Profile> list() {
    return service.list();
  }

  // 店舗の閉鎖（#79）。オーナーは出店者の API、運営は運営の API から操作する。どちらも同じ処理で、操作した人の種別で記録する。
  @PostMapping({ "/api/seller/stores/{id}/closure", "/api/operator/stores/{id}/closure" })
  public StoreService.Profile startClosing(@PathVariable long id) {
    closures.start(id);
    return service.managed(id);
  }

  @DeleteMapping({ "/api/seller/stores/{id}/closure", "/api/operator/stores/{id}/closure" })
  public StoreService.Profile cancelClosing(@PathVariable long id) {
    closures.cancel(id);
    return service.managed(id);
  }

  /** 運営が、閉鎖中の店舗の未完了の注文をまとめてキャンセルする（返金・在庫の戻し・通知）。 */
  @PostMapping("/api/operator/stores/{id}/order-cancellations")
  public Map<String, Object> cancelOrders(@PathVariable long id, @Valid @RequestBody CancellationRequest in) {
    int cancelled = closures.cancelOrders(id, in.reason());
    return Map.of("cancelled", cancelled, "store", service.managed(id));
  }
}
