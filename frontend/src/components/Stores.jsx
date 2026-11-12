import { MapPin, Navigation, Clock } from 'lucide-react';
import { Dialog } from './Dialog';
import { PageLink } from '../workspace/Common';

const points = [
  { name: '東京駅', latitude: 35.6812, longitude: 139.7671 },
  { name: '横浜駅', latitude: 35.466, longitude: 139.622 },
  { name: '大宮駅', latitude: 35.906, longitude: 139.624 },
];

/**
 * A guide to the stores. The pickup store is the store of each product, so nothing is chosen here.
 * @param {{shop:ReturnType<import('../useShop').useShop>, onClose:()=>void}} props
 */
export function Stores({ shop, onClose }) {
  /** @param {import('react').ChangeEvent<HTMLSelectElement>} event */
  function changeLocation(event) {
    const point = points.find((item) => item.name === event.target.value);
    if (point) {
      shop.locate(point.latitude, point.longitude, point.name);
    }
  }
  return (
    <Dialog title="店舗一覧" onClose={onClose} wide>
      {shop.error && (
        <p className="error" role="alert">
          {shop.error}
        </p>
      )}
      <p className="muted">
        {shop.locationLabel}から近い順に表示しています。距離は直線距離です。商品は、その商品を販売する店舗で受け取ります。
      </p>
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
          return (
            <article className="store-card" key={store.id}>
              <div className="store-title">
                <MapPin size={22} />
                <h3>{store.name}</h3>
                {index === 0 && store.distanceKm !== null && <span className="pill">最寄り</span>}
                {store.distanceKm !== null && <strong>{store.distanceKm} km</strong>}
              </div>
              <p>{store.address}</p>
              <p>
                <Clock size={14} />
                {store.hours}
              </p>
              <PageLink href={`/store/${store.id}`}>店舗の紹介を見る</PageLink>
            </article>
          );
        })}
      </div>
    </Dialog>
  );
}
