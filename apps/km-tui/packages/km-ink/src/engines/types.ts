/**
 * Engine Types
 *
 * Type definitions for TUI engine abstraction.
 */

import type React from "react";

/**
 * Render options common to all engines
 */
export interface RenderOptions {
  exitOnCtrlC?: boolean;
  patchConsole?: boolean;
}

/**
 * Result of render function
 */
export interface RenderResult {
  waitUntilExit: () => Promise<void>;
  cleanup: () => void;
}

/**
 * TUI Engine interface
 */
export interface TuiEngineApi {
  /**
   * Render a component to the terminal with fullscreen support
   */
  render: (
    element: React.ReactElement,
    options?: RenderOptions,
  ) => Promise<RenderResult>;

  /**
   * Name of the engine for logging
   */
  name: string;
}
