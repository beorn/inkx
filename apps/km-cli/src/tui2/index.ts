/**
 * TUI2 - OpenTUI-based TUI Implementation
 *
 * Layered architecture:
 * - Components: Stateless UI primitives
 * - Views: Presenters that render ViewModels
 * - Hooks: State management
 * - ViewModels: Data transformation
 * - App: Container connecting everything
 */

export { App } from "./App.tsx";
export * from "./components/index.ts";
export * from "./views/index.ts";
export * from "./hooks/index.ts";
export * from "./viewmodels/index.ts";
export * from "./types.ts";
