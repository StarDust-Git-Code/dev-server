import { useState } from 'react';

export default function Sidebar({ activeTab, onTabChange }) {
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'devices', label: 'Devices', icon: '📱' },
    { id: 'alerts', label: 'Alerts', icon: '🔔', badge: 2 },
    { id: 'reports', label: 'Reports', icon: '📊' },
    { id: 'geofences', label: 'Geofences', icon: '📍' },
    { id: 'routes', label: 'Routes', icon: '🛣️' },
    { id: 'students', label: 'Students', icon: '👥' },
    { id: 'schools', label: 'Schools', icon: '🏫' },
    { id: 'users', label: 'Users', icon: '👤' },
    { id: 'audit', label: 'Audit Logs', icon: '📝' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <a href="#" className="sidebar-logo">
          <div className="logo-icon">S</div>
          {!collapsed && <span className="logo-text">SafeTrack</span>}
        </a>
      </div>

      <ul className="sidebar-menu">
        {menuItems.map((item) => (
          <li key={item.id} className="sidebar-item">
            <a
              href="#"
              className={`sidebar-link ${activeTab === item.id ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                onTabChange(item.id);
              }}
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              {!collapsed && <span className="sidebar-link-label">{item.label}</span>}
              {!collapsed && item.badge && (
                <span className="sidebar-badge">{item.badge}</span>
              )}
            </a>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="system-status">
            <div className="system-status-header">
              <span className="system-status-dot"></span>
              <span>System Status</span>
            </div>
            <div className="system-status-text">All Systems Operational</div>
            <div className="system-status-time">Last Updated: 02:46 PM</div>
          </div>
        )}
        <button
          className="btn-collapse"
          onClick={() => setCollapsed(!collapsed)}
        >
          <span>{collapsed ? '▶' : '◀'}</span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
