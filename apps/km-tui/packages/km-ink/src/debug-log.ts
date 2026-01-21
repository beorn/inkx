/**
 * Debug logging for TUI rendering
 *
 * Uses the npm debug package. Enable with DEBUG=km:tui:*
 * or specific namespaces like DEBUG=km:tui:render
 *
 * To redirect to a file: DEBUG=km:tui:* bun km view 2>/tmp/debug.log
 *
 * Usage:
 *   import { debugLog } from "./debug-log.ts";
 *   debugLog("TreeNode", { prefix: "...", content: "..." });
 */

import createDebug from "debug";

const debugRender = createDebug("km:tui:render");

/**
 * Log a debug message with optional structured data.
 * Only logs when DEBUG=km:tui:render is enabled.
 *
 * @param tag - Component or function name for filtering
 * @param data - Structured data to log (will be JSON stringified)
 */
export function debugLog(tag: string, data?: Record<string, unknown>): void {
  if (!debugRender.enabled) return;
  const dataStr = data ? ` ${JSON.stringify(data)}` : "";
  debugRender(`[${tag}]${dataStr}`);
}

/**
 * Log a raw string for visual inspection of rendered output.
 * Escapes non-printable chars and shows string length.
 */
export function debugLogString(tag: string, label: string, str: string): void {
  if (!debugRender.enabled) return;

  // Escape non-printable characters for visibility
  const escaped = str
    .replace(/\x1b\[[0-9;]*m/g, (m) => `<ESC${m.slice(1)}>`) // ANSI codes
    .replace(/ /g, "·") // Show spaces as middle dots
    .replace(/\t/g, "→");

  debugLog(tag, { [label]: escaped, length: str.length });
}
