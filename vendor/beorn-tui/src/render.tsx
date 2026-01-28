/**
 * @beorn/tui Render API
 *
 * Wraps inkx's render with a Term-first API:
 *   render(term, element) instead of render(element)
 *
 * Also provides renderString() for string output without terminal.
 */

import { createContext, type ReactElement } from 'react'
import type { Term, ColorLevel } from '@beorn/term'
import {
  render as inkxRender,
  renderSync as inkxRenderSync,
  type Instance as InkxInstance,
  type RenderOptions as InkxRenderOptions,
} from 'inkx'

// =============================================================================
// TermContext
// =============================================================================

/**
 * React context for accessing the Term in components.
 * Use useTerm() hook to access.
 */
export const TermContext = createContext<Term | null>(null)

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the render function.
 */
export interface RenderOptions {
  /** Use alternate screen buffer (default: false) */
  fullscreen?: boolean
  /** Exit on Ctrl+C (default: true) */
  exitOnCtrlC?: boolean
}

/**
 * Instance returned by render().
 * Implements Disposable for automatic cleanup with `using`.
 */
export interface RenderInstance extends Disposable {
  /** Re-render with a new element */
  rerender(element: ReactElement): void
  /** Unmount the component and clean up */
  unmount(): void
  /** Wait for the app to exit (alias for waitUntilExit) */
  run(): Promise<void>
  /** Clear the terminal output */
  clear(): void
  /** Dispose of the render instance (calls unmount) */
  dispose(): void
  /** Symbol.dispose for `using` statement support */
  [Symbol.dispose](): void
}

/**
 * Options for renderString with a Term.
 */
export interface RenderStringOptionsWithTerm {
  /** Width for layout (default: term.cols or 80) */
  width?: number
}

/**
 * Options for renderString without a Term.
 */
export interface RenderStringOptions {
  /** Width for layout (default: 80) */
  width?: number
  /** Plain text output (no ANSI codes) */
  plain?: boolean
  /** Color level to use */
  color?: ColorLevel
}

// =============================================================================
// render()
// =============================================================================

/**
 * Render a React element to the terminal.
 *
 * @example
 * ```tsx
 * import { createTerm } from '@beorn/term'
 * import { render, Box, Text } from '@beorn/tui'
 *
 * using term = createTerm()
 * using app = await render(term, <App />)
 * await app.run()
 * ```
 *
 * @param term - The Term instance to render to
 * @param element - The React element to render
 * @param options - Render options
 * @returns Promise<RenderInstance> with control methods
 */
export async function render(
  term: Term,
  element: ReactElement,
  options: RenderOptions = {}
): Promise<RenderInstance> {
  const { fullscreen = false, exitOnCtrlC = true } = options

  // Map our options to inkx options
  const inkxOptions: InkxRenderOptions = {
    stdout: term.stdout,
    stdin: term.stdin,
    alternateScreen: fullscreen,
    exitOnCtrlC,
  }

  // Wrap element with TermContext provider
  const wrappedElement = (
    <TermContext.Provider value={term}>{element}</TermContext.Provider>
  )

  // Call inkx's render
  const inkxInstance = await inkxRender(wrappedElement, inkxOptions)

  // Wrap the instance to add Disposable support
  return wrapInstance(inkxInstance, term)
}

/**
 * Synchronous render for when layout engine is already initialized.
 *
 * @param term - The Term instance to render to
 * @param element - The React element to render
 * @param options - Render options
 * @returns RenderInstance with control methods
 */
export function renderSync(
  term: Term,
  element: ReactElement,
  options: RenderOptions = {}
): RenderInstance {
  const { fullscreen = false, exitOnCtrlC = true } = options

  const inkxOptions: InkxRenderOptions = {
    stdout: term.stdout,
    stdin: term.stdin,
    alternateScreen: fullscreen,
    exitOnCtrlC,
  }

  const wrappedElement = (
    <TermContext.Provider value={term}>{element}</TermContext.Provider>
  )

  const inkxInstance = inkxRenderSync(wrappedElement, inkxOptions)

  return wrapInstance(inkxInstance, term)
}

/**
 * Wrap an inkx Instance to add Disposable support and run() alias.
 */
function wrapInstance(inkxInstance: InkxInstance, _term: Term): RenderInstance {
  const dispose = () => {
    inkxInstance.unmount()
  }

  return {
    rerender: (element: ReactElement) => {
      const wrappedElement = (
        <TermContext.Provider value={_term}>{element}</TermContext.Provider>
      )
      inkxInstance.rerender(wrappedElement)
    },
    unmount: inkxInstance.unmount,
    run: inkxInstance.waitUntilExit,
    clear: inkxInstance.clear,
    dispose,
    [Symbol.dispose]: dispose,
  }
}

// =============================================================================
// renderString()
// =============================================================================

/**
 * Render a React element to a string.
 *
 * With Term - respects terminal capabilities (color, unicode):
 * @example
 * ```tsx
 * import { createTerm } from '@beorn/term'
 * import { renderString, Box, Text } from '@beorn/tui'
 *
 * const term = createTerm()
 * const output = renderString(term, <Box><Text>Hello</Text></Box>)
 * ```
 *
 * Without Term - plain text or explicit options:
 * @example
 * ```tsx
 * import { renderString, Box, Text } from '@beorn/tui'
 *
 * // Plain text (no ANSI)
 * const plain = renderString(<Box><Text>Hello</Text></Box>, { plain: true })
 *
 * // With color
 * const colored = renderString(<Box><Text color="red">Error</Text></Box>, { color: 'truecolor' })
 * ```
 */
export function renderString(
  term: Term,
  element: ReactElement,
  options?: RenderStringOptionsWithTerm
): string

export function renderString(
  element: ReactElement,
  options?: RenderStringOptions
): string

export function renderString(
  termOrElement: Term | ReactElement,
  elementOrOptions?: ReactElement | RenderStringOptionsWithTerm | RenderStringOptions,
  maybeOptions?: RenderStringOptionsWithTerm
): string {
  // Determine which overload was called
  const isTerm = (obj: unknown): obj is Term =>
    obj !== null &&
    typeof obj === 'object' &&
    'hasCursor' in obj &&
    'hasColor' in obj &&
    'stdout' in obj

  if (isTerm(termOrElement)) {
    // Called with Term
    const term = termOrElement
    const element = elementOrOptions as ReactElement
    const options = maybeOptions ?? {}
    const width = options.width ?? term.cols ?? 80

    // Wrap element with TermContext
    const wrappedElement = (
      <TermContext.Provider value={term}>{element}</TermContext.Provider>
    )

    // Determine non-TTY mode based on term capabilities
    const nonTTYMode = term.hasColor() ? 'line-by-line' : 'plain'

    return renderToString(wrappedElement, width, nonTTYMode)
  } else {
    // Called without Term
    const element = termOrElement as ReactElement
    const options = (elementOrOptions as RenderStringOptions) ?? {}
    const width = options.width ?? 80

    // Determine non-TTY mode
    let nonTTYMode: 'plain' | 'line-by-line' = 'line-by-line'
    if (options.plain) {
      nonTTYMode = 'plain'
    }

    return renderToString(element, width, nonTTYMode)
  }
}

/**
 * Internal helper to render element to string using inkx's pipeline.
 */
function renderToString(
  element: ReactElement,
  width: number,
  nonTTYMode: 'plain' | 'line-by-line'
): string {
  // Create a mock stdout that collects output
  let output = ''
  const mockStdout = {
    columns: width,
    rows: 24,
    isTTY: false,
    write(data: string | Uint8Array) {
      if (typeof data === 'string') {
        output += data
      } else {
        output += new TextDecoder().decode(data)
      }
      return true
    },
    // Event listener methods (no-op)
    on: () => mockStdout,
    off: () => mockStdout,
    once: () => mockStdout,
    removeListener: () => mockStdout,
    addListener: () => mockStdout,
  } as unknown as NodeJS.WriteStream

  // Create a mock stdin
  const mockStdin = {
    isTTY: false,
    setRawMode: () => mockStdin,
    on: () => mockStdin,
    off: () => mockStdin,
    once: () => mockStdin,
    removeListener: () => mockStdin,
    addListener: () => mockStdin,
    setEncoding: () => mockStdin,
    read: () => null,
    ref: () => mockStdin,
    unref: () => mockStdin,
  } as unknown as NodeJS.ReadStream

  // Use inkx's renderSync with non-TTY mode
  const instance = inkxRenderSync(element, {
    stdout: mockStdout,
    stdin: mockStdin,
    exitOnCtrlC: false,
    nonTTYMode,
  })

  // Unmount immediately since we just want the output
  instance.unmount()

  // Trim trailing newlines and return
  return output.trimEnd()
}
