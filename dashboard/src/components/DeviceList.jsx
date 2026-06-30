function getStatusInfo(status) {
  switch (status) {
    case 'active':
      return { color: '#22c55e', label: 'Active', emoji: '🟢' };
    case 'recent':
      return { color: '#f59e0b', label: 'Recently Seen', emoji: '🟡' };
    case 'inactive':
      return { color: '#ef4444', label: 'Inactive', emoji: '🔴' };
    default:
      return { color: '#64748b', label: 'Unknown', emoji: '⚪' };
  }
}

export default function DeviceList({ devices, loading, error, selectedId, onSelect, onDismissError, deviceStatuses, onSetGeofence, geofenceSourceId }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">Trackers</div>
        <div className="sidebar-count">
          {loading ? 'Loading…' : `${devices.length} device${devices.length !== 1 ? 's' : ''} found`}
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={onDismissError} aria-label="Dismiss error">✕</button>
        </div>
      )}

      <div className="device-list">
        {!loading && devices.length === 0 && !error && (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <div className="empty-state-icon">📱</div>
            <div className="empty-state-title">No Trackers</div>
            <div className="empty-state-desc">
              Click "Refresh Devices" to load your registered trackers from Google.
            </div>
          </div>
        )}

        {devices.map((device) => {
          const status = deviceStatuses?.[device.canonic_id];
          const statusInfo = status ? getStatusInfo(status.status) : null;
          const isGeofenceSource = geofenceSourceId === device.canonic_id;

          return (
            <div
              key={device.canonic_id}
              className={`device-card ${selectedId === device.canonic_id ? 'active' : ''}`}
              onClick={() => onSelect(device)}
              role="button"
              tabIndex={0}
              id={`device-card-${device.id}`}
            >
              <div className="device-icon">
                {isGeofenceSource ? '📍' : '🏷️'}
              </div>
              <div className="device-info">
                <div className="device-name">
                  {device.name || 'Unnamed Tracker'}
                  {isGeofenceSource && <span className="geofence-badge">FENCE</span>}
                </div>
                <div className="device-id">{device.canonic_id.slice(0, 24)}…</div>
                {statusInfo && (
                  <div className="device-status">
                    <span
                      className={`device-status-dot ${status.status === 'active' ? 'pulsing' : ''}`}
                      style={{ backgroundColor: statusInfo.color }}
                    />
                    <span className="device-status-label" style={{ color: statusInfo.color }}>
                      {statusInfo.label}
                    </span>
                    {status.lastSeen && (
                      <span className="device-status-time">
                        · {status.lastSeen}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                className="geofence-set-btn"
                title="Set 100m geofence around this device"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetGeofence(device);
                }}
              >
                {isGeofenceSource ? '✅' : '⊙'}
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
