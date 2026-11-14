package jp.kusakari.ec.commerce.controller;

import java.util.List;
import jp.kusakari.ec.commerce.dto.SalesDtos.SalesReport;
import jp.kusakari.ec.commerce.dto.SalesDtos.SalesStore;
import jp.kusakari.ec.commerce.service.SalesReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/** 店舗の注文実績と販売手数料（#130）。どれも読み取りだけ。 */
@RestController
@RequiredArgsConstructor
public class SalesReportController {

  private final SalesReportService service;

  @GetMapping("/api/seller/sales/stores")
  public List<SalesStore> stores() {
    return service.viewableStores();
  }

  @GetMapping("/api/seller/stores/{storeId}/sales")
  public SalesReport seller(@PathVariable long storeId) {
    return service.report(storeId);
  }

  @GetMapping("/api/operator/stores/{storeId}/sales")
  public SalesReport operator(@PathVariable long storeId) {
    return service.operatorReport(storeId);
  }
}
