/**
 * TopBar Component
 *
 * Renders the full-width top bar showing the path from root to selected item.
 * Uses board's color as background when available, with appropriate text contrast.
 */
import React from "react";
import { Box, Text } from "inkx";
import chalk, { type ChalkInstance } from "chalk";
import type { PathSegment } from "../layout/index.ts";
import { getNodeIcon } from "../text/index.ts";

// =============================================================================
// Types
// =============================================================================

export interface TopBarProps {
  /** Path segments to display */
  segments: PathSegment[];
  /** Total width of the top bar */
  width: number;
  /** Board's own color (from color= attribute) */
  boardColor?: string;
  /** Whether the board itself is selected (affects bg color when no boardColor) */
  isBoardSelected?: boolean;
}

// =============================================================================
// Color Helpers
// =============================================================================

/**
 * Get chalk function for top bar background based on board color.
 * Default is dark grey background. Uses inverse yellow when board is selected.
 */
export function getTopBarBgChalk(
  _boardColor: string | undefined,
  isBoardSelected: boolean,
): ChalkInstance {
  // When board itself is selected, use inverse yellow
  if (isBoardSelected) {
    return chalk.bgYellow;
  }
  // Default: dark grey background
  return chalk.bgGray;
}

/**
 * Determine if white text is needed for contrast on the given background.
 * Dark grey bg needs white text; yellow bg (selected) needs black text.
 */
export function needsWhiteText(
  _boardColor: string | undefined,
  isBoardSelected: boolean,
): boolean {
  // Yellow bg (selected) needs black text, grey bg needs white text
  return !isBoardSelected;
}

// =============================================================================
// Rendering Helpers
// =============================================================================

/**
 * Render top bar path segments with appropriate colors.
 *
 * Styling rules:
 * - Entire title is bold
 * - Pre-board path (file path leading up to board): dimmed
 * - Board root (last segment before isWithinBoard becomes true): NOT dimmed
 * - Within-board breadcrumb (segments with isWithinBoard=true): dimmed
 * - Board boundary marked with blue separator (on light backgrounds)
 */
export function renderTopBarSegments(
  segments: PathSegment[],
  bgChalk: ChalkInstance,
  useWhiteText: boolean,
): string {
  // Find the board root index:
  // - If there are isWithinBoard segments, board root is the one just before them
  // - If no isWithinBoard segments, the last segment is the board root (we're at board level)
  const firstWithinBoardIdx = segments.findIndex((s) => s.isWithinBoard);
  const boardRootIdx =
    firstWithinBoardIdx > 0
      ? firstWithinBoardIdx - 1
      : firstWithinBoardIdx === -1
        ? segments.length - 1
        : 0;

  return segments
    .map((seg, i) => {
      const prevSeg = i > 0 ? segments[i - 1] : null;
      const isBoardBoundary =
        prevSeg && !prevSeg.isWithinBoard && seg.isWithinBoard;

      // Determine if this segment should be dimmed:
      // - Pre-board path (before boardRootIdx): dimmed
      // - Board root (i === boardRootIdx): NOT dimmed
      // - Within-board breadcrumb (after boardRootIdx / isWithinBoard=true): dimmed
      const isBoardRoot = i === boardRootIdx;
      const shouldDim = !isBoardRoot;

      if (useWhiteText) {
        // Dark background: white text
        const sepPart = seg.sep
          ? shouldDim
            ? bgChalk.white.dim(` ${seg.sep} `)
            : bgChalk.white(` ${seg.sep} `)
          : "";
        const namePart = shouldDim
          ? bgChalk.white.bold.dim(seg.name)
          : bgChalk.white.bold(seg.name);
        return sepPart + namePart;
      } else {
        // Light background: black text, blue separator at board boundary
        const sepPart = seg.sep
          ? isBoardBoundary
            ? bgChalk.blue.bold(` ${seg.sep} `)
            : shouldDim
              ? bgChalk.gray.dim(` ${seg.sep} `)
              : bgChalk.gray(` ${seg.sep} `)
          : "";
        const namePart = shouldDim
          ? bgChalk.black.bold.dim(seg.name)
          : bgChalk.black.bold(seg.name);
        return sepPart + namePart;
      }
    })
    .join("");
}

/**
 * Calculate the visible display length of path segments (for padding calculation).
 * Accounts for: space + disc + space + segments
 */
export function calcTopBarVisibleLength(segments: PathSegment[]): number {
  return (
    3 + // Leading space + disc + space
    segments.reduce((acc, seg) => {
      return acc + seg.name.length + (seg.sep ? seg.sep.length + 2 : 0);
    }, 0)
  );
}

// =============================================================================
// TopBar Component
// =============================================================================

/**
 * Renders the top bar with path segments.
 *
 * Features:
 * - Board color as background (when color= attribute is set)
 * - Blue/white background fallback based on selection state
 * - Dark backgrounds get white text, light backgrounds get black text
 * - Board boundary marked with blue separator
 */
export function TopBar({
  segments,
  width,
  boardColor,
  isBoardSelected = false,
}: TopBarProps): React.ReactElement {
  // Calculate background and text colors
  const bgChalk = getTopBarBgChalk(boardColor, isBoardSelected);
  const useWhiteText = needsWhiteText(boardColor, isBoardSelected);

  // Render the path segments
  const content = renderTopBarSegments(segments, bgChalk, useWhiteText);

  // Calculate padding to fill the full width
  const visibleLen = calcTopBarVisibleLength(segments);
  const padding = " ".repeat(Math.max(0, width - visibleLen));

  // Build the full top bar string
  // Start with space + bullet (using getNodeIcon for consistent styling) + space
  // - With boardColor: filled circle (●) in that color
  // - Without boardColor: small bullet (·)
  const fgChalk = useWhiteText ? bgChalk.white : bgChalk.black;
  const icon = getNodeIcon(null, boardColor, false);
  const iconColor = isBoardSelected ? "black" : icon.color;
  const iconChalk = chalk[iconColor as keyof typeof chalk] as ChalkInstance;
  const disc = iconChalk
    ? bgChalk(iconChalk(icon.char))
    : bgChalk.gray(icon.char);
  const topBarString =
    fgChalk(" ") + disc + fgChalk(" ") + content + bgChalk(padding);

  return (
    <Box height={1} width={width}>
      <Text wrap="truncate">{topBarString}</Text>
    </Box>
  );
}
