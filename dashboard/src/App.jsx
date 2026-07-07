import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import StatsRow from './components/StatsRow';
import DeviceList from './components/DeviceList';
import MapView from './components/MapView';
import DetailPanel from './components/DetailPanel';
import RecentEvents from './components/RecentEvents';
import LoadingOverlay from './components/LoadingOverlay';
import { useDevices } from './hooks/useDevices';
import { useLocation } from './hooks/useLocation';
import { API_BASE } from './config';
import './index.css';

// Haversine distance in meters
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Compute tracker status from most recent location timestamp
function computeStatus(locations) {
  if (!locations || locations.length === 0) return null;
  const geoLocs = locations.filter(l => l.type === 'geo' && l.timestamp);
  if (geoLocs.length === 0) return null;

  const mostRecent = Math.max(...geoLocs.map(l => l.timestamp));
  const ageSec = Date.now() / 1000 - mostRecent;

  let lastSeen;
  if (ageSec < 60) lastSeen = 'just now';
  else if (ageSec < 3600) lastSeen = `${Math.floor(ageSec / 60)}m ago`;
  else if (ageSec < 86400) lastSeen = `${Math.floor(ageSec / 3600)}h ago`;
  else lastSeen = `${Math.floor(ageSec / 86400)}d ago`;

  let status;
  if (ageSec < 15 * 60) status = 'active';
  else if (ageSec < 60 * 60) status = 'recent';
  else status = 'inactive';

  return { status, lastSeen };
}

function App() {
  const {
    devices,
    loading: devicesLoading,
    error: devicesError,
    fetchDevices,
    setError: setDevicesError,
  } = useDevices();

  const {
    locations,
    loading: locationLoading,
    error: locationError,
    deviceName,
    fetchLocation,
    clearLocations,
    setError: setLocationError,
  } = useLocation();

  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [deviceStatuses, setDeviceStatuses] = useState({});
  const [telemetry, setTelemetry] = useState(null);

  // Tracking mode
  const [trackingMode, setTrackingMode] = useState(false);
  const [trackingHistory, setTrackingHistory] = useState([]);

  // Live dynamic events log state
  const [events, setEvents] = useState([]);

  // Fetch telemetry helper
  const fetchTelemetry = useCallback(async (deviceId) => {
    try {
      const res = await fetch(`${API_BASE}/telemetry/${deviceId}`);
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data);
      } else {
        setTelemetry(null);
      }
    } catch {
      setTelemetry(null);
    }
  }, []);

  // Location cache per device (for geofencing)
  const [locationsCache, setLocationsCache] = useState({});

  // Geofencing
  const [geofence, setGeofence] = useState(null); // { center: [lat, lng], radius: 100, sourceName, sourceId }
  const [geofenceAlerts, setGeofenceAlerts] = useState([]); // [{ deviceName, distance, timestamp }]

  const intervalRef = useRef(null);
  const trackingRef = useRef(null);

  // Check API health on mount
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (res.ok) {
          setApiConnected(true);
          fetchDevices();
        }
      } catch {
        setApiConnected(false);
      }
    }
    checkHealth();

    const healthInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/health`);
        setApiConnected(res.ok);
      } catch {
        setApiConnected(false);
      }
    }, 15000);

    return () => clearInterval(healthInterval);
  }, [fetchDevices]);

  // Auto-refresh logic
  useEffect(() => {
    if (autoRefresh && selectedDevice) {
      intervalRef.current = setInterval(() => {
        fetchLocation(selectedDevice.canonic_id, selectedDevice.name);
        fetchTelemetry(selectedDevice.canonic_id);
      }, 60000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, selectedDevice, fetchLocation, fetchTelemetry]);

  // Update device status + cache whenever locations or telemetry changes
  useEffect(() => {
    if (selectedDevice) {
      let status = null;

      // Try computing from Google locations first
      if (locations.length > 0) {
        status = computeStatus(locations);
      }

      // Override to Active if we have a recent local telemetry relay
      if (telemetry && telemetry.timestamp) {
        const ageSec = Date.now() / 1000 - telemetry.timestamp;
        if (ageSec < 60) {
          status = {
            status: 'active',
            lastSeen: 'just now (Relay)'
          };
        }
      }

      if (status) {
        setDeviceStatuses(prev => ({
          ...prev,
          [selectedDevice.canonic_id]: status,
        }));
      }

      // Cache locations for this device
      if (locations.length > 0) {
        setLocationsCache(prev => ({
          ...prev,
          [selectedDevice.canonic_id]: locations,
        }));
      }
    }
  }, [locations, selectedDevice, telemetry]);

  // ─── Geofence breach detection ───
  useEffect(() => {
    if (!geofence || !selectedDevice) return;
    if (selectedDevice.canonic_id === geofence.sourceId) return;

    const geoLocs = locations.filter(l => l.type === 'geo' && l.latitude != null);
    if (geoLocs.length === 0) return;

    const latest = geoLocs[0];
    const dist = haversineDistance(
      geofence.center[0], geofence.center[1],
      latest.latitude, latest.longitude
    );

    if (dist > geofence.radius) {
      const alertTime = new Date().toLocaleTimeString();
      const alertMsg = {
        id: Date.now(),
        deviceName: deviceName || selectedDevice.name,
        distance: Math.round(dist),
        timestamp: alertTime,
        lat: latest.latitude,
        lng: latest.longitude,
      };
      setGeofenceAlerts(prev => [alertMsg, ...prev.slice(0, 9)]);

      // Prepend to live events log
      const newEvent = {
        time: alertTime,
        device: selectedDevice.name,
        event: 'route_deviation',
        label: 'Geofence Breach',
        location: 'Out of Zone',
        details: `Breached fence by ${Math.round(dist)}m`,
      };
      setEvents(prev => [newEvent, ...prev.slice(0, 9)]);

      // Play alert sound (browser beep)
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } catch (e) { /* ignore audio errors */ }
    }
  }, [locations, geofence, selectedDevice, deviceName]);

  // Live Telemetry Polling (every 5 seconds)
  useEffect(() => {
    if (selectedDevice) {
      fetchTelemetry(selectedDevice.canonic_id);
      const telemetryInterval = setInterval(() => {
        fetchTelemetry(selectedDevice.canonic_id);
      }, 5000);
      return () => clearInterval(telemetryInterval);
    }
  }, [selectedDevice, fetchTelemetry]);

  // Tracking mode polling
  useEffect(() => {
    if (trackingMode && selectedDevice) {
      fetchLocation(selectedDevice.canonic_id, selectedDevice.name);
      fetchTelemetry(selectedDevice.canonic_id);
      trackingRef.current = setInterval(() => {
        fetchLocation(selectedDevice.canonic_id, selectedDevice.name);
        fetchTelemetry(selectedDevice.canonic_id);
      }, 30000);
    }
    return () => {
      if (trackingRef.current) {
        clearInterval(trackingRef.current);
        trackingRef.current = null;
      }
    };
  }, [trackingMode, selectedDevice, fetchLocation, fetchTelemetry]);

  // Accumulate tracking history
  useEffect(() => {
    if (!trackingMode || locations.length === 0) return;
    setTrackingHistory(prev => {
      const existingKeys = new Set(prev.map(l => `${l.latitude}-${l.longitude}-${l.timestamp}`));
      const newLocs = locations.filter(
        l => l.type === 'geo' && l.latitude != null && !existingKeys.has(`${l.latitude}-${l.longitude}-${l.timestamp}`)
      );
      return newLocs.length > 0 ? [...prev, ...newLocs] : prev;
    });
  }, [locations, trackingMode]);

  // Append live location events dynamically
  useEffect(() => {
    if (selectedDevice && locations.length > 0) {
      const latest = locations[0];
      const timeStr = new Date().toLocaleTimeString();
      
      let evtType = 'location_updated';
      let evtLabel = 'Location Updated';
      let evtLoc = 'Near Adyar, Chennai';
      let evtDet = `Speed: ${latest.speed != null ? Math.round(latest.speed * 3.6) : 32} km/h, Battery: ${telemetry?.battery_pct || 87}%`;

      if (deviceName?.toLowerCase().includes('sos') || (telemetry?.active_events || []).includes('SOS')) {
        evtType = 'sos_trigger';
        evtLabel = 'SOS Triggered';
        evtLoc = 'Emergency Broadcast';
        evtDet = 'SOS button held. Entering Sleep Mode.';
      } else if (deviceName?.toLowerCase().includes('strap') || (telemetry?.active_events || []).includes('Strap Removed')) {
        evtType = 'route_deviation';
        evtLabel = 'Strap Removed';
        evtLoc = 'Wrist Band Removed';
        evtDet = 'Watch strap removed detector triggered.';
      }

      const newEvent = {
        time: timeStr,
        device: selectedDevice.name,
        event: evtType,
        label: evtLabel,
        location: evtLoc,
        details: evtDet,
      };

      setEvents(prev => {
        // Avoid duplicate consecutive event pushes
        if (prev.length > 0 && prev[0].device === newEvent.device && prev[0].label === newEvent.label) {
          return prev;
        }
        return [newEvent, ...prev.slice(0, 9)];
      });
    }
  }, [locations, selectedDevice, deviceName, telemetry]);

  const handleSelectDevice = useCallback(
    (device) => {
      setSelectedDevice(device);
      setTelemetry(null); // Reset telemetry
      if (trackingMode) {
        setTrackingMode(false);
        setTrackingHistory([]);
      }
      fetchLocation(device.canonic_id, device.name);
      fetchTelemetry(device.canonic_id);
    },
    [fetchLocation, fetchTelemetry, trackingMode]
  );

  const handleRefresh = useCallback(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleToggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => !prev);
  }, []);

  const handleToggleTracking = useCallback(() => {
    setTrackingMode(prev => {
      if (prev) { setTrackingHistory([]); return false; }
      setTrackingHistory([]);
      return true;
    });
  }, []);

  const handleSetGeofence = useCallback((device) => {
    const cached = locationsCache[device.canonic_id];
    if (!cached || cached.length === 0) {
      alert(`No cached location for ${device.name}. Select it first to fetch its location, then set geofence.`);
      return;
    }
    const geoLocs = cached.filter(l => l.type === 'geo' && l.latitude != null);
    if (geoLocs.length === 0) {
      alert(`No GPS coordinates available for ${device.name}.`);
      return;
    }
    const latest = geoLocs[0];
    setGeofence({
      center: [latest.latitude, latest.longitude],
      radius: 100,
      sourceName: device.name,
      sourceId: device.canonic_id,
    });
    setGeofenceAlerts([]);
  }, [locationsCache]);

  const handleClearGeofence = useCallback(() => {
    setGeofence(null);
    setGeofenceAlerts([]);
  }, []);

  return (
    <div className="safetrack-layout">
      {/* 1. Left Navigation Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* 2. Main content view */}
      <main className="safetrack-main">
        {/* Top Header */}
        <header className="header">
          <div className="header-search">
            <input type="text" placeholder="Search watch ID, student, school..." />
          </div>

          <div className="header-actions">
            <button className="btn-header" onClick={handleRefresh} disabled={devicesLoading}>
              🔄 Refresh
            </button>

            <div className="toggle-container">
              <span>Auto Sync</span>
              <label className="switch" htmlFor="auto-sync-checkbox">
                <input
                  id="auto-sync-checkbox"
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={handleToggleAutoRefresh}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className={`connection-pill ${apiConnected ? '' : 'disconnected'}`}>
              <span className="connection-dot"></span>
              <span>{apiConnected ? 'Python Service Connected' : 'Python Offline'}</span>
            </div>

            <div className="connection-pill" style={{ backgroundColor: '#eff6ff', borderColor: 'rgba(59,130,246,0.15)', color: '#2563eb' }}>
              <span className="connection-dot" style={{ backgroundColor: '#2563eb' }}></span>
              <span>API Status: OK</span>
            </div>

            <div className="user-profile">
              <div className="user-avatar">AD</div>
              <div className="user-details">
                <span className="user-name">Admin</span>
                <span className="user-role">Super Admin</span>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Main Workspace */}
        <div className="workspace-scrollable">
          {/* Top Metrics Stats Cards */}
          <StatsRow
            devices={devices}
            deviceStatuses={deviceStatuses}
            alertsCount={geofenceAlerts.length}
          />

          {/* Core App Grid: Device List + Map View + Detail Panel */}
          <div className="dashboard-grid">
            <DeviceList
              devices={devices}
              loading={devicesLoading}
              error={devicesError}
              selectedId={selectedDevice?.canonic_id}
              onSelect={handleSelectDevice}
              onDismissError={() => setDevicesError(null)}
              deviceStatuses={deviceStatuses}
              onSetGeofence={handleSetGeofence}
              geofenceSourceId={geofence?.sourceId}
            />

            <div className="map-pane">
              {locationLoading && (
                <LoadingOverlay
                  message={trackingMode ? "Tracking Watch..." : "Querying Google FMDN..."}
                  submessage={trackingMode
                    ? "Live polling updates active."
                    : "Fetching and decrypting location from Google API. Please wait..."
                  }
                />
              )}

              {locationError && (
                <div className="error-banner" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000 }}>
                  <span>⚠️ {locationError}</span>
                  <button onClick={() => setLocationError(null)}>✕</button>
                </div>
              )}

              {/* Map controls */}
              <div className="map-control-overlay">
                <button
                  className="map-control-btn"
                  onClick={handleToggleTracking}
                  disabled={!selectedDevice}
                >
                  {trackingMode ? '🛑 Stop Tracking' : '🛰️ Start Live Tracking'}
                </button>
                {geofence && (
                  <button className="map-control-btn" onClick={handleClearGeofence}>
                    ❌ Clear Geofence
                  </button>
                )}
              </div>

              <MapView
                locations={locations}
                deviceName={deviceName}
                trackingMode={trackingMode}
                trackingHistory={trackingHistory}
                geofence={geofence}
                onClearGeofence={handleClearGeofence}
              />
            </div>

            <DetailPanel
              device={selectedDevice}
              telemetry={telemetry}
              location={locations.length > 0 ? locations[0] : null}
              onClose={() => setSelectedDevice(null)}
            />
          </div>

          {/* Bottom Pane: Events Log */}
          <RecentEvents events={events} />
        </div>
      </main>
    </div>
  );
}

export default App;
