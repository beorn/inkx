/**
 * CopyModeFeature — service wrapping the headless copy-mode machine.
 *
 * Keyboard-driven selection mode (vim-like visual mode). When active,
 * h/j/k/l navigate a cursor, v/V toggle visual selection, y yanks
 * (copies) the selection and exits.
 *
 * REQUIRES SelectionFeature — copy-mode drives selection via setRange().
 *
 * @example
 * ```ts
 * const copyMode = createCopyModeFeature({
 *   selection,
 *   invalidate: () => app.invalidate(),
 * })
 * copyMode.enter()
 * copyMode.motion("j")
 * copyMode.startVisual()
 * copyMode.yank()
 * ```
 */

import {
  createCopyModeState,
  copyModeUpdate,
  type CopyModeState,
  type CopyModeAction,
  type CopyModeEffect,
} from "@silvery/headless/copy-mode"

import type { SelectionFeature } from "./selection"

// ============================================================================
// Types
// ============================================================================

export interface CopyModeFeature {
  /** Current copy-mode state. */
  readonly state: CopyModeState

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void

  /** Enter copy mode at the given position. */
  enter(col?: number, row?: number, bufferWidth?: number, bufferHeight?: number): void

  /** Exit copy mode. */
  exit(): void

  /** Execute a motion key (h/j/k/l). */
  motion(key: string): void

  /** Start character-wise visual selection (v). */
  startVisual(): void

  /** Start line-wise visual selection (V). */
  startVisualLine(): void

  /** Yank (copy) the current selection and exit. */
  yank(): void

  /** Clean up resources. */
  dispose(): void
}

export interface CopyModeFeatureOptions {
  /** SelectionFeature for driving visual selection. REQUIRED. */
  selection: SelectionFeature

  /** Callback to trigger a render pass. */
  invalidate: () => void

  /** Default buffer dimensions (used when enter() is called without args). */
  bufferWidth?: number
  bufferHeight?: number
}

// ============================================================================
// Helpers
// ============================================================================

const MOTION_MAP: Record<string, "up" | "down" | "left" | "right"> = {
  h: "left",
  j: "down",
  k: "up",
  l: "right",
}

// ============================================================================
// Implementation
// ============================================================================

export function createCopyModeFeature(options: CopyModeFeatureOptions): CopyModeFeature {
  const { selection, invalidate, bufferWidth = 80, bufferHeight = 24 } = options
  const listeners = new Set<() => void>()

  let state = createCopyModeState()

  function notify(): void {
    for (const listener of listeners) {
      listener()
    }
  }

  function processEffects(effects: CopyModeEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "render":
          invalidate()
          break
        case "setSelection":
          selection.setRange({
            anchor: { col: effect.anchor.col, row: effect.anchor.row },
            head: { col: effect.head.col, row: effect.head.row },
          })
          break
        case "copy":
          // Write the yanked selection to the clipboard via the SAME path as
          // mouse/drag copy (SelectionFeature.copySelection → extract + clipboard
          // / OSC 52), then clear. Previously this only cleared, so keyboard
          // yank silently copied nothing (km-silvery 19761).
          selection.copySelection()
          selection.clear()
          break
        case "scroll":
          // Scroll effects are handled by the app layer
          break
      }
    }
  }

  function dispatch(action: CopyModeAction): void {
    const [newState, effects] = copyModeUpdate(action, state)
    state = newState
    notify()
    processEffects(effects)
  }

  return {
    get state(): CopyModeState {
      return state
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    enter(col = 0, row = 0, bw = bufferWidth, bh = bufferHeight): void {
      dispatch({ type: "enter", col, row, bufferWidth: bw, bufferHeight: bh })
    },

    exit(): void {
      dispatch({ type: "exit" })
      selection.clear()
    },

    motion(key: string): void {
      const direction = MOTION_MAP[key]
      if (direction) {
        dispatch({ type: "move", direction })
      }
    },

    startVisual(): void {
      dispatch({ type: "visual" })
    },

    startVisualLine(): void {
      dispatch({ type: "visualLine" })
    },

    yank(): void {
      dispatch({ type: "yank" })
    },

    dispose(): void {
      listeners.clear()
      state = createCopyModeState()
    },
  }
}
