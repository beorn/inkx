/**
 * TopBar Component
 *
 * Renders the full-width top bar showing the path from root to selected item.
 * Uses board's color as background when available, with appropriate text contrast.
 */
import React from "react";
import { Box, Text } from "ink";
import chalk, { type ChalkInstance } from "chalk";
import type { PathSegment } from "../layout/index.ts";

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

/** Colors that require white text for adequate contrast */
const DARK_BG_COLORS = ["red", "green", "blue", "magenta", "gray", "grey"];

/**
 * Get chalk function for top bar background based on board color.
 * If boardColor is set, uses that color.
 * Otherwise, uses blue if board is selected, white if not.
 */
export function getTopBarBgChalk(
  boardColor: string | undefined,
  isBoardSelected: boolean,
): ChalkInstance {
  if (boardColor) {
    switch (boardColor) {
      case "red":
        return chalk.bgRed;
      case "green":
        return chalk.bgGreen;
      case "yellow":
        return chalk.bgYellow;
      case "blue":
        return chalk.bgBlue;
      case "magenta":
        return chalk.bgMagenta;
      case "cyan":
        return chalk.bgCyan;
      case "white":
        return chalk.bgWhite;
      case "gray":
      case "grey":
        return chalk.bgGray;
      default:
        return isBoardSelected ? chalk.bgBlue : chalk.bgWhite;
    }
  }
  return isBoardSelected ? chalk.bgBlue : chalk.bgWhite;
}

/**
 * Determine if white text is needed for contrast on the given background.
 */
export function needsWhiteText(
  boardColor: string | undefined,
  isBoardSelected: boolean,
): boolean {
  return boardColor ? DARK_BG_COLORS.includes(boardColor) : isBoardSelected;
}

// =============================================================================
// Rendering Helpers
// =============================================================================

/**
 * Render top bar path segments with appropriate colors.
 * Handles board boundary highlighting (blue separator between file path and board path).
 */
export function renderTopBarSegments(
  segments: PathSegment[],
  bgChalk: ChalkInstance,
  useWhiteText: boolean,
): string {
  return segments
    .map((seg, i) => {
      const prevSeg = i > 0 ? segments[i - 1] : null;
      const isBoardBoundary =
        prevSeg && !prevSeg.isWithinBoard && seg.isWithinBoard;

      if (useWhiteText) {
        // Dark background: white text
        const sepPart = seg.sep ? bgChalk.white(` ${seg.sep} `) : "";
        return sepPart + bgChalk.white.bold(seg.name);
      } else {
        // Light background: black text, blue separator at board boundary
        const sepPart = seg.sep
          ? isBoardBoundary
            ? bgChalk.blue.bold(` ${seg.sep} `)
            : bgChalk.gray(` ${seg.sep} `)
          : "";
        return sepPart + bgChalk.black.bold(seg.name);
      }
    })
    .join("");
}

/**
 * Calculate the visible display length of path segments (for padding calculation).
 */
export function calcTopBarVisibleLength(segments: PathSegment[]): number {
  return (
    1 + // Leading space
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
  const fgChalk = useWhiteText ? bgChalk.white : bgChalk.black;
  const topBarString = fgChalk(" ") + content + bgChalk(padding);

  return (
    <Box height={1} width={width}>
      <Text>{topBarString}</Text>
    </Box>
  );
}
