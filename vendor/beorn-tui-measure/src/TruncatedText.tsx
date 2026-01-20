/**
 * TruncatedText Component
 *
 * ANSI-aware text truncation that uses width from constraint context.
 * Eliminates the need to manually thread width props through components.
 */

import React, { useMemo, type ReactElement, type ReactNode } from "react";
import { useComputedSize, type ComputedSize } from "./context.tsx";
import { constrainText } from "./text.ts";

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
  /**
   * Render function for each line.
   * Default just returns the line string.
   *
   * @example
   * ```tsx
   * // With Ink Text
   * <TruncatedText renderLine={(line, i) => <Text key={i}>{line}</Text>}>
   *   {longText}
   * </TruncatedText>
   * ```
   */
  renderLine?: (line: string, index: number) => ReactNode;
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
 * // With Ink Text rendering
 * <TruncatedText renderLine={(line, i) => <Text key={i}>{line}</Text>}>
 *   {node.title}
 * </TruncatedText>
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
  renderLine,
}: TruncatedTextProps): ReactElement {
  let contextSize: ComputedSize | null = null;
  try {
    contextSize = useComputedSize();
  } catch {
    // Not inside ConstraintRoot - use override or default
  }

  const width = widthOverride ?? contextSize?.width ?? 80;

  const { lines } = useMemo(
    () => constrainText(children, width, maxLines, pad, ellipsis),
    [children, width, maxLines, pad, ellipsis],
  );

  if (renderLine) {
    return <>{lines.map((line, i) => renderLine(line, i))}</>;
  }

  // Default: join lines with newlines
  return <>{lines.join("\n")}</>;
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
  const {
    maxLines = 1,
    width: widthOverride,
    pad = false,
    ellipsis,
  } = options;

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
