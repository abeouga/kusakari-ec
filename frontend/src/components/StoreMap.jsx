import { MapPin } from 'lucide-react';

/** @typedef {{id:number,name:string,address?:string,latitude?:number,longitude?:number}} MapStore */

const WIDTH = 4;
const HEIGHT = 3;
const MARGIN = 0.14;

/**
 * Places stores by latitude and longitude on an even scale (east-west shortened by cos(latitude)).
 * @param {MapStore[]} stores
 * @returns {Map<number,{x:number,y:number}>} positions in percent of the map box
 */
export function storePositions(stores) {
  const located = stores.filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  const positions = new Map();
  if (!located.length) return positions;
  const lats = located.map((s) => Number(s.latitude));
  const meanLat = lats.reduce((sum, lat) => sum + lat, 0) / lats.length;
  const scale = Math.cos((meanLat * Math.PI) / 180);
  const points = located.map((s) => ({ id: s.id, x: Number(s.longitude) * scale, y: Number(s.latitude) }));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // One unit per percent on both axes keeps distances true; a single store sits in the middle.
  const span = Math.max((maxX - minX) / WIDTH, (maxY - minY) / HEIGHT) || 1;
  const usable = 1 - MARGIN * 2;
  for (const p of points) {
    const x = 0.5 + ((p.x - (minX + maxX) / 2) / (span * WIDTH)) * usable;
    const y = 0.5 - ((p.y - (minY + maxY) / 2) / (span * HEIGHT)) * usable;
    positions.set(p.id, { x: x * 100, y: y * 100 });
  }
  return positions;
}

/**
 * In-page map mock (issue #46): no external map API or tiles are loaded.
 * @param {{stores:MapStore[],value:number,onChoose:(id:number)=>void}} props
 */
export function StoreMap({ stores, value, onChoose }) {
  const positions = storePositions(stores);
  return (
    <div className="store-map" role="group" aria-label="店舗の地図">
      <div className="store-map-canvas" aria-hidden="true">
        <span className="store-map-water" />
        <span className="store-map-road store-map-road-a" />
        <span className="store-map-road store-map-road-b" />
        <span className="store-map-road store-map-road-c" />
      </div>
      {stores.map((store) => {
        const point = positions.get(store.id);
        if (!point) return null;
        const selected = store.id === value;
        return (
          <button
            key={store.id}
            type="button"
            className="store-map-pin"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            aria-pressed={selected}
            aria-label={`地図のピン：${store.name}`}
            title={store.name}
            onClick={() => onChoose(store.id)}
          >
            <MapPin size={selected ? 34 : 28} strokeWidth={2.2} aria-hidden="true" />
            {selected && <span className="store-map-pin-label">{store.name}</span>}
          </button>
        );
      })}
      <p className="store-map-note">地図は店舗の位置関係を示す簡易図です。</p>
    </div>
  );
}
