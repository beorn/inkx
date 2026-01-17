/**
 * StatusBar Component
 *
 * Bottom bar showing storage status and view mode.
 * TUI1 format: "DISK REPO /path/to/vault           [COLUMNS VIEW]"
 */

import type { ViewMode, TPath } from "../types.ts";

interface StatusBarProps {
  width: number;
  height: number;
  cursor: TPath;
  nodeCount: number;
  viewMode: ViewMode;
  rootPath?: string | null;
}

// Map view mode to display name
function getViewModeLabel(mode: ViewMode): string {
  switch (mode) {
    case "cards":
      return "CARDS VIEW";
    case "columns":
      return "COLUMNS VIEW";
    case "list":
      return "LIST VIEW";
    case "tabs":
      return "TABS VIEW";
    default:
      return mode.toUpperCase() + " VIEW";
  }
}

export function StatusBar({
  width,
  rootPath,
  viewMode,
}: StatusBarProps) {
  // TUI1 format: "DISK REPO /path" on left, "[VIEW MODE]" on right
  const leftPart = `DISK REPO ${rootPath || "/"}`;
  const viewLabel = `[${getViewModeLabel(viewMode)}]`;

  // Calculate padding to right-align the view mode
  const contentLen = leftPart.length + viewLabel.length + 2; // +2 for margins
  const padding = Math.max(0, width - contentLen);

  return (
    <box width={width} flexDirection="row">
      <text color="green">
        {" "}
        {leftPart}
      </text>
      <text>
        {" ".repeat(padding)}
      </text>
      <text inverse>
        {viewLabel}
      </text>
      <text>
        {" "}
      </text>
    </box>
  );
}

export default StatusBar;
