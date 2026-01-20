/**
 * Constraint Context
 *
 * Provides computed dimensions to child components via React context.
 * Solves Ink's fundamental problem: children never know their computed size.
 *
 * @see .beads/km-inkx.3-design.md for full design specification
 */

import React, { createContext, useContext, useState, useEffect } from "react";
import { useStdout } from "ink";

/** Terminal dimensions */
export interface TerminalSize {
  columns: number;
  rows: number;
}

/** Computed dimensions passed via context */
export interface ComputedSize {
  width: number;
  height: number;
}

/** Context value */
export interface ConstraintContextValue {
  terminal: TerminalSize;
  parent: ComputedSize;
}

/** The context - starts undefined, must be wrapped in ConstraintRoot */
export const ConstraintContext = createContext<
  ConstraintContextValue | undefined
>(undefined);

/**
 * Hook to access the constraint context.
 * Throws if used outside a ConstraintRoot.
 */
export function useConstraintContext(): ConstraintContextValue {
  const context = useContext(ConstraintContext);
  if (!context) {
    throw new Error(
      "useConstraintContext must be used within a ConstraintRoot",
    );
  }
  return context;
}

/**
 * Hook to access just the computed parent size.
 * Shorthand for useConstraintContext().parent
 */
export function useComputedSize(): ComputedSize {
  const { parent } = useConstraintContext();
  return parent;
}

/**
 * Hook to access terminal dimensions.
 */
export function useTerminalSize(): TerminalSize {
  const { terminal } = useConstraintContext();
  return terminal;
}

/**
 * Props for ConstraintRoot
 */
export interface ConstraintRootProps {
  children: React.ReactNode;
  /** Padding from terminal edges */
  padding?: number | { x?: number; y?: number };
}

/**
 * Root component that provides terminal dimensions and initiates the constraint tree.
 * Wrap your entire TUI application in this component.
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
  const [terminal, setTerminal] = useState<TerminalSize>({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  });

  // Update on resize
  useEffect(() => {
    const handle = () => {
      setTerminal({
        columns: stdout?.columns ?? 80,
        rows: stdout?.rows ?? 24,
      });
    };

    // Initial size
    handle();

    stdout?.on("resize", handle);
    return () => {
      stdout?.off("resize", handle);
    };
  }, [stdout]);

  // Calculate available space after padding
  const px = typeof padding === "number" ? padding : (padding.x ?? 0);
  const py = typeof padding === "number" ? padding : (padding.y ?? 0);

  const parent: ComputedSize = {
    width: Math.max(1, terminal.columns - px * 2),
    height: Math.max(1, terminal.rows - py * 2),
  };

  return (
    <ConstraintContext.Provider value={{ terminal, parent }}>
      {children}
    </ConstraintContext.Provider>
  );
}
