/**
 * TruncatedText Component
 *
 * ANSI-aware text truncation that uses width from constraint context.
 * Eliminates the need to manually thread width props through components.
 *
 * @see .beads/km-inkx.3-design.md for design specification
 */

import React, { useMemo } from "react";
import { Text } from "inkx";
import { useComputedSize, constrainText, type ComputedSize } from "@beorn/ink-measure";

export interface TruncatedTextProps {
  /** The text content to display (can include ANSI escape codes) */
  children: string;
  /** Truncation indicator (default: '…') */
  ellipsis?: string;
  /** Maximum lines before truncation (default: 1) */
  maxLines?: number;
  /** Custom width override (uses context width if not provided) */
  width?: number;
  /** Whether to pad lines to full width (default: false) */
  pad?: boolean;
}

/**
 * Text component that automatically truncates based on available width.
 *
 * Uses the constraint context to determine available width, or accepts
 * an explicit width prop for cases where context isn't available.
 *
 * @example
 * ```tsx
 * // Uses width from ConstraintRoot/parent
 * <TruncatedText>{node.title}</TruncatedText>
 *
 * // With explicit max lines
 * <TruncatedText maxLines={3}>{node.description}</TruncatedText>
 *
 * // With custom ellipsis
 * <TruncatedText ellipsis=" [...]">{longText}</TruncatedText>
 *
 * // With explicit width (bypasses context)
 * <TruncatedText width={40}>{text}</TruncatedText>
 * ```
 */
export function TruncatedText({
  children,
  ellipsis = "…",
  maxLines = 1,
  width: widthOverride,
  pad = false,
}: TruncatedTextProps): React.ReactElement {
  // Try to get width from context, fall back to override or default
  let contextSize: ComputedSize | null = null;
  try {
    contextSize = useComputedSize();
  } catch {
    // Not inside ConstraintRoot - use override or default
  }

  const width = widthOverride ?? contextSize?.width ?? 80;

  const { lines, truncated } = useMemo(
    () => constrainText(children, width, maxLines, pad, ellipsis),
    [children, width, maxLines, pad, ellipsis],
  );

  return (
    <>
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </>
  );
}

/**
 * Hook version for when you need more control over rendering.
 * Returns constrained lines instead of rendering them.
 */
export function useTruncatedText(
  text: string,
  options: {
    maxLines?: number;
    width?: number;
    pad?: boolean;
    ellipsis?: string;
  } = {},
): { lines: string[]; truncated: boolean } {
  const { maxLines = 1, width: widthOverride, pad = false, ellipsis } = options;

  let contextSize: ComputedSize | null = null;
  try {
    contextSize = useComputedSize();
  } catch {
    // Not inside ConstraintRoot
  }

  const width = widthOverride ?? contextSize?.width ?? 80;

  return useMemo(
    () => constrainText(text, width, maxLines, pad, ellipsis),
    [text, width, maxLines, pad, ellipsis],
  );
}
