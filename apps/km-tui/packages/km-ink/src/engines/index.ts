/**
 * TUI Engine Selection
 *
 * Provides abstraction over different rendering engines:
 * - ink: Stock Ink library with fullscreen-ink wrapper
 * - inkx: Custom fork with double-buffering and native scrolling
 * - inkx-flexx: inkx with pure JS flexbox (no yoga-wasm)
 */

import type { TuiEngine } from "../types.ts";
import type { TuiEngineApi } from "./types.ts";
import { inkEngine } from "./ink/render.ts";
import { inkxEngine } from "./inkx/render.ts";

export type { TuiEngineApi, RenderOptions, RenderResult } from "./types.ts";
export {
  EngineProvider,
  useEngineViews,
  useEngineName,
  type EngineViews,
  type EngineContextValue,
} from "./context.tsx";

/**
 * Get the engine API for the specified engine type
 */
export function getEngine(engine: TuiEngine): TuiEngineApi {
  switch (engine) {
    case "ink":
      return inkEngine;
    case "inkx":
    case "inkx-flexx":
      // inkx-flexx uses the same render API, just a different layout engine
      // The layout engine is configured separately via setLayoutEngine()
      return inkxEngine;
    default:
      throw new Error(`Unknown TUI engine: ${engine}`);
  }
}
