export default function Header({
  onRefresh,
  isRefreshing,
  autoRefresh,
  onToggleAutoRefresh,
  apiConnected,
  trackingMode,
  onToggleTracking,
  trackingDisabled,
}) {
  return (
    <header className="header">
      <div className="header-brand">
        <div className="header-logo">📍</div>
        <div>
          <div className="header-title">FindMyDevice Dashboard</div>
          <div className="header-subtitle">Google Find My Network Tracker</div>
        </div>
      </div>
      <div className="header-actions">
        <div className="auto-refresh-toggle">
          <span>Auto-refresh</span>
          <div
            className={`toggle-switch ${autoRefresh ? 'active' : ''}`}
            onClick={onToggleAutoRefresh}
            role="button"
            tabIndex={0}
            aria-label="Toggle auto refresh"
          />
        </div>

        {/* Live Tracking Toggle */}
        <button
          className={`btn ${trackingMode ? 'btn-tracking-active' : 'btn-tracking'}`}
          onClick={onToggleTracking}
          disabled={trackingDisabled}
          id="toggle-tracking-btn"
        >
          {trackingMode ? (
            <>
              <span className="tracking-pulse" />
              Stop Tracking
            </>
          ) : (
            <>🛰️ Start Tracking</>
          )}
        </button>

        <button
          className="btn btn-primary"
          onClick={onRefresh}
          disabled={isRefreshing}
          id="refresh-devices-btn"
        >
          {isRefreshing ? (
            <>
              <span className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2, margin: 0 }} />
              Loading…
            </>
          ) : (
            <>🔄 Refresh Devices</>
          )}
        </button>
        <div className={`header-status ${apiConnected ? '' : 'offline'}`}>
          <span className="status-dot" />
          {apiConnected ? 'API Connected' : 'API Offline'}
        </div>
      </div>
    </header>
  );
}
