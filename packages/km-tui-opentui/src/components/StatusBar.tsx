/**
 * StatusBar Component
 *
 * Bottom bar showing terminal size, position, and status info.
 */

import type { ViewMode } from "../types.ts";

interface StatusBarProps {
  width: number;
  height: number;
  colIndex: number;
  colCount: number;
  cardIndex: number;
  cardCount: number;
  viewMode: ViewMode;
}

export function StatusBar({
  width,
  height,
  colIndex,
  colCount,
  cardIndex,
  cardCount,
  viewMode,
}: StatusBarProps) {
  return (
    <box paddingLeft={1}>
      <text color="gray">
        {width}x{height} | Col {colIndex + 1}/{colCount} | Card {cardIndex + 1}/
        {cardCount} | {viewMode}
      </text>
    </box>
  );
}

export default StatusBar;
