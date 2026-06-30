export default function LocationCard({ location, index, total }) {
  if (location.type === 'semantic') {
    return (
      <div className="location-card" style={{ animationDelay: `${index * 0.08}s` }}>
        <div className="location-card-header">
          <span className="location-card-index">
            <span className="badge badge-semantic">📍 Semantic</span>
          </span>
          <span className="location-card-time">{location.timestamp_formatted}</span>
        </div>
        <div className="location-card-coords">
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {location.name || 'Unknown Location'}
          </p>
        </div>
      </div>
    );
  }

  const isRecent = index === 0;

  return (
    <div
      className={`location-card ${isRecent ? 'most-recent' : ''}`}
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      <div className="location-card-header">
        <span className="location-card-index">
          {isRecent ? (
            <span className="badge badge-recent">🟢 Most Recent</span>
          ) : (
            `Report ${index + 1}/${total}`
          )}
        </span>
        <span className="location-card-time">{location.timestamp_formatted}</span>
      </div>

      <div className="location-card-coords">
        <p>
          Lat: <span>{location.latitude?.toFixed(7)}</span>
        </p>
        <p>
          Lng: <span>{location.longitude?.toFixed(7)}</span>
        </p>
        {location.altitude != null && location.altitude !== 0 && (
          <p>
            Alt: <span>{location.altitude}m</span>
          </p>
        )}
        <p>
          Accuracy: <span>{location.accuracy}m</span>
        </p>
      </div>

      <div className="location-card-footer">
        <span className={`badge ${location.is_own_report ? 'badge-own' : 'badge-network'}`}>
          {location.is_own_report ? '📱 Own' : '📡 Network'}
        </span>
        {location.maps_link && (
          <a
            href={location.maps_link}
            target="_blank"
            rel="noopener noreferrer"
            className="popup-link"
            style={{ fontSize: 10, padding: '4px 10px' }}
          >
            🗺️ Google Maps
          </a>
        )}
      </div>
    </div>
  );
}
