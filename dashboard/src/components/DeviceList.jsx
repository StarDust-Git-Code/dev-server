import { useState } from 'react';

export default function DeviceList({
  devices,
  loading,
  error,
  selectedId,
  onSelect,
  onDismissError,
  deviceStatuses,
  onSetGeofence,
  geofenceSourceId,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [batteryFilter, setBatteryFilter] = useState('all');

  // Filters logic
  const filteredDevices = devices.filter((device) => {
    // Search filter
    const matchesSearch =
      device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.canonic_id.toLowerCase().includes(searchTerm.toLowerCase());

    // Status filter
    const statusObj = deviceStatuses?.[device.canonic_id];
    const status = statusObj?.status || 'inactive';
    let matchesStatus = true;
    if (statusFilter === 'online') {
      matchesStatus = status === 'active' || status === 'recent';
    } else if (statusFilter === 'offline') {
      matchesStatus = status === 'inactive';
    } else if (statusFilter === 'sos') {
      // Check if EID indicates SOS or state is SOS
      matchesStatus = statusObj?.lastSeen?.toLowerCase().includes('sos') || 
                      device.name.toLowerCase().includes('sos');
    }

    // Battery filter
    let matchesBattery = true;
    const battery = device.battery_pct;
    if (batteryFilter === 'low') {
      matchesBattery = battery != null && battery < 20;
    } else if (batteryFilter === 'medium') {
      matchesBattery = battery != null && battery >= 20 && battery < 70;
    } else if (batteryFilter === 'high') {
      matchesBattery = battery != null && battery >= 70;
    }

    // School filter (mock metadata match)
    let matchesSchool = true;
    if (schoolFilter !== 'all') {
      let mockSchool = 'ABC Matric. Hr. Sec. School';
      if (device.name.toLowerCase().includes('samsung')) {
        mockSchool = 'Oakridge International';
      } else if (device.name.toLowerCase().includes('esp')) {
        mockSchool = 'KV IIT Campus';
      }
      matchesSchool = mockSchool.toLowerCase().includes(schoolFilter.toLowerCase());
    }

    return matchesSearch && matchesStatus && matchesBattery && matchesSchool;
  });

  function getStatusLabel(device) {
    const statusObj = deviceStatuses?.[device.canonic_id];
    if (!statusObj) return { label: 'Offline', className: 'offline' };

    // Group-based dynamic status injection (e.g. SOS, Strap Removed)
    if (device.name.toLowerCase().includes('sos')) {
      return { label: 'SOS', className: 'sos' };
    }
    if (device.name.toLowerCase().includes('strap')) {
      return { label: 'Strap Out', className: 'idle' };
    }

    const status = statusObj.status;
    if (status === 'active') return { label: 'Online', className: 'active' };
    if (status === 'recent') return { label: 'Idle', className: 'idle' };
    return { label: 'Offline', className: 'offline' };
  }

  return (
    <div className="trackers-pane">
      <div className="pane-header">
        <span className="pane-title">Devices ({filteredDevices.length})</span>
        
        {/* Search bar inside trackers list */}
        <div style={{ position: 'relative', width: '100%' }}>
          <input
            type="text"
            placeholder="Search device..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 8px 8px 30px',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              fontSize: '12px',
              outline: 'none',
              backgroundColor: '#f8fafc',
            }}
          />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '12px' }}>🔍</span>
        </div>

        <div className="pane-filters">
          <select
            className="pane-select"
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value)}
            aria-label="Filter by School"
          >
            <option value="all">All Schools</option>
            <option value="abc">ABC Matric</option>
            <option value="oakridge">Oakridge</option>
            <option value="kv">KV IIT</option>
          </select>

          <select
            className="pane-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by Status"
          >
            <option value="all">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="sos">SOS</option>
          </select>

          <select
            className="pane-select"
            value={batteryFilter}
            onChange={(e) => setBatteryFilter(e.target.value)}
            aria-label="Filter by Battery"
          >
            <option value="all">All Battery</option>
            <option value="high">High (&gt;70%)</option>
            <option value="medium">Medium</option>
            <option value="low">Low (&lt;20%)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={onDismissError} aria-label="Dismiss error">✕</button>
        </div>
      )}

      <div className="device-list-container">
        {loading && <div className="loading-indicator">Loading trackers…</div>}
        
        {!loading && filteredDevices.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-icon">📱</span>
            <span className="empty-state-title">No Trackers Found</span>
            <span className="empty-state-desc">Try clearing filters or search term.</span>
          </div>
        )}

        {!loading &&
          filteredDevices.map((device) => {
            const isSelected = selectedId === device.canonic_id;
            const statusInfo = getStatusLabel(device);
            const statusObj = deviceStatuses?.[device.canonic_id];
            
            // Resolve battery percentage
            const batteryPct = device.battery_pct;
            const isGeofenceSource = geofenceSourceId === device.canonic_id;

            return (
              <div
                key={device.canonic_id}
                className={`device-card-item ${isSelected ? 'active' : ''}`}
                onClick={() => onSelect(device)}
              >
                <div className="device-card-left">
                  <div className="device-avatar-wrapper">
                    {isGeofenceSource ? '📍' : device.name.toLowerCase().includes('samsung') ? '📱' : '⌚'}
                  </div>
                  <div className="device-meta">
                    <span className="device-card-title">{device.name}</span>
                    <span className="device-card-subtitle">
                      {device.canonic_id.slice(0, 8)}...{device.canonic_id.slice(-4)}
                    </span>
                    <div className="device-card-status-info">
                      <span className={`status-badge ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                      {statusObj?.lastSeen && (
                        <span className="last-time">
                          {statusObj.lastSeen.replace('just now', 'now')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="device-card-right">
                  {batteryPct != null ? (
                    <div className="battery-display">
                      <span className={`battery-icon ${batteryPct < 20 ? 'battery-low' : batteryPct < 70 ? 'battery-medium' : 'battery-high'}`}>
                        {batteryPct < 20 ? '🪫' : '🔋'}
                      </span>
                      <span>{batteryPct}%</span>
                    </div>
                  ) : (
                    <div className="battery-display" style={{ opacity: 0.5 }}>
                      <span>N/A</span>
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetGeofence(device);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: isGeofenceSource ? 'var(--color-brand)' : 'var(--text-tertiary)',
                    }}
                    title="Toggle Geofence around this device"
                  >
                    {isGeofenceSource ? '🎯' : '⊙'}
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
