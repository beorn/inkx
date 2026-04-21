/**
 * App.tsx — the real React component under test.
 *
 * This is what makes Spike 2 different from Spike 1: we render through
 * the actual silvery/Ink reconciler via `run(<App />, term)`, and
 * keyboard input flows through the real `useInput` hook (which
 * subscribes to the chain app's input store on mount and unsubscribes on
 * unmount).
 *
 * ## UI shape
 *
 * When closed, the board is visible and focused:
 *
 *   [Board] (focused)
 *     > n1
 *       n2
 *       n3
 *       n4
 *       n5
 *   Press Ctrl+P to open dialog
 *
 * When open, a dialog overlay takes focus:
 *
 *   [Board] (not focused)
 *       n1
 *       n2
 *       ...
 *   [Dialog] (focused)
 *     > query▁
 *     Esc to close
 *
 * ## What the lifecycle spike is watching
 *
 *   1. Every call to the board's useInput handler is logged — when the
 *      dialog is open, the board handler must NOT fire (that's focus
 *      containment). When the dialog is closed, the dialog handler must
 *      NOT fire.
 *   2. useEffect mount/unmount bumps `cycleCount` — we check this ==
 *      unmount count + 1 at the end of each cycle.
 *   3. Every render bumps a render counter — we expect one render per
 *      logical key event; >1 per event signals render storm.
 *   4. Dialog state lives in React useState — the simplest real case;
 *      Phase B swaps this for Zustand.
 *
 * ## What it deliberately does NOT do
 *
 *   - No command plugin. We're testing *useInput* (the hook that
 *     Spike 1 said was a hard architectural constraint). Dispatch from a
 *     handler would throw — that's on purpose: we want to observe what
 *     happens when developers reach for the obvious React shape.
 *     Finding: the handler itself mutates React state via setState,
 *     which is safe (no chain-app reentry).
 */

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Box, Text } from "@silvery/ag-react"
import { useInput } from "@silvery/ag-react/hooks/useInput"
import type { Key } from "@silvery/ag/keys"

import {
  incDialogClose,
  incDialogOpen,
  incRegistration,
  incDisposal,
  incRender,
  recordKey,
} from "./lifecycle-counters.ts"
import { logDialog, logHandler, logKey, logMount, logRender, logUnmount } from "./trace.ts"

const NODES = ["n1", "n2", "n3", "n4", "n5"] as const

export interface AppProps {
  /**
   * Which mount cycle this is — the spike remounts the app to test
   * handler cleanup. Written to the trace so humans can read
   * "was this the second cycle?" without guessing.
   */
  pass?: number
  /**
   * If provided, a Zustand store wired to the same open/query shape.
   * Phase B swaps from React useState to Zustand; Phase A leaves this
   * undefined and uses local state.
   */
  useStore?: () => { open: boolean; query: string; cursor: string }
  /**
   * Store actions — only used when `useStore` is provided.
   */
  actions?: {
    openDialog(): void
    closeDialog(): void
    insertChar(ch: string): void
    backspace(): void
    cursorDown(): void
  }
}

export function App({ pass = 0, useStore, actions }: AppProps): React.ReactElement {
  // ---- React state (Phase A) OR Zustand-mirrored state (Phase B) ----
  //
  // We branch based on whether the test supplied `useStore`. The shape is
  // identical either way — the board reads `cursor`, the dialog reads
  // `open` and `query`. What differs is *who owns the state* and how
  // React is notified of changes. Phase B verifies that Zustand's
  // `useSyncExternalStore`-based subscriptions cohabitate cleanly with
  // useInput's effect-based subscriptions.
  const storeState = useStore?.()
  const [localOpen, setLocalOpen] = useState(false)
  const [localQuery, setLocalQuery] = useState("")
  const [localCursor, setLocalCursor] = useState<string>(NODES[0])
  const open = storeState ? storeState.open : localOpen
  const query = storeState ? storeState.query : localQuery
  const cursor = storeState ? storeState.cursor : localCursor

  // Observe renders. This runs on every commit — if React re-renders
  // twice per key event, we'll see `renders` diverge from the number of
  // events we sent.
  incRender()
  logRender(pass, open, query)

  // Track mount/unmount. useEffect with [] runs once on mount and once
  // on cleanup (on unmount). If we see cleanup without matching mount on
  // re-render, that's a leak.
  useEffect(() => {
    logMount(pass)
    return () => {
      logUnmount(pass)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Wrap the state transitions — the spike logs these to distinguish
  // "keys arrived but state didn't advance" from "state advanced twice".
  const openDialog = useCallback(() => {
    if (actions) {
      actions.openDialog()
    } else {
      setLocalOpen(true)
      setLocalQuery("")
    }
    incDialogOpen()
    logDialog(true, "")
  }, [actions])

  const closeDialog = useCallback(() => {
    if (actions) {
      actions.closeDialog()
    } else {
      setLocalOpen(false)
    }
    incDialogClose()
    logDialog(false, query)
  }, [actions, query])

  const insertChar = useCallback(
    (ch: string) => {
      if (actions) {
        actions.insertChar(ch)
      } else {
        setLocalQuery((q) => q + ch)
      }
    },
    [actions],
  )

  const backspace = useCallback(() => {
    if (actions) {
      actions.backspace()
    } else {
      setLocalQuery((q) => q.slice(0, -1))
    }
  }, [actions])

  const cursorDown = useCallback(() => {
    if (actions) {
      actions.cursorDown()
    } else {
      setLocalCursor((c) => {
        const idx = NODES.indexOf(c as (typeof NODES)[number])
        return NODES[Math.min(NODES.length - 1, idx + 1)]
      })
    }
  }, [actions])

  // ---- Handler registration bookkeeping ----
  //
  // The spike wants to know how many live subscriptions there are on the
  // chain input store. We can't observe chain internals from here, but
  // we can count the effect firings that register/dispose the handler.
  // Each useInput call below has an `isActive` prop — when it flips
  // from true to false, the hook's useEffect cleanup fires (dispose),
  // and when it flips back the effect re-runs (register). If a key
  // dispatch leaks onto the wrong handler, that's the symptom we expect
  // to catch.
  //
  // We wrap the useEffect to log register/dispose — useInput itself
  // doesn't expose the register count, so we use a parallel effect with
  // the same `isActive` dependency. One-to-one correspondence lets us
  // assert the counts.
  const boardActive = !open
  useEffect(() => {
    if (!boardActive) return
    incRegistration()
    logHandler("register", "board")
    return () => {
      incDisposal()
      logHandler("dispose", "board")
    }
  }, [boardActive])

  const dialogActive = open
  useEffect(() => {
    if (!dialogActive) return
    incRegistration()
    logHandler("register", "dialog")
    return () => {
      incDisposal()
      logHandler("dispose", "dialog")
    }
  }, [dialogActive])

  // ---- Board key handling ----
  //
  // Gated by `isActive` — when the dialog is open, the board handler
  // becomes inactive and useInput's internal effect unsubscribes. This
  // is the CANONICAL silvery idiom for focus containment at the hook
  // layer: the component does not walk a focus tree; it simply
  // declares when it's interested.
  const boardHandler = useCallback(
    (input: string, key: Key) => {
      recordKey(keyEventFrom(input, key))
      logKey(keyEventFrom(input, key))
      if (key.ctrl && input === "p") {
        openDialog()
        return
      }
      if (input === "j") {
        cursorDown()
        return
      }
    },
    [openDialog, cursorDown],
  )
  useInput(boardHandler, { isActive: !open })

  // ---- Dialog key handling ----
  //
  // Same pattern, inverse activation. The dialog handles printable
  // chars, backspace, and Escape. Enter in this spike is a no-op —
  // we don't need a commit action to prove the lifecycle claim.
  const dialogHandler = useCallback(
    (input: string, key: Key) => {
      recordKey(keyEventFrom(input, key))
      logKey(keyEventFrom(input, key))
      if (key.escape) {
        closeDialog()
        return
      }
      if (key.backspace) {
        backspace()
        return
      }
      if (key.leftArrow || key.rightArrow || key.return) {
        // Intentionally not mutating — we only care that these keys
        // arrive on the correct handler (the dialog, not the board).
        // The spike test asserts recordKey received them.
        return
      }
      // Printable ASCII -> insert
      if (input.length === 1) {
        const code = input.charCodeAt(0)
        if (code >= 0x20 && code < 0x7f) {
          insertChar(input)
          return
        }
      }
    },
    [closeDialog, backspace, insertChar],
  )
  useInput(dialogHandler, { isActive: open })

  // ---- View ----
  //
  // Two stacked panels. The dialog is visually distinct (border + >)
  // so cell-level assertions can reach for the border characters to
  // verify it's on screen.
  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" borderStyle="round" padding={1}>
        <Text bold>Board {open ? "" : "(focused)"}</Text>
        {NODES.map((id) => (
          <Text key={id}>
            {cursor === id ? "> " : "  "}
            {id}
          </Text>
        ))}
      </Box>
      {open ? (
        <Box flexDirection="column" borderStyle="round" padding={1}>
          <Text bold>Dialog (focused)</Text>
          <Text>{`> ${query}`}</Text>
          <Text>Esc to close</Text>
        </Box>
      ) : (
        <Text>Press Ctrl+P to open dialog</Text>
      )}
    </Box>
  )
}

// Test-time reference so tests can render without importing the whole
// module via default export.
export const __internals = { NODES }

function keyEventFrom(input: string, key: Key) {
  return {
    input,
    ctrl: !!key.ctrl,
    escape: !!key.escape,
    return: !!key.return,
    leftArrow: !!key.leftArrow,
    rightArrow: !!key.rightArrow,
    backspace: !!key.backspace,
    shift: !!key.shift,
    eventType: key.eventType,
  }
}
