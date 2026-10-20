/** @param {{details:import('../types').DeliveryDetails}} props */
export function DeliverySummary({ details }) {
  return (
    <div>
      <p>店舗受け取り</p>
      {details?.recipientName && <p>受取人：{details.recipientName}</p>}
      {details?.recipientPhone && <p>電話番号：{details.recipientPhone}</p>}
      {details?.contactEmail && <p>連絡先：{details.contactEmail}</p>}
    </div>
  );
}
