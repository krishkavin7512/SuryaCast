import { useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet';
import { CITIES, type Place } from '../state';

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTR = 'Imagery &copy; Esri, Maxar, Earthstar Geographics';

function ClickHandler({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export function CitiesMap({ height = 420, highlight }: { height?: number; highlight?: string }) {
  return (
    <MapContainer center={[22.5, 81]} zoom={4} minZoom={3} style={{ height }} scrollWheelZoom={false} attributionControl>
      <TileLayer url={ESRI} attribution={ESRI_ATTR} maxZoom={19} />
      {CITIES.map((c) => (
        <CircleMarker
          key={c.id}
          center={[c.lat, c.lon]}
          radius={highlight === c.id ? 9 : 6}
          pathOptions={{
            color: '#ffffff',
            weight: 2,
            fillColor: c.split === 'train' ? '#e0621f' : '#3987e5',
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            <strong>{c.name}</strong> · {c.split === 'train' ? 'training city' : 'unseen test city'}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

export default function MapPicker({ initial, onPick }: { initial: Place; onPick: (lat: number, lon: number) => void }) {
  const [pin, setPin] = useState<[number, number] | null>(null);
  return (
    <div className="relative">
      <MapContainer center={[initial.lat, initial.lon]} zoom={6} minZoom={3} style={{ height: '62vh' }} attributionControl>
        <TileLayer url={ESRI} attribution={ESRI_ATTR} maxZoom={19} />
        <ClickHandler onClick={(lat, lon) => setPin([lat, lon])} />
        {CITIES.map((c) => (
          <CircleMarker key={c.id} center={[c.lat, c.lon]} radius={5} pathOptions={{ color: '#fff', weight: 1.5, fillColor: '#e0621f', fillOpacity: 0.9 }}>
            <Tooltip>{c.name}</Tooltip>
          </CircleMarker>
        ))}
        {pin && <CircleMarker center={pin} radius={10} pathOptions={{ color: '#fff', weight: 3, fillColor: '#ffc53d', fillOpacity: 1 }} />}
      </MapContainer>
      <div className="absolute inset-x-0 bottom-0 z-[1000] flex flex-wrap items-center justify-between gap-3 bg-surface/95 px-5 py-3 backdrop-blur">
        <span className="text-sm text-ink-2">
          {pin ? (
            <>
              Selected <strong className="tabular text-ink">{pin[0].toFixed(4)}°N, {pin[1].toFixed(4)}°E</strong>
            </>
          ) : (
            'Click on the map to drop a pin.'
          )}
        </span>
        <button
          disabled={!pin}
          onClick={() => pin && onPick(pin[0], pin[1])}
          className="btn btn--primary btn--sm"
        >
          Use this location
        </button>
      </div>
    </div>
  );
}
