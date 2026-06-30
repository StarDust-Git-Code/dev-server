# API Backend Rules

## State Inference via Parallel Querying
When building dashboards or APIs for EID-Multiplexed trackers on the Google Find Hub network:

1. **Device Grouping**: The backend must abstract the multiple EIDs registered to a single physical tracker and present them to the frontend as a single logical device (e.g., "Child Safety Watch 1").
2. **Parallel Location Requests**: When a location request is initiated for the logical device, the backend (`api_server.py`) must trigger parallel location queries to Google for *all* associated EIDs simultaneously. Doing this sequentially will result in severe timeout issues due to Google's FCM push architecture.
3. **State Resolution**: Combine the location reports from all queried EIDs and sort them by the `timestamp` field in descending order.
4. **Active State Detection**: The active physical state of the tracker (e.g., Normal, SOS, or Strap Removed) corresponds directly to the source EID of the most recently dated location report.
5. **Dashboard Emulation**: Inject this inferred state into the telemetry endpoints (e.g., `/api/telemetry/`) so that existing dashboard components can render the state without requiring massive frontend rewrites.
