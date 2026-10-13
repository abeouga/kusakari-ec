import { MapPin, Navigation, Check, Clock } from 'lucide-react';
import { Dialog } from './Dialog';

const points = [
  { name: '東京駅', latitude: 35.6812, longitude: 139.7671 },
  { name: '横浜駅', latitude: 35.466, longitude: 139.622 },
  { name: '大宮駅', latitude: 35.906, longitude: 139.624 },
];

/** @param {{shop:ReturnType<import('../useShop').useShop>, onClose:()=>void}} props */
export function Stores({ shop, onClose }) {
  /** @param {import('react').ChangeEvent<HTMLSelectElement>} event */
  function changeLocation(event) {
    const point = points.find((item) => item.name === event.target.value);
    if (point) {
      shop.locate(point.latitude, point.longitude, point.name);
    }
  }
  return (
    <Dialog title="受取店舗を選ぶ" onClose={onClose} wide>
      {shop.error && (
        <p className="error" role="alert">
          {shop.error}
        </p>
      )}
      <p className="muted">{shop.locationLabel}から近い順に表示しています。距離は直線距離です。</p>
      <div className="location-controls">
        <label>
          距離の基準
          <select aria-label="距離の基準" disabled={shop.busy} value={shop.locationLabel} onChange={changeLocation}>
            {points.map((point) => (
              <option key={point.name}>{point.name}</option>
            ))}
            {shop.locationLabel === '現在地' && <option>現在地</option>}
          </select>
        </label>
        <button className="secondary-button" onClick={shop.geolocate} disabled={shop.busy}>
          <Navigation size={16} />
          現在地を使う
        </button>
      </div>
      <div className="store-list">
        {shop.stores.map((store, index) => {
          let selected = false;
          if (shop.cart) selected = store.id === shop.cart.storeId;
          let cardClass = 'store-card';
          let buttonClass = 'primary-button';
          if (selected) {
            cardClass = 'store-card selected';
            buttonClass = 'secondary-button';
          }
          return (
            <article className={cardClass} key={store.id}>
              <div className="store-title">
                <MapPin size={22} />
                <h3>{store.name}</h3>
                {index === 0 && <span className="pill">最寄り</span>}
                <strong>{store.distanceKm} km</strong>
              </div>
              <p>{store.address}</p>
              <p>
                <Clock size={14} />
                {store.hours}
              </p>
              <button
                className={buttonClass}
                disabled={shop.busy || selected}
                onClick={() => shop.selectStore(store.id)}
              >
                {selected && (
                  <>
                    <Check size={16} />
                    選択中
                  </>
                )}
                {!selected && 'この店舗で受け取る'}
              </button>
            </article>
          );
        })}
      </div>
    </Dialog>
  );
}
