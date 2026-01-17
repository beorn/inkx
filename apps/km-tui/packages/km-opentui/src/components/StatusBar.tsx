/**
 * StatusBar Component
 *
 * Bottom bar showing terminal size, position, and status info.
 */

import type { ViewMode, TPath } from "../types.ts";

interface StatusBarProps {
  width: number;
  height: number;
  cursor: TPath;
  nodeCount: number;
  viewMode: ViewMode;
}

export function StatusBar({
  width,
  height,
  cursor,
  nodeCount,
  viewMode,
}: StatusBarProps) {
  const colIndex = cursor[0] ?? 0;
  const cardIndex = cursor[1] ?? 0;

  return (
    <box paddingLeft={1}>
      <text color="gray">
        {width}x{height} | Col {colIndex + 1}/{nodeCount} | Item {cardIndex + 1}{" "}
        | {viewMode}
      </text>
    </box>
  );
}

export default StatusBar;
