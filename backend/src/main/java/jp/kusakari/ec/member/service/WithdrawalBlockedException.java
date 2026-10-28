package jp.kusakari.ec.member.service;

import java.util.List;
import jp.kusakari.ec.common.web.ApiException;

/** Withdrawal was refused; the response lists the buyer's open orders so the screen can link to them. */
public class WithdrawalBlockedException extends ApiException {

  public record BlockingOrder(String id, String status) {}

  private final List<BlockingOrder> orders;

  public WithdrawalBlockedException(String code, String message, List<BlockingOrder> orders) {
    super(409, code, message);
    this.orders = List.copyOf(orders);
  }

  public List<BlockingOrder> orders() {
    return orders;
  }
}
