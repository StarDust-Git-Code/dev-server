import { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import DeviceList from './components/DeviceList';
import MapView from './components/MapView';
import LocationCard from './components/LocationCard';
import LoadingOverlay from './components/LoadingOverlay';
import { useDevices } from './hooks/useDevices';
import { useLocation } from './hooks/useLocation';
import './index.css';

const API_BASE = 'http://localhost:5000/api';
const TRACKING_POLL_INTERVAL = 30000;

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

  const [selectedDevice, setSelectedDevice] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [deviceStatuses, setDeviceStatuses] = useState({});
  const [telemetry, setTelemetry] = useState(null);

  // Tracking mode
  const [trackingMode, setTrackingMode] = useState(false);
  const [trackingHistory, setTrackingHistory] = useState([]);

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
  const alertAudioRef = useRef(null);

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
    // Don't check the geofence source device against itself
    if (selectedDevice.canonic_id === geofence.sourceId) return;

    const geoLocs = locations.filter(l => l.type === 'geo' && l.latitude != null);
    if (geoLocs.length === 0) return;

    // Check the most recent location
    const latest = geoLocs[0];
    const dist = haversineDistance(
      geofence.center[0], geofence.center[1],
      latest.latitude, latest.longitude
    );

    if (dist > geofence.radius) {
      const alert = {
        id: Date.now(),
        deviceName: deviceName || selectedDevice.name,
        distance: Math.round(dist),
        timestamp: new Date().toLocaleTimeString(),
        lat: latest.latitude,
        lng: latest.longitude,
      };
      setGeofenceAlerts(prev => [alert, ...prev.slice(0, 9)]); // keep last 10

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

  // Live Telemetry Polling (every 5 seconds for test mode tracking)
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
      }, TRACKING_POLL_INTERVAL);
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

  // Set geofence from a device's cached location
  const handleSetGeofence = useCallback((device) => {
    const cached = locationsCache[device.canonic_id];
    if (!cached || cached.length === 0) {
      // Need to fetch first — select the device, locations will cache, then user can retry
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

  const handleDismissAlert = useCallback((id) => {
    setGeofenceAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  return (
    <div className="app">
      <Header
        onRefresh={handleRefresh}
        isRefreshing={devicesLoading}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={handleToggleAutoRefresh}
        apiConnected={apiConnected}
        trackingMode={trackingMode}
        onToggleTracking={handleToggleTracking}
        trackingDisabled={!selectedDevice}
      />
      <div className="app-body">
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
        <div className="main-content">
          {locationLoading && (
            <LoadingOverlay
              message={trackingMode ? "Tracking…" : "Fetching Location…"}
              submessage={trackingMode
                ? "Polling for new location reports every 30 seconds."
                : "Waiting for encrypted location data from Google servers. This may take 5–15 seconds."
              }
            />
          )}

          {locationError && (
            <div className="error-banner" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, margin: 16, borderRadius: 'var(--radius-md)' }}>
              <span>⚠️ {locationError}</span>
              <button onClick={() => setLocationError(null)} aria-label="Dismiss error">✕</button>
            </div>
          )}

          {/* Geofence Breach Alerts */}
          {geofenceAlerts.length > 0 && (
            <div className="geofence-alerts">
              {geofenceAlerts.map(alert => (
                <div key={alert.id} className="geofence-alert">
                  <span className="geofence-alert-icon">🚨</span>
                  <div className="geofence-alert-body">
                    <strong>{alert.deviceName}</strong> left the geofence!
                    <span className="geofence-alert-detail">
                      {alert.distance}m from center · {alert.timestamp}
                    </span>
                  </div>
                  <button className="geofence-alert-dismiss" onClick={() => handleDismissAlert(alert.id)}>✕</button>
                </div>
              ))}
            </div>
          )}

          <MapView
            locations={locations}
            deviceName={deviceName}
            trackingMode={trackingMode}
            trackingHistory={trackingHistory}
            geofence={geofence}
            onClearGeofence={handleClearGeofence}
          />

          {/* Tracking info bar */}
          {trackingMode && (
            <div className="tracking-info-bar">
              <span className="tracking-pulse" />
              <span>Live Tracking · {trackingHistory.length} points collected</span>
              <span className="tracking-info-hint">Polling every 30s</span>
            </div>
          )}

          {/* Geofence info bar */}
          {geofence && !trackingMode && (
            <div className="geofence-info-bar">
              <span>📍 Geofence: {geofence.radius}m around {geofence.sourceName}</span>
              <button className="geofence-clear-btn" onClick={handleClearGeofence}>Remove</button>
            </div>
          )}
          {/* Telemetry Widget Overlay */}
          {telemetry && (
            <div className="telemetry-widget">
              <div className="telemetry-header">
                <span>📡 Custom Telemetry</span>
                <span className="telemetry-battery">🔋 {telemetry.battery_pct}%</span>
              </div>
              <div className="telemetry-body">
                <div className="telemetry-row">
                  <span className="telemetry-label">Counter:</span>
                  <span className="telemetry-value">#{telemetry.counter}</span>
                </div>
                <div className="telemetry-row">
                  <span className="telemetry-label">Events:</span>
                  <div className="telemetry-tags">
                    {telemetry.active_events.length > 0 ? (
                      telemetry.active_events.map(event => (
                        <span key={event} className="telemetry-tag">{event}</span>
                      ))
                    ) : (
                      <span className="telemetry-tag tag-none">No Events</span>
                    )}
                  </div>
                </div>
                <div className="telemetry-footer">
                  <span>Last Scan: {telemetry.timestamp_formatted}</span>
                </div>
              </div>
            </div>
          )}

          {locations.length > 0 && (
            <div className="location-panel">
              {locations.slice(0, 1).map((loc, idx) => (
                <LocationCard
                  key={`${loc.latitude}-${loc.longitude}-${loc.timestamp}-${idx}`}
                  location={loc}
                  index={idx}
                  total={1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
