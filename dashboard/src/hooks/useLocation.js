import { useState, useCallback } from 'react';

const API_BASE = 'http://localhost:5000/api';

export function useLocation() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deviceName, setDeviceName] = useState('');

  const fetchLocation = useCallback(async (canonicId, name) => {
    setLoading(true);
    setError(null);
    setLocations([]);
    setDeviceName(name);
    try {
      const res = await fetch(`${API_BASE}/locate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonic_id: canonicId, name }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setLocations(data.locations || []);
      setDeviceName(data.device_name || name);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearLocations = useCallback(() => {
    setLocations([]);
    setDeviceName('');
    setError(null);
  }, []);

  return { locations, loading, error, deviceName, fetchLocation, clearLocations, setError };
}
