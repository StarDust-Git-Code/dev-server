// Central configuration for the dashboard API base
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const API_BASE = import.meta.env.VITE_API_BASE || 
  (isLocal ? 'http://localhost:5000/api' : 'https://dev-server-s8fx.onrender.com/api');
