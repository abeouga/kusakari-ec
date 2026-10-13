package jp.kusakari.ec.commerce.service;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import jp.kusakari.ec.commerce.dto.DeliveryDtos.DetailsRequest;
import jp.kusakari.ec.commerce.dto.DeliveryDtos.DetailsView;
import jp.kusakari.ec.commerce.persistence.entity.DeliveryFields;
import jp.kusakari.ec.common.web.ApiException;
import org.springframework.stereotype.Service;

@Service
public class DeliveryService {

  public DeliveryFields validate(DetailsRequest input) {
    if (!input.requestedDate().isBlank()) {
      try {
        LocalDate.parse(input.requestedDate());
      } catch (DateTimeParseException error) {
        throw new ApiException(400, "INVALID_DATE", "希望日を正しく指定してください。");
      }
    }

    if (input.fulfillmentMethod().equals("DELIVERY")) {
      if (
        input.recipientName().isBlank() ||
        input.recipientPhone().isBlank() ||
        input.postalCode().isBlank() ||
        input.addressLine1().isBlank()
      ) {
        throw new ApiException(400, "DELIVERY_REQUIRED", "配送には受取者名・電話番号・郵便番号・住所が必要です。");
      }
      if (input.paymentMethod().equals("STORE")) {
        throw new ApiException(400, "INVALID_PAYMENT", "自宅配送では店頭払いを選択できません。");
      }
    }

    return new DeliveryFields(
      input.fulfillmentMethod(),
      input.paymentMethod(),
      input.recipientName().trim(),
      input.recipientPhone(),
      input.contactEmail(),
      input.postalCode(),
      input.addressLine1().trim(),
      input.addressLine2().trim(),
      input.requestedDate(),
      input.timeSlot()
    );
  }

  public int shippingFee(DeliveryFields details) {
    return details.getFulfillmentMethod().equals("DELIVERY") ? 800 : 0;
  }

  public DetailsView view(DeliveryFields details) {
    return new DetailsView(
      details.getFulfillmentMethod(),
      details.getPaymentMethod(),
      details.getRecipientName(),
      details.getRecipientPhone(),
      details.getContactEmail(),
      details.getPostalCode(),
      details.getAddressLine1(),
      details.getAddressLine2(),
      details.getRequestedDate(),
      details.getTimeSlot()
    );
  }
}
