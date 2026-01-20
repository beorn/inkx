/**
 * Constraint Context
 *
 * Provides computed dimensions to child components via React context.
 * Works with vanilla Ink or Inkx.
 */

import React, { createContext, useContext, useState, useEffect } from "react";

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
 * Returns default values if not in a ConstraintRoot (for testing).
 */
export function useConstraintContext(): ConstraintContextValue {
  const context = useContext(ConstraintContext);

  if (context) {
    return context;
  }

  // Default fallback for tests
  return {
    terminal: { columns: 80, rows: 24 },
    parent: { width: 80, height: 24 },
  };
}

/**
 * Hook to access just the computed parent size.
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

/** Props for ConstraintRoot */
export interface ConstraintRootProps {
  children: React.ReactNode;
  /** Padding from terminal edges */
  padding?: number | { x?: number; y?: number };
  /** Stdout stream (from Ink's useStdout or process.stdout) */
  stdout?: NodeJS.WriteStream;
}

/**
 * Root component that provides terminal dimensions and initiates the constraint tree.
 * Wrap your entire TUI application in this component.
 *
 * @example
 * ```tsx
 * // With Ink
 * function App() {
 *   const { stdout } = useStdout();
 *   return (
 *     <ConstraintRoot stdout={stdout} padding={1}>
 *       <Board />
 *     </ConstraintRoot>
 *   );
 * }
 *
 * // Without Ink (standalone)
 * <ConstraintRoot stdout={process.stdout} padding={1}>
 *   <MyApp />
 * </ConstraintRoot>
 * ```
 */
export function ConstraintRoot({
  children,
  padding = 0,
  stdout = process.stdout,
}: ConstraintRootProps): React.ReactElement {
  const [terminal, setTerminal] = useState<TerminalSize>({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  });

  useEffect(() => {
    const handle = () => {
      setTerminal({
        columns: stdout?.columns ?? 80,
        rows: stdout?.rows ?? 24,
      });
    };

    handle();

    stdout?.on("resize", handle);
    return () => {
      stdout?.off("resize", handle);
    };
  }, [stdout]);

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
