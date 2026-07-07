export default function StatsRow({ devices, deviceStatuses, alertsCount }) {
  // Compute metrics dynamically from the live devices list and status cache
  const totalCount = devices.length;
  
  let onlineCount = 0;
  let offlineCount = 0;
  let lowBatteryCount = 0;
  let movingCount = 0;

  devices.forEach(device => {
    const statusObj = deviceStatuses[device.canonic_id];
    const status = statusObj?.status || 'inactive';
    
    if (status === 'active' || status === 'recent') {
      onlineCount++;
    } else {
      offlineCount++;
    }

    // Check battery
    const batteryPct = device.battery_pct;
    if (batteryPct != null && batteryPct < 20) {
      lowBatteryCount++;
    }
  });

  const stats = [
    {
      value: totalCount,
      label: 'Total Devices',
      subtext: 'All registered watches',
      icon: '⌚',
      color: '#3b82f6',
      bgColor: '#eff6ff',
    },
    {
      value: onlineCount,
      label: 'Online',
      subtext: 'Connected to network',
      icon: '📶',
      color: '#10b981',
      bgColor: '#ecfdf5',
    },
    {
      value: movingCount,
      label: 'Moving',
      subtext: 'Currently in motion',
      icon: '🏃',
      color: '#f59e0b',
      bgColor: '#fefbeb',
    },
    {
      value: alertsCount || 0,
      label: 'Alerts',
      subtext: 'Require attention',
      icon: '🚨',
      color: '#ef4444',
      bgColor: '#fef2f2',
    },
    {
      value: offlineCount,
      label: 'Offline',
      subtext: 'No recent updates',
      icon: '💤',
      color: '#64748b',
      bgColor: '#f8fafc',
    },
    {
      value: lowBatteryCount,
      label: 'Low Battery',
      subtext: 'Below 20%',
      icon: '🔋',
      color: '#ef4444',
      bgColor: '#fef2f2',
    },
  ];

  return (
    <div className="stats-grid">
      {stats.map((stat, idx) => (
        <div key={idx} className="stat-card">
          <div
            className="stat-icon-wrapper"
            style={{ backgroundColor: stat.bgColor, color: stat.color }}
          >
            {stat.icon}
          </div>
          <div className="stat-info">
            <span className="stat-value">{stat.value}</span>
            <span className="stat-label">{stat.label}</span>
            <span className="stat-subtext">{stat.subtext}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
