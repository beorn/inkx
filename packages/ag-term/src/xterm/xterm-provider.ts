/**
 * xterm.js Provider — browser-friendly input/output adapter.
 *
 * Bridges an xterm.js Terminal into a provider interface that silvery's
 * RuntimeContext can consume. No Node.js dependencies.
 *
 * Handles:
 * - Keyboard input (via terminal.onData)
 * - Mouse input (SGR mode parsing)
 * - Focus tracking (via textarea focus/blur)
 * - Terminal dimensions
 * - ANSI output
 *
 * @example
 * ```typescript
 * import { createXtermProvider } from "./xterm-provider"
 *
 * const provider = createXtermProvider(terminal)
 * const cleanup = provider.onInput((chunk) => {
 *   // raw terminal data, ready for parseKey/splitRawInput
 * })
 * provider.write(ansiOutput)
 * provider.dispose()
 * ```
 */

import type { XtermTerminal } from "./index"
import { createLogger } from "loggily"
import { createTerminalInputStreamDecoder, type TerminalInputSegment } from "../protocol-segments"

const log = createLogger("silvery:xterm-input")

// SGR mouse sequence regex: \x1b[<btn;x;yM (press) or \x1b[<btn;x;ym (release)
const SGR_MOUSE_RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g

// Mouse tracking: Normal mode + SGR extended mode
const MOUSE_ENABLE = "\x1b[?1000h\x1b[?1006h"
const MOUSE_DISABLE = "\x1b[?1000l\x1b[?1006l"

// ============================================================================
// Types
// ============================================================================

export interface XtermProvider {
  /**
   * Subscribe to raw input chunks (keyboard data with mouse sequences stripped).
   * The chunks are raw terminal escape sequences suitable for splitRawInput/parseKey.
   * Returns cleanup function.
   */
  onInput(handler: (chunk: string) => void): () => void

  /** Subscribe to decoded bracketed-paste and OSC 52 clipboard text. */
  onPaste(handler: (text: string) => void): () => void

  /**
   * Subscribe to mouse events (SGR mode, parsed).
   * Returns cleanup function.
   */
  onMouse(
    handler: (info: { x: number; y: number; button: number; type: "press" | "release" }) => void,
  ): () => void

  /**
   * Subscribe to focus changes.
   * Returns cleanup function.
   */
  onFocus(handler: (focused: boolean) => void): () => void

  /** Get current dimensions */
  dims(): { cols: number; rows: number }

  /** Write ANSI output to terminal */
  write(data: string): void

  /** Enable SGR mouse tracking */
  enableMouse(): void

  /** Disable SGR mouse tracking */
  disableMouse(): void

  /** Clean up all listeners */
  dispose(): void
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a provider that bridges an xterm.js Terminal to silvery's input system.
 *
 * The provider separates mouse sequences from keyboard input, so consumers
 * get clean keyboard data via `onInput`, typed paste text via `onPaste`, and
 * parsed mouse events via `onMouse`.
 */
export function createXtermProvider(terminal: XtermTerminal): XtermProvider {
  const inputHandlers = new Set<(chunk: string) => void>()
  const pasteHandlers = new Set<(text: string) => void>()
  const mouseHandlers = new Set<
    (info: { x: number; y: number; button: number; type: "press" | "release" }) => void
  >()
  const focusHandlers = new Set<(focused: boolean) => void>()
  const disposables: Array<{ dispose(): void }> = []
  let disposed = false

  function dispatchInputSegment(segment: TerminalInputSegment): void {
    if (segment.type === "raw") {
      dispatchRawInput(segment.data)
    } else if (segment.type === "invalid") {
      log.debug?.(
        `input protocol rejected malformed input: ${segment.error.reason} (parser=${segment.error.parser}, len=${segment.error.inputLength})`,
      )
    } else {
      for (const handler of pasteHandlers) handler(segment.text)
    }
  }

  const inputDecoder = createTerminalInputStreamDecoder({
    onPrefixTimeout(segments) {
      if (disposed) return
      for (const segment of segments) dispatchInputSegment(segment)
    },
  })

  function dispatchRawInput(data: string): void {
    let lastIndex = 0
    let keyboardData = ""

    SGR_MOUSE_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = SGR_MOUSE_RE.exec(data)) !== null) {
      if (match.index > lastIndex) keyboardData += data.slice(lastIndex, match.index)
      lastIndex = match.index + match[0].length

      const btn = parseInt(match[1]!, 10)
      const x = parseInt(match[2]!, 10) - 1
      const y = parseInt(match[3]!, 10) - 1
      const type = match[4] === "M" ? ("press" as const) : ("release" as const)
      for (const handler of mouseHandlers) handler({ x, y, button: btn, type })
    }

    if (lastIndex < data.length) keyboardData += data.slice(lastIndex)
    if (keyboardData.length > 0) {
      for (const handler of inputHandlers) handler(keyboardData)
    }
  }

  // Wire terminal.onData — split mouse sequences from keyboard input
  if (terminal.onData) {
    const dataDisposable = terminal.onData((data: string) => {
      if (disposed) return

      for (const segment of inputDecoder.push(data)) {
        dispatchInputSegment(segment)
      }
    })
    disposables.push(dataDisposable)
  }

  // Wire focus/blur tracking via xterm.js textarea
  if (terminal.textarea) {
    const textarea = terminal.textarea
    const onFocusIn = () => {
      for (const handler of focusHandlers) handler(true)
    }
    const onFocusOut = () => {
      for (const handler of focusHandlers) handler(false)
    }
    textarea.addEventListener("focus", onFocusIn)
    textarea.addEventListener("blur", onFocusOut)
    disposables.push({
      dispose() {
        textarea.removeEventListener("focus", onFocusIn)
        textarea.removeEventListener("blur", onFocusOut)
      },
    })
  }

  return {
    onInput(handler) {
      inputHandlers.add(handler)
      return () => {
        inputHandlers.delete(handler)
      }
    },

    onPaste(handler) {
      pasteHandlers.add(handler)
      return () => {
        pasteHandlers.delete(handler)
      }
    },

    onMouse(handler) {
      mouseHandlers.add(handler)
      return () => {
        mouseHandlers.delete(handler)
      }
    },

    onFocus(handler) {
      focusHandlers.add(handler)
      return () => {
        focusHandlers.delete(handler)
      }
    },

    dims() {
      return { cols: terminal.cols, rows: terminal.rows }
    },

    write(data: string) {
      terminal.write(data)
    },

    enableMouse() {
      terminal.write(MOUSE_ENABLE)
    },

    disableMouse() {
      terminal.write(MOUSE_DISABLE)
    },

    dispose() {
      if (disposed) return
      disposed = true
      for (const d of disposables) d.dispose()
      disposables.length = 0
      inputHandlers.clear()
      pasteHandlers.clear()
      mouseHandlers.clear()
      focusHandlers.clear()
      inputDecoder.reset()
    },
  }
}
