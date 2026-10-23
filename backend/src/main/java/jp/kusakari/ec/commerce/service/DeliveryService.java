package jp.kusakari.ec.commerce.service;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import jp.kusakari.ec.commerce.dto.DeliveryDtos.DetailsRequest;
import jp.kusakari.ec.commerce.dto.DeliveryDtos.DetailsView;
import jp.kusakari.ec.commerce.persistence.entity.DeliveryFields;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.member.persistence.entity.PickupContactEntity;
import org.springframework.stereotype.Service;

@Service
public class DeliveryService {

  /** The store pickup contact is kept on the member account and applied to every cart and order. */
  public DeliveryFields pickupFields(PickupContactEntity contact) {
    if (contact == null) return DeliveryFields.empty();
    return validate(
      new DetailsRequest(contact.getRecipientName(), contact.getRecipientPhone(), contact.getContactEmail())
    );
  }

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
