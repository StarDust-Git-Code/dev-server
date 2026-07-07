export default function RecentEvents({ events }) {
  const displayEvents = events || [];

  return (
    <div className="events-pane">
      <div className="events-header">
        <div className="events-title-group">
          <span className="events-title">Recent Events</span>
        </div>
        <a href="#" className="events-view-all" onClick={(e) => e.preventDefault()}>
          View All Events
        </a>
      </div>

      <div className="events-table-wrapper">
        <table className="events-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Device</th>
              <th>Event</th>
              <th>Location</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {displayEvents.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                  No tracking events recorded. Click "Refresh" or toggle "Auto Sync" to monitor devices.
                </td>
              </tr>
            ) : (
              displayEvents.map((evt, idx) => (
                <tr key={idx}>
                  <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {evt.time}
                  </td>
                  <td style={{ fontWeight: 700 }}>{evt.device}</td>
                  <td>
                    <span className={`event-label-badge ${evt.event}`}>
                      {evt.label}
                    </span>
                  </td>
                  <td>{evt.location}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{evt.details}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
