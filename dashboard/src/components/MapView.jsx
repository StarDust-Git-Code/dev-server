import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon issue with webpack/vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker icons
function createIcon(color, isRecent = false) {
  const size = isRecent ? 16 : 12;
  const borderColor = isRecent ? '#8b5cf6' : color;
  const pulse = isRecent
    ? `<div style="position:absolute;width:${size + 16}px;height:${size + 16}px;top:-8px;left:-8px;border-radius:50%;background:rgba(139,92,246,0.25);animation:markerPulse 2s ease-out infinite;"></div>`
    : '';

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        ${pulse}
        <div style="
          width:${size}px;height:${size}px;
          background:${color};
          border:2.5px solid ${borderColor};
          border-radius:50%;
          box-shadow:0 0 12px ${color}88, 0 2px 8px rgba(0,0,0,0.4);
          position:relative;z-index:2;
        "></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  });
}

// Numbered route marker for tracking mode
function createRouteIcon(index, total) {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const size = isFirst || isLast ? 22 : 16;
  const bg = isFirst ? '#22c55e' : isLast ? '#8b5cf6' : '#64748b';
  const label = isFirst ? 'S' : isLast ? 'E' : (index + 1);

  return L.divIcon({
    className: 'route-marker',
    html: `
      <div style="
        width:${size}px;height:${size}px;
        background:${bg};
        border:2px solid white;
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:${size > 18 ? 10 : 8}px;font-weight:700;color:white;
        font-family:Inter,sans-serif;
        box-shadow:0 0 10px ${bg}88, 0 2px 6px rgba(0,0,0,0.5);
      ">${label}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  });
}

// Inject pulse keyframe animation
const styleEl = document.createElement('style');
styleEl.textContent = `
  @keyframes markerPulse {
    0% { transform: scale(1); opacity: 0.7; }
    100% { transform: scale(2.5); opacity: 0; }
  }
`;
document.head.appendChild(styleEl);

// Sub-component to fit map bounds when locations change
function FitBounds({ locations }) {
  const map = useMap();

  useEffect(() => {
    const geoLocs = locations.filter(l => l.type === 'geo' && l.latitude != null);
    if (geoLocs.length === 0) return;

    const bounds = L.latLngBounds(geoLocs.map(l => [l.latitude, l.longitude]));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 19 });
  }, [locations, map]);

  return null;
}

export default function MapView({ locations, deviceName, trackingMode, trackingHistory, geofence, onClearGeofence }) {
  const defaultCenter = [20, 0];
  const defaultZoom = 3;

  // Standard markers (non-tracking mode) - ONLY show the single latest location!
  const markers = useMemo(() => {
    const geoLocs = locations.filter(l => l.type === 'geo' && l.latitude != null);
    if (geoLocs.length === 0) return [];
    
    // Only take the first (most recent) location report
    const latest = geoLocs[0];
    return [{
      ...latest,
      isRecent: true,
      icon: createIcon(
        latest.is_own_report ? '#3b82f6' : '#f59e0b',
        true
      ),
    }];
  }, [locations]);

  // Route polyline from tracking history (sorted chronologically)
  const routePoints = useMemo(() => {
    if (!trackingMode || !trackingHistory || trackingHistory.length === 0) return [];
    return trackingHistory
      .filter(l => l.type === 'geo' && l.latitude != null)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(l => [l.latitude, l.longitude]);
  }, [trackingMode, trackingHistory]);

  // Route markers
  const routeMarkers = useMemo(() => {
    if (!trackingMode || !trackingHistory || trackingHistory.length === 0) return [];
    const sorted = trackingHistory
      .filter(l => l.type === 'geo' && l.latitude != null)
      .sort((a, b) => a.timestamp - b.timestamp);
    return sorted.map((loc, idx) => ({
      ...loc,
      icon: createRouteIcon(idx, sorted.length),
    }));
  }, [trackingMode, trackingHistory]);

  // Which set of locations to display — tracking history overrides normal when tracking
  const displayLocations = trackingMode && trackingHistory && trackingHistory.length > 0
    ? trackingHistory : locations;

  return (
    <div className="map-container">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        maxZoom={20}
        zoomControl={true}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          maxZoom={20}
        />

        <FitBounds locations={displayLocations} />

        {/* ── Tracking Mode: Route Polyline + Numbered Markers ── */}
        {trackingMode && routePoints.length > 1 && (
          <Polyline
            positions={routePoints}
            pathOptions={{
              color: '#8b5cf6',
              weight: 3,
              opacity: 0.8,
              dashArray: '8, 6',
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {trackingMode && routeMarkers.map((loc, idx) => (
          <Marker
            key={`route-${loc.timestamp}-${idx}`}
            position={[loc.latitude, loc.longitude]}
            icon={loc.icon}
          >
            <Popup>
              <div className="popup-content">
                <div className="popup-title">
                  {idx === 0 ? '🟢 Start' : idx === routeMarkers.length - 1 ? '🟣 Latest' : `📌 Point ${idx + 1}`}
                </div>
                <div className="popup-coords">
                  <span className="popup-label">Lat</span>
                  <span className="popup-value">{loc.latitude.toFixed(7)}</span>
                  <span className="popup-label">Lng</span>
                  <span className="popup-value">{loc.longitude.toFixed(7)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  🕐 {loc.timestamp_formatted}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── Normal Mode: Markers + Accuracy Circles ── */}
        {!trackingMode && markers.map((loc, idx) => (
          <Circle
            key={`circle-${loc.latitude}-${loc.longitude}-${loc.timestamp}-${idx}`}
            center={[loc.latitude, loc.longitude]}
            radius={loc.accuracy || 50}
            pathOptions={{
              color: loc.isRecent ? '#8b5cf6' : '#f59e0b',
              fillColor: loc.isRecent ? '#8b5cf6' : '#f59e0b',
              fillOpacity: 0.12,
              weight: 1.5,
              opacity: 0.4,
              dashArray: loc.isRecent ? null : '4, 4',
            }}
          />
        ))}

        {!trackingMode && markers.map((loc, idx) => (
          <Marker
            key={`${loc.latitude}-${loc.longitude}-${loc.timestamp}-${idx}`}
            position={[loc.latitude, loc.longitude]}
            icon={loc.icon}
          >
            <Popup>
              <div className="popup-content">
                <div className="popup-title">
                  {loc.isRecent ? '🟢' : '📌'} {deviceName || 'Tracker'}
                  {loc.isRecent && <span className="badge badge-recent">Latest</span>}
                </div>
                <div className="popup-coords">
                  <span className="popup-label">Lat</span>
                  <span className="popup-value">{loc.latitude.toFixed(7)}</span>
                  <span className="popup-label">Lng</span>
                  <span className="popup-value">{loc.longitude.toFixed(7)}</span>
                  {loc.altitude != null && loc.altitude !== 0 && (
                    <>
                      <span className="popup-label">Alt</span>
                      <span className="popup-value">{loc.altitude}m</span>
                    </>
                  )}
                  <span className="popup-label">Accuracy</span>
                  <span className="popup-value">{loc.accuracy}m</span>
                </div>
                <div className="popup-meta">
                  <span className={`badge ${loc.is_own_report ? 'badge-own' : 'badge-network'}`}>
                    {loc.is_own_report ? '📱 Own Report' : '📡 Network'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                  🕐 {loc.timestamp_formatted}
                </div>
                {loc.maps_link && (
                  <a
                    href={loc.maps_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="popup-link"
                  >
                    🗺️ Open in Google Maps
                  </a>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── Geofence Circle ── */}
        {geofence && (
          <>
            <Circle
              center={geofence.center}
              radius={geofence.radius}
              pathOptions={{
                color: '#06b6d4',
                fillColor: '#06b6d4',
                fillOpacity: 0.08,
                weight: 2,
                dashArray: '6, 4',
                opacity: 0.7,
              }}
            />
            <Marker
              position={geofence.center}
              icon={L.divIcon({
                className: 'geofence-center-marker',
                html: `
                  <div style="
                    width:20px;height:20px;
                    background:#06b6d4;
                    border:3px solid white;
                    border-radius:50%;
                    box-shadow:0 0 16px #06b6d488, 0 2px 8px rgba(0,0,0,0.5);
                  "></div>
                `,
                iconSize: [20, 20],
                iconAnchor: [10, 10],
                popupAnchor: [0, -14],
              })}
            >
              <Popup>
                <div className="popup-content">
                  <div className="popup-title">📍 Geofence Center</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {geofence.sourceName} · {geofence.radius}m radius
                  </div>
                  <div className="popup-coords">
                    <span className="popup-label">Lat</span>
                    <span className="popup-value">{geofence.center[0].toFixed(7)}</span>
                    <span className="popup-label">Lng</span>
                    <span className="popup-value">{geofence.center[1].toFixed(7)}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      {locations.length === 0 && !trackingMode && (
        <div className="map-empty-overlay">
          <div className="map-empty-card">
            <div className="empty-state-icon">🗺️</div>
            <div className="empty-state-title">Select a Tracker</div>
            <div className="empty-state-desc">
              Choose a tracker from the sidebar to view its live location on the map.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
