/**
 * Constraint Context - Inkx Compatible Implementation
 *
 * Re-exports ink-measure core types and hooks, plus an inkx-specific ConstraintRoot.
 */

import React from "react";
import { useStdout } from "inkx";
import {
  ConstraintRoot as BaseConstraintRoot,
  ConstraintContext,
  useConstraintContext,
  useComputedSize,
  useTerminalSize,
  type ConstraintContextValue,
  type ComputedSize,
  type TerminalSize,
} from "@beorn/ink-measure";

// Re-export everything from ink-measure for local imports
export {
  ConstraintContext,
  useConstraintContext,
  useComputedSize,
  useTerminalSize,
  type ConstraintContextValue,
  type ComputedSize,
  type TerminalSize,
};

/** Props for ConstraintRoot (inkx version) */
export interface ConstraintRootProps {
  children: React.ReactNode;
  /** Padding from terminal edges */
  padding?: number | { x?: number; y?: number };
}

/**
 * Root component that provides terminal dimensions and initiates the constraint tree.
 * This version uses inkx's useStdout hook.
 *
 * @example
 * ```tsx
 * render(
 *   <ConstraintRoot padding={1}>
 *     <Board />
 *   </ConstraintRoot>
 * );
 * ```
 */
export function ConstraintRoot({
  children,
  padding = 0,
}: ConstraintRootProps): React.ReactElement {
  const { stdout } = useStdout();

  return (
    <BaseConstraintRoot stdout={stdout ?? undefined} padding={padding}>
      {children}
    </BaseConstraintRoot>
  );
}
