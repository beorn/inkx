/**
 * @beorn/tui - Terminal UI Framework
 *
 * Combines inkx (React terminal rendering), @beorn/term (terminal detection/styling),
 * and console components into a unified TUI framework.
 *
 * @example
 * ```tsx
 * import { render, Box, Text, useInput, useApp, useTerm } from '@beorn/tui'
 *
 * function App() {
 *   const { exit } = useApp()
 *   const term = useTerm()
 *
 *   useInput((input, key) => {
 *     if (input === 'q') exit()
 *   })
 *
 *   return (
 *     <Box>
 *       <Text>{term.green('Hello TUI!')}</Text>
 *     </Box>
 *   )
 * }
 *
 * await render(<App />)
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Components from inkx
// =============================================================================

export { Box } from 'inkx'
export { Text } from 'inkx'
export { Newline } from 'inkx'
export { Spacer } from 'inkx'
export { Static } from 'inkx'

// =============================================================================
// Hooks from inkx
// =============================================================================

// Layout hooks
export {
  useContentRect,
  useContentRectCallback,
  useScreenRect,
  useScreenRectCallback,
  useLayout,
  useLayoutCallback,
} from 'inkx'

// Input/app hooks
export { useInput } from 'inkx'
export { useApp } from 'inkx'
export { useStdout } from 'inkx'
export { useStdin } from 'inkx'
export { useFocus, resetFocusIdCounter } from 'inkx'
export { useFocusManager } from 'inkx'

// Hit registry (mouse support)
export {
  HitRegistry,
  HitRegistryContext,
  useHitRegistry,
  useHitRegion,
  useHitRegionCallback,
  resetHitRegionIdCounter,
  Z_INDEX,
} from 'inkx'

// =============================================================================
// Layout engine from inkx
// =============================================================================

export {
  setLayoutEngine,
  isLayoutEngineInitialized,
  createYogaEngine,
  initYogaEngine,
  YogaLayoutEngine,
  createFlexxEngine,
  FlexxLayoutEngine,
} from 'inkx'

export { measureElement } from 'inkx'
export { ANSI, enableMouse, disableMouse } from 'inkx'

// Non-TTY utilities
export { isTTY, resolveNonTTYMode, stripAnsi } from 'inkx'

// =============================================================================
// Types from inkx
// =============================================================================

export type { BoxProps } from 'inkx'
export type { TextProps } from 'inkx'
export type { Rect, ComputedLayout } from 'inkx'
export type { Key, InputHandler, UseInputOptions } from 'inkx'
export type { UseAppResult } from 'inkx'
export type { UseStdoutResult } from 'inkx'
export type { UseStdinResult } from 'inkx'
export type { UseFocusOptions, UseFocusResult } from 'inkx'
export type { UseFocusManagerResult } from 'inkx'
export type { RenderOptions, Instance, RenderMode, NonTTYMode } from 'inkx'
export type { MeasureElementOutput } from 'inkx'
export type { InkxNode } from 'inkx'
export type { HitTarget, HitRegion } from 'inkx'
export type {
  LayoutEngine,
  LayoutNode,
  LayoutConstants,
  MeasureFunc,
  MeasureMode,
} from 'inkx'
export type { NonTTYOptions, ResolvedNonTTYMode } from 'inkx'

// =============================================================================
// TUI-specific render functions
// =============================================================================

export { render, renderSync, renderString, TermContext } from './render.js'
export type {
  RenderOptions as TuiRenderOptions,
  RenderInstance,
  RenderStringOptions,
  RenderStringOptionsWithTerm,
} from './render.js'

// =============================================================================
// TUI-specific components
// =============================================================================

export { Console } from './components/Console.js'

// =============================================================================
// TUI-specific hooks
// =============================================================================

export { useConsole } from './hooks/useConsole.js'
export { useTerm } from './hooks/useTerm.js'

// =============================================================================
// Re-exports from @beorn/term
// =============================================================================

export { createTerm, patchConsole, chalk } from '@beorn/term'
export type { Term, StyleChain, PatchedConsole, ColorLevel, ConsoleEntry } from '@beorn/term'
