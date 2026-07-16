/**
 * Pure layout function for silvery-loop.
 *
 * Takes a React element and dimensions, returns an immutable Buffer.
 * This is Layer 0 - no runtime, no events, just pure rendering.
 */

import { createTerm } from "../ansi/index"
import React, { type ReactElement } from "react"
import { bufferToStyledText, bufferToText } from "../buffer"
import { StdoutContext, StderrContext, TermContext } from "@silvery/ag-react/context"
import { ensureDefaultLayoutEngine, isLayoutEngineInitialized } from "../layout-engine"
import { createAg } from "../ag"
import {
  createContainer,
  createFiberRoot,
  getContainerRoot,
  reconciler,
} from "@silvery/ag-react/reconciler"
import type { Buffer, Dims } from "./types"

/**
 * Options for the layout function.
 */
export interface LayoutOptions {
  /** Skip layout notifications (for static renders). Default: true */
  skipLayoutNotifications?: boolean
  /** Strip ANSI codes for plain text output. Default: false */
  plain?: boolean
}

/**
 * Ensure layout engine is initialized.
 * Must be called before layout() in async contexts.
 */
export async function ensureLayoutEngine(): Promise<void> {
  if (!isLayoutEngineInitialized()) {
    await ensureDefaultLayoutEngine()
  }
}

/**
 * Pure layout function - renders a React element to a Buffer.
 *
 * IMPORTANT: Call ensureLayoutEngine() first in async contexts.
 * The layout engine must be initialized before calling this.
 *
 * @param element React element to render
 * @param dims Terminal dimensions
 * @param options Layout options
 * @returns Immutable Buffer with text, ansi, and nodes
 *
 * @example
 * ```typescript
 * import { layout, ensureLayoutEngine } from '@silvery/ag-term/runtime'
 *
 * await ensureLayoutEngine()
 * const buffer = layout(<Text>Hello</Text>, { cols: 80, rows: 24 })
 * console.log(buffer.text) // "Hello"
 * ```
 */
export function layout(element: ReactElement, dims: Dims, options: LayoutOptions = {}): Buffer {
  if (!isLayoutEngineInitialized()) {
    throw new Error("Layout engine not initialized. Call ensureLayoutEngine() first.")
  }

  const { skipLayoutNotifications = true, plain = false } = options
  const { cols: width, rows: height } = dims

  // Create container for React reconciliation
  const container = createContainer(() => {})

  // Create fiber root
  const fiberRoot = createFiberRoot(container)

  // Create minimal mock stdout for components that use useStdout
  const mockStdout = {
    columns: width,
    rows: height,
    write: () => true,
    isTTY: false,
    on: () => mockStdout,
    off: () => mockStdout,
    once: () => mockStdout,
    removeListener: () => mockStdout,
    addListener: () => mockStdout,
  } as unknown as NodeJS.WriteStream

  // Create a fixed-size headless Term for components that use useTerm().
  // `layout()` is a pure, one-shot entrypoint: it must not acquire the host
  // process's stdin/stdout or inherit dimensions from them.
  using mockTerm = createTerm({
    cols: width,
    rows: height,
    caps: { colorLevel: plain ? "mono" : "truecolor" },
  })

  // Wrap with minimal contexts (no input handling needed)
  const wrapped = React.createElement(
    TermContext.Provider,
    { value: mockTerm },
    React.createElement(
      StdoutContext.Provider,
      {
        value: {
          stdout: mockStdout,
          write: () => {},
        },
      },
      React.createElement(
        StderrContext.Provider,
        {
          value: {
            stderr: process.stderr,
            write: (data: string) => {
              process.stderr.write(data)
            },
          },
        },
        element,
      ),
    ),
  )

  try {
    // Mount and render without act warnings.
    withoutActWarnings(() => {
      reconciler.updateContainerSync(wrapped, fiberRoot, null, null)
      reconciler.flushSyncWork()
    })

    // Execute render pipeline (skip layout notifications for static renders)
    const root = getContainerRoot(container)
    const ag = createAg(root)
    ag.layout({ cols: width, rows: height }, { skipLayoutNotifications })
    const { buffer: termBuffer } = ag.render()

    return {
      text: bufferToText(termBuffer),
      ansi: bufferToStyledText(termBuffer),
      nodes: root,
      _buffer: termBuffer,
    }
  } finally {
    // Static layout is one-shot: always release React effects, even when
    // reconciliation, layout, or rendering throws.
    withoutActWarnings(() => {
      reconciler.updateContainerSync(null, fiberRoot, null, null)
      reconciler.flushSyncWork()
    })
  }
}

/**
 * Synchronous layout - assumes engine is already initialized.
 * Throws if engine not ready.
 */
export function layoutSync(element: ReactElement, dims: Dims, options: LayoutOptions = {}): Buffer {
  return layout(element, dims, options)
}

/**
 * Run a function with React act warnings disabled.
 * Used for static renders where we don't use act() and don't need layout feedback.
 */
function withoutActWarnings(fn: () => void): void {
  const prev = (globalThis as any).IS_REACT_ACT_ENVIRONMENT
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
  try {
    fn()
  } finally {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = prev
  }
}
