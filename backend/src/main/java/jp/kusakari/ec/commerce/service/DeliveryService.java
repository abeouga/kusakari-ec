package jp.kusakari.ec.commerce.service;

import jp.kusakari.ec.commerce.dto.DeliveryDtos.DetailsView;
import jp.kusakari.ec.member.persistence.repository.PickupContactRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class DeliveryService {

  private final PickupContactRepository pickupContacts;

  /** The store pickup contact is kept on the member account and applied to every cart and order. */
  public DetailsView pickupDetails(String memberId, String paymentMethod) {
    return pickupContacts
      .findById(memberId)
      .map(contact ->
        new DetailsView(
          paymentMethod,
          contact.getRecipientName().trim(),
          contact.getRecipientPhone(),
          contact.getContactEmail()
        )
      )
      .orElseGet(() -> new DetailsView(paymentMethod, "", "", ""));
  }
}
