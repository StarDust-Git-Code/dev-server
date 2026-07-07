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

  // Fallbacks / mockup defaults if live data is not fully populated
  const battery = telemetry?.battery_pct != null ? `${telemetry.battery_pct}%` : '87%';
  const speed = location?.speed != null ? `${Math.round(location.speed * 3.6)} km/h` : '32 km/h';
  const accuracy = location?.accuracy != null ? `${Math.round(location.accuracy)} m` : '8 m';
  const lastSeen = telemetry?.timestamp_formatted || '12 sec ago';
  
  const latitude = location?.latitude || 12.9901;
  const longitude = location?.longitude || 80.2565;
  const coordinates = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

  // Meta mapping based on selected device type/name
  let studentName = 'Arjun Kumar';
  let parentInfo = 'Ravi Kumar (98400 12345)';
  let schoolName = 'ABC Matric. Hr. Sec. School';

  if (device.name.toLowerCase().includes('samsung')) {
    studentName = 'Sarah Jenkins';
    parentInfo = 'Mark Jenkins (94452 98765)';
    schoolName = 'Oakridge International';
  } else if (device.name.toLowerCase().includes('esp')) {
    studentName = 'Rahul Dravid';
    parentInfo = 'Sanjay Dravid (91234 56789)';
    schoolName = 'KV IIT Campus';
  }

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
                  <span className="tile-value green">Strong (-62 dBm)</span>
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
                  <span className="tile-value">v2.3.1</span>
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
                  <a href={`https://www.google.com/maps?q=${latitude},${longitude}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-brand)', textDecoration: 'none', fontWeight: 600 }}>
                    View on Google Maps
                  </a>
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
            <ul>
              <li>02:46 PM - 12.9901, 80.2565 (Speed: 32 km/h)</li>
              <li>02:41 PM - 12.9885, 80.2550 (Speed: 28 km/h)</li>
              <li>02:36 PM - 12.9850, 80.2512 (Speed: 30 km/h)</li>
            </ul>
          </div>
        )}

        {activeTab === 'events' && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            <p style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Device Event Log</p>
            <ul>
              <li>🟢 02:46 PM - Location check normal</li>
              <li>🔵 02:44 PM - Entered school main fence</li>
              <li>🟡 02:36 PM - Strap status normal</li>
            </ul>
          </div>
        )}

        {activeTab === 'logs' && (
          <div style={{ fontSize: '11px', fontFamily: 'SF Mono, monospace', color: 'var(--text-secondary)', backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px', overflowX: 'auto' }}>
            {"{"}
            <br />
            &nbsp;&nbsp;"canonic_id": "{device.canonic_id}",
            <br />
            &nbsp;&nbsp;"battery": {telemetry?.battery_pct || 87},
            <br />
            &nbsp;&nbsp;"events": {JSON.stringify(telemetry?.active_events || [])},
            <br />
            &nbsp;&nbsp;"last_lat": {latitude},
            <br />
            &nbsp;&nbsp;"last_lng": {longitude}
            <br />
            {"}"}
          </div>
        )}
      </div>
    </div>
  );
}
