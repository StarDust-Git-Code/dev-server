export default function RecentEvents({ events }) {
  // Static mockup events if no live events are present
  const defaultEvents = [
    {
      time: '02:46:44 PM',
      device: 'Child Safety Watch 1',
      event: 'location_updated',
      label: 'Location Updated',
      location: 'Near Adyar, Chennai',
      details: 'Speed: 32 km/h, Battery: 87%',
    },
    {
      time: '02:44:10 PM',
      device: 'Child Safety Watch 1',
      event: 'entered_fence',
      label: 'Entered School Fence',
      location: 'ABC Matric. School',
      details: 'Fence: School Main Zone',
    },
    {
      time: '02:34:52 PM',
      device: 'Samsung SM-M315F',
      event: 'route_deviation',
      label: 'Route Deviation',
      location: 'Tharamani, Chennai',
      details: 'Deviation: 182 m from route',
    },
    {
      time: '02:22:18 PM',
      device: 'ESP32_S3',
      event: 'location_updated',
      label: 'Location Updated',
      location: 'Guindy, Chennai',
      details: 'Speed: 18 km/h, Battery: 91%',
    },
    {
      time: '02:15:09 PM',
      device: 'C3-T2',
      event: 'low_battery',
      label: 'Low Battery',
      location: 'Okkiyam Pettai',
      details: 'Battery: 15%',
    },
  ];

  const displayEvents = events && events.length > 0 ? events : defaultEvents;

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
            {displayEvents.map((evt, idx) => (
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
