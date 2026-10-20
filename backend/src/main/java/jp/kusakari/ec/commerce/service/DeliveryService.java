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
    return new DeliveryFields(
      "PICKUP",
      "NONE",
      input.recipientName().trim(),
      input.recipientPhone(),
      input.contactEmail(),
      "",
      "",
      "",
      "",
      "ANY"
    );
  }

  public int shippingFee(DeliveryFields details) {
    return 0;
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
