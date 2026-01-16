/**
 * @km/tui-app
 *
 * TUI application entry point.
 * Delegates to @km/ink (Ink-based renderer) or @km/opentui (experimental).
 */

// Re-export the primary TUI implementation
export * from "@km/ink";
