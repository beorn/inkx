/**
 * TUI Engine Selection
 *
 * Provides abstraction over different rendering engines:
 * - inkx: Custom Ink fork with double-buffering and native scrolling
 * - inkx-flexx: inkx with pure JS flexbox (no yoga-wasm)
 */

import type { TuiEngine } from "../types.ts";
import type { TuiEngineApi } from "./types.ts";
import { inkxEngine } from "./inkx/render.ts";

export type { TuiEngineApi, RenderOptions, RenderResult } from "./types.ts";

/**
 * Get the engine API for the specified engine type
 */
export function getEngine(engine: TuiEngine): TuiEngineApi {
  switch (engine) {
    case "inkx":
    case "inkx-flexx":
      // inkx-flexx uses the same render API, just a different layout engine
      // The layout engine is configured separately via setLayoutEngine()
      return inkxEngine;
  }
}
