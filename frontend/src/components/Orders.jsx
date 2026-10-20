import { Dialog } from './Dialog';
import { OrderPage } from '../workspace/OrderPages';
/** @param {{shop:ReturnType<import('../useShop').useShop>,onClose:()=>void}} props */
export function Orders({ onClose }) {
  return (
    <Dialog title="注文履歴" onClose={onClose} wide>
      <OrderPage buyer />
    </Dialog>
  );
}
