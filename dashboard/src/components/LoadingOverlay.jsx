export default function LoadingOverlay({ message, submessage }) {
  return (
    <div className="loading-overlay">
      <div className="loading-spinner" />
      <div className="loading-text">{message || 'Loading…'}</div>
      {submessage && <div className="loading-subtext">{submessage}</div>}
    </div>
  );
}
