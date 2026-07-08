import { useState } from 'react';

export default function DetailPanel({ device, telemetry, location, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');

  if (!device) {
    return (
      <div className="detail-pane empty-state">
        <div className="empty-state-icon">📱</div>
        <div className="empty-state-title">No Device Selected</div>
        <div className="empty-state-desc">Select a device from the list to view detailed telemetry.</div>
      </div>
    );
  }

  // Read real data values with clean N/A fallbacks
  const batteryPct = telemetry?.battery_pct != null ? telemetry.battery_pct : device.battery_pct;
  const battery = batteryPct != null ? `${batteryPct}%` : 'N/A';
  const speed = location?.speed != null ? `${Math.round(location.speed * 3.6)} km/h` : 'N/A';
  const accuracy = location?.accuracy != null ? `${Math.round(location.accuracy)} m` : 'N/A';
  const lastSeen = telemetry?.timestamp_formatted || (location?.timestamp_formatted ? `${location.timestamp_formatted} (FMDN)` : 'N/A');
  
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  const coordinates = latitude != null && longitude != null ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : 'N/A';

  // Read meta settings
  const studentName = 'Not Assigned';
  const parentInfo = 'Not Assigned';
  const schoolName = 'Not Assigned';

  return (
    <div className="detail-pane">
      <div className="detail-header">
        <div className="detail-title-group">
          <span className="detail-title">{device.name}</span>
          <span className="detail-subtitle">{device.canonic_id}</span>
        </div>
        <button className="btn-close-detail" onClick={onClose} title="Close Panel">
          ✕
        </button>
      </div>

      <div className="detail-tabs-header">
        {['overview', 'history', 'events', 'logs'].map((tab) => (
          <button
            key={tab}
            className={`detail-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="detail-body">
        {activeTab === 'overview' && (
          <>
            <div className="detail-stats-grid">
              <div className="detail-stat-tile">
                <span className="tile-label">🔋 Battery</span>
                <span className="tile-value-group">
                  <span className="tile-value green">{battery}</span>
                </span>
              </div>
              <div className="detail-stat-tile">
                <span className="tile-label">📶 Signal</span>
                <span className="tile-value-group">
                  <span className="tile-value">N/A</span>
                </span>
              </div>
              <div className="detail-stat-tile">
                <span className="tile-label">🕒 Last Update</span>
                <span className="tile-value-group">
                  <span className="tile-value">{lastSeen}</span>
                </span>
              </div>
              <div className="detail-stat-tile">
                <span className="tile-label">🏃 Speed</span>
                <span className="tile-value-group">
                  <span className="tile-value blue">{speed}</span>
                </span>
              </div>
              <div className="detail-stat-tile">
                <span className="tile-label">🎯 Accuracy</span>
                <span className="tile-value-group">
                  <span className="tile-value green">{accuracy}</span>
                </span>
              </div>
              <div className="detail-stat-tile">
                <span className="tile-label">📦 Version</span>
                <span className="tile-value-group">
                  <span className="tile-value">N/A</span>
                </span>
              </div>
            </div>

            <div className="detail-card">
              <span className="detail-card-title">Coordinates</span>
              <div className="detail-card-row">
                <span className="row-label">GPS Coordinate</span>
                <span className="row-value" style={{ fontFamily: 'SF Mono, monospace', fontSize: '11px' }}>
                  {coordinates}
                </span>
              </div>
              <div className="detail-card-row">
                <span className="row-label">Map View</span>
                <span className="row-value">
                  {latitude != null && longitude != null ? (
                    <a href={`https://www.google.com/maps?q=${latitude},${longitude}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-brand)', textDecoration: 'none', fontWeight: 600 }}>
                      View on Google Maps
                    </a>
                  ) : (
                    'N/A'
                  )}
                </span>
              </div>
            </div>

            <div className="detail-card">
              <span className="detail-card-title">Associated Metadata</span>
              <div className="detail-card-row">
                <span className="row-label">Student</span>
                <span className="row-value">{studentName}</span>
              </div>
              <div className="detail-card-row">
                <span className="row-label">Parent</span>
                <span className="row-value">{parentInfo}</span>
              </div>
              <div className="detail-card-row">
                <span className="row-label">School</span>
                <span className="row-value">{schoolName}</span>
              </div>
            </div>

            <button className="btn-profile" onClick={() => alert('Opening full profile view...')}>
              View Full Profile
            </button>
          </>
        )}

        {activeTab === 'history' && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            <p style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Breadcrumb History Trail</p>
            <p>No tracking history recorded. Toggle "Start Live Tracking" to collect coordinate breadcrumbs.</p>
          </div>
        )}

        {activeTab === 'events' && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            <p style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Device Event Log</p>
            <p>No events logged. Location and status updates will register here during active sync.</p>
          </div>
        )}

        {activeTab === 'logs' && (
          <div style={{ fontSize: '11px', fontFamily: 'SF Mono, monospace', color: 'var(--text-secondary)', backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px', overflowX: 'auto' }}>
            {"{"}
            <br />
            &nbsp;&nbsp;"canonic_id": "{device.canonic_id}",
            <br />
            &nbsp;&nbsp;"battery": {batteryPct != null ? batteryPct : "null"},
            <br />
            &nbsp;&nbsp;"events": {JSON.stringify(telemetry?.active_events || [])},
            <br />
            &nbsp;&nbsp;"last_lat": {latitude != null ? latitude : "null"},
            <br />
            &nbsp;&nbsp;"last_lng": {longitude != null ? longitude : "null"}
            <br />
            {"}"}
          </div>
        )}
      </div>
    </div>
  );
}
