import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AgentSession, SessionStore } from "@km/agent-harness"
import { Box, PopoverProvider, Screen, useExit, useScopeEffect, useTerm } from "silvery"
import { useInput } from "silvery/runtime"
import { CommandBox } from "./components/CommandBox.tsx"
import { HistoryDialog } from "./components/HistoryDialog.tsx"
import { Notifications } from "./components/Notifications.tsx"
import { PaneGrid, type PaneGridHandle } from "./components/PaneGrid.tsx"
import { PermissionInbox } from "./components/PermissionInbox.tsx"
import { useQueue } from "./hooks/use-queue.ts"
import { SidePanel } from "./components/SidePanel.tsx"
import { SlashCommandPalette } from "./components/SlashCommandPalette.tsx"
import { createSilvercodeController, type Controller, type SessionHandle } from "./controller.ts"
import { isLocal } from "./slash-commands.ts"
import { AutolinksProvider } from "./AutolinksContext.tsx"
import { loadAutolinksConfig, type AutolinkRule } from "@km/autolinks"
import {
  findNeighbor,
  type LayoutNode,
  leafIds,
  loadPanes,
  reconcileTree,
  savePanes,
  splitLeaf,
  type SplitDirection,
  swapLeaves,
} from "./pane-layout.ts"

type Layout = "single" | "grid-2" | "grid-4"
type Track = "claude" | "sdk" | "codex"

// Mode → prompt color so the `>` in the command input visibly signals
// what Claude is allowed to do. Same mapping as SidePanel's Mode label.
// Module-scope constant so it's not re-created per render.
// `ask` is grey because it's the most conservative (every tool prompts);
// `auto` is green because it's the unattended default for silvercode.
const MODE_COLOR: Record<string, string> = {
  ask: "$muted",
  plan: "$info",
  "accept-edits": "$purple",
  auto: "$warning",
  bypass: "$error",
}

// Thinking tier → magic keyword that activates Claude's extended-thinking
// budget. Claude Code recognises these as a prefix on the user message;
// there is NO slash-command equivalent. Empty / "normal" → no prefix.
//
// Budget mapping mirrors the docs: `think` ≈ 4K tokens, `think hard` /
// `think harder` ≈ 16K, `ultrathink` ≈ 32K.
const THINKING_KEYWORD: Record<string, string> = {
  think: "think",
  think_hard: "think hard",
  ultrathink: "ultrathink",
}

function injectThinkingKeyword(text: string, thinking: string): string {
  const kw = THINKING_KEYWORD[thinking]
  if (!kw) return text
  // Sentence-leading prefix so Claude's recogniser fires reliably. Two
  // newlines keep the user's actual prompt visually separated in any
  // transcript / replay.
  return `${kw}\n\n${text}`
}

export type AppProps = {
  cwd: string
  model?: string
  resume?: string
  bare: boolean
  layout: Layout
  track: Track
  logDir?: string
  /**
   * Anthropic account name for per-session credential isolation. Resolves to
   * `~/.km/accounts/<account>/` via `CLAUDE_CONFIG_DIR`. Undefined →
   * use `~/.claude/` (v1.1 multi-account foundation).
   */
  account?: string
  /**
   * Test-only: inject a fake session factory so visual tests can drive the
   * full <App/> via ScriptedFakeSession without spawning real subprocesses.
   * Production callers never set this — the controller uses its default
   * spawnClaude / spawnSdk / spawnCodex path. Exposing it on AppProps (not
   * buried in a TestApp wrapper) means visual tests exercise the exact
   * code path a real user hits, minus the subprocess.
   */
  spawnFactory?: (opts: {
    id: string
    name: string
    cwd: string
    model?: string
    resume?: string
    bare: boolean
    account?: string
    track: Track
  }) => AgentSession | Promise<AgentSession>
}

export function App(props: AppProps): React.ReactElement {
  // Load autolink rules once per cwd. Lives in a ref so we don't reload
  // on every render — the file is read synchronously at App mount.
  // Memoizing on `props.cwd` covers the (rare) case where the App is
  // re-mounted with a different working directory.
  const autolinkRules = useMemo<AutolinkRule[]>(() => loadAutolinksConfig(props.cwd), [props.cwd])

  // Ref-backed mirror of `focusedRegion` so the controller can read the
  // latest value without depending on React state. App.tsx owns the
  // useState below; this ref is kept in sync via a one-line effect. The
  // controller calls `getFocusedRegion()` at every turn-end — when it
  // returns "queue", auto-flush is paused so the user's in-progress
  // queue edit isn't yanked mid-edit. See bead
  // km-silvercode.queue-focus-flush-guard.
  const focusedRegionRef = useRef<"queue" | "command">("command")

  const controllerRef = useRef<Controller | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = createSilvercodeController({
      cwd: props.cwd,
      model: props.model,
      resume: props.resume,
      bare: props.bare,
      track: props.track,
      logDir: props.logDir,
      account: props.account,
      initialSessions: props.layout === "grid-4" ? 4 : props.layout === "grid-2" ? 2 : 1,
      spawnFactory: props.spawnFactory,
      getFocusedRegion: () => focusedRegionRef.current,
    })
  }
  const controller = controllerRef.current!

  const [sessions, setSessions] = useState<SessionHandle[]>(controller.snapshot())
  useEffect(() => controller.subscribe((list) => setSessions(list.slice())), [controller])
  const [focusedSessionId, setFocusedSessionId] = useState<string>(() => controller.focusedId())
  useEffect(() => controller.onFocusChange((id) => setFocusedSessionId(id)), [controller])

  const focused = useMemo(
    () => sessions.find((s) => s.id === focusedSessionId) ?? sessions[0],
    [sessions, focusedSessionId],
  )

  const [mode, setMode] = useState<string>("auto")
  const promptColor = MODE_COLOR[mode] ?? "$primary"
  // Thinking mode ("" = none). Set when the user types /think, /think_hard,
  // /ultrathink. Rendered as an optional row in SidePanel's version block.
  const [thinking, setThinking] = useState<string>("")
  const [showInbox, setShowInbox] = useState(false)
  const [showSidePanel, setShowSidePanel] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const paletteQuery = inputValue.startsWith("/") ? inputValue : null

  // Pane management — Ctrl+W chord prefix (vim-window convention) gates
  // pane operations: `Ctrl+W v` (vsplit), `Ctrl+W x` (close), `Ctrl+W z`
  // (zoom toggle). Ctrl+B stays as background-turn (km-silvercode.ctrl-b
  // -background) — picking Ctrl+W avoids that conflict.
  //
  // The chord lives in a state value (not a ref) so the visual hint
  // shown in the side panel can react to its presence. Times out 1500ms
  // after activation so a stale Ctrl+W doesn't trap the next plain
  // keystroke.
  const [chord, setChord] = useState<"ctrl-w" | null>(null)
  useEffect(() => {
    if (!chord) return
    const handle = setTimeout(() => setChord(null), 1500)
    return () => clearTimeout(handle)
  }, [chord])
  const [zoomedPaneId, setZoomedPaneId] = useState<string | null>(null)
  // If the zoomed pane disappears (close), drop zoom so the grid re-renders
  // the remaining panes.
  useEffect(() => {
    if (zoomedPaneId && !sessions.some((s) => s.id === zoomedPaneId)) {
      setZoomedPaneId(null)
    }
  }, [zoomedPaneId, sessions])

  // Pane layout tree — owned by App so Ctrl+W chord handlers can edit it
  // (split / close / focus-cycle in reading order). PaneGrid is the
  // controlled renderer + drag-resize handler.
  //
  // Hydrate from disk on first mount; the v1 → v2 migration in
  // `loadPanes` returns placeholder leaf ids that `reconcileTree`
  // renames to real session ids in left-to-right order.
  const sessionIdsKey = useMemo(() => sessions.map((s) => s.id).join(","), [sessions])
  const [paneTree, setPaneTree] = useState<LayoutNode>(() =>
    reconcileTree(
      loadPanes(props.cwd),
      sessions.map((s) => s.id),
    ),
  )
  // Reconcile when the live session list changes (spawn/close from
  // outside the chord handlers — e.g. `/spawn`, controller-driven).
  useEffect(() => {
    setPaneTree((prev) => {
      const ids = sessions.map((s) => s.id)
      const before = leafIds(prev).join(",")
      const next = reconcileTree(prev, ids)
      const after = leafIds(next).join(",")
      if (before === after) return prev
      savePanes(props.cwd, next)
      return next
    })
  }, [sessionIdsKey, props.cwd, sessions])
  const onTreeChange = useCallback((next: LayoutNode) => setPaneTree(next), [])

  // Imperative handle to PaneGrid so the App-level Escape handler can
  // cancel an in-flight pane drag-move without state-coupling to the
  // grid's internal dragRef.
  const paneGridRef = useRef<PaneGridHandle | null>(null)

  // Ctrl+W H/J/K/L — keyboard-driven pane swap (vim-window convention).
  // Picks the structurally-adjacent leaf in the requested direction via
  // `findNeighbor`, then swaps the two leaves' session ids in the layout
  // tree. Mirrors what a user would do with the mouse drag-move "drop in
  // center" zone, just driven from the keyboard.
  const swapWithNeighbor = useCallback(
    (direction: "left" | "right" | "up" | "down"): void => {
      const focus = focusedSessionId
      if (!focus) return
      const neighbor = findNeighbor(paneTree, focus, direction)
      if (!neighbor) return
      setPaneTree((prev) => {
        const next = swapLeaves(prev, focus, neighbor)
        if (next === prev) return prev
        savePanes(props.cwd, next)
        return next
      })
    },
    [focusedSessionId, paneTree, props.cwd],
  )

  // Ctrl+W v / Ctrl+W s — split the focused pane. The new session is
  // appended to the controller in the usual way; the layout tree gets
  // the focused leaf replaced by a split with the original session +
  // the new one. We have to wait for `spawnSession` to resolve so we
  // know the new session's id before editing the tree.
  const splitFocusedPane = useCallback(
    (direction: SplitDirection): void => {
      const currentFocus = focusedSessionId
      if (!currentFocus) return
      void controller.spawnSession().then((handle) => {
        setPaneTree((prev) => {
          const next = splitLeaf(prev, currentFocus, handle.id, direction)
          savePanes(props.cwd, next)
          return next
        })
        return undefined
      })
    },
    [controller, focusedSessionId, props.cwd],
  )

  // Queue buffer for the currently-focused session. Bound directly to a
  // silvery TextArea in the queue region; edits flow back to the
  // controller. Option B: the queue TextArea is ALWAYS live — focus is
  // just "which TextArea has the cursor" via `focusedRegion`. No "hold"
  // state, no editor-mode toggle.
  //
  // React hooks must be called unconditionally on every render — pass an
  // empty string when `focused` is missing instead of branching the
  // hook call. Otherwise React's hook queue desyncs between renders
  // ("Should have a queue" crash).
  const queueText = useQueue(controller, focused?.id ?? "")
  const [focusedRegion, setFocusedRegion] = useState<"queue" | "command">("command")
  // Mirror focusedRegion into the ref the controller closes over (created
  // once at mount above) so its turn-end auto-flush guard sees the latest
  // value without us having to recreate the controller. Bead
  // km-silvercode.queue-focus-flush-guard.
  useEffect(() => {
    focusedRegionRef.current = focusedRegion
  }, [focusedRegion])
  // When the queue empties while it has focus, snap focus back to the
  // command region — there's nowhere for the cursor to live in the queue.
  useEffect(() => {
    if (queueText.length === 0 && focusedRegion === "queue") setFocusedRegion("command")
  }, [queueText, focusedRegion])

  // Dedupe: when the palette is open and user presses Enter, both the
  // palette's useInput AND TextInput's internal Enter handler fire in the
  // same tick. Guard with a ts ref so the second call is a no-op.
  const lastSubmitAt = useRef<number>(0)
  // Double-Esc detection — Claude Code parity. Two Esc presses within
  // 500ms open the HistoryDialog (rewind/edit history). The first Esc
  // still does its normal thing per the rules in the useInput handler.
  const lastEscapeAt = useRef<number>(0)
  const DOUBLE_ESC_WINDOW_MS = 500
  // Ctrl+D×2 quit — Claude Code parity. First Ctrl+D arms a 1500ms
  // window; a second Ctrl+D inside the window calls requestExit(). Any
  // other key resets the arm so a stale Ctrl+D doesn't trap the next
  // keystroke. silvery's multi-line TextArea (used by CommandBox) does
  // NOT consume Ctrl+D as delete-forward — only useReadline / single-line
  // TextInput do — so the App-level useInput here reliably receives the
  // chord. See bead km-silvercode.ctrl-d-quit.
  const lastCtrlDAt = useRef<number>(0)
  const DOUBLE_CTRL_D_WINDOW_MS = 1500

  function handleSubmit(text: string): void {
    if (!focused) return
    const now = Date.now()
    if (now - lastSubmitAt.current < 50) return
    lastSubmitAt.current = now
    setInputValue("")
    let trimmed = text.trim()
    // Trailing '&' submits + immediately backgrounds (Claude Code parity).
    // Strip the '&' (and any whitespace before it), send the cleaned
    // message, then call backgroundActiveTurn so the turn runs in the
    // background and the UI is freed for next input. Edge case: text is
    // just "&" → no message sent, just background the existing turn (same
    // as Ctrl+B). Slash commands keep their literal '&' if any (rare).
    let backgroundAfterSubmit = false
    if (!trimmed.startsWith("/") && trimmed.endsWith("&")) {
      // Strip the trailing '&' AND any whitespace before it.
      const stripped = trimmed.slice(0, -1).trimEnd()
      if (stripped.length === 0) {
        // "&" alone → background the existing turn, no send.
        controller.backgroundActiveTurn(focused.id)
        return
      }
      trimmed = stripped
      backgroundAfterSubmit = true
    }
    if (trimmed.startsWith("/")) {
      const [cmd, ...rest] = trimmed.split(/\s+/)
      const arg = rest.join(" ")
      if (isLocal(cmd ?? "")) {
        switch (cmd) {
          case "/inbox":
            return setShowInbox(true)
          case "/history":
            return setShowHistory(true)
          case "/todos":
          case "/panel":
          case "/aside":
            return setShowSidePanel((v) => !v)
          case "/mode": {
            const modes = ["ask", "plan", "accept-edits", "auto", "bypass"]
            const target = modes.includes(arg) ? arg : modes[(modes.indexOf(mode) + 1) % modes.length]!
            setMode(target)
            return
          }
          // Thinking tier — silvercode-local only. Claude Code activates
          // extended thinking via MAGIC KEYWORDS in the user message body
          // (`think` / `think hard` / `ultrathink`); these slash commands
          // are NOT real Claude commands. We just set the local tier and
          // injectThinkingKeyword() prepends the keyword to the next
          // outgoing user message.
          case "/think":
            setThinking("think")
            return
          case "/think_hard":
            setThinking("think_hard")
            return
          case "/ultrathink":
            setThinking("ultrathink")
            return
          case "/handoff": {
            const otherId = sessions.find((s) => s.id !== focused.id)?.id
            if (otherId) controller.handoff(focused.id, otherId, arg)
            return
          }
          case "/fork":
            void controller.fork(focused.id)
            return
          case "/spawn":
            void controller.spawnSession(arg || undefined)
            return
        }
      } else {
        controller.runSlashCommand(focused.id, trimmed)
      }
    } else {
      controller.send(focused.id, injectThinkingKeyword(trimmed, thinking))
    }
    // '&' suffix → after-send background. Wait a microtask so the send
    // has registered as the active turn before we try to background it.
    // Idempotent + no-op when there's no active turn yet (e.g. send was
    // queued mid-turn) — the controller checks status internally.
    if (backgroundAfterSubmit) {
      const sid = focused.id
      void Promise.resolve().then(() => controller.backgroundActiveTurn(sid))
    }
  }

  // Ctrl key choices avoid ASCII control-code aliases (Ctrl+I = Tab, Ctrl+M =
  // Enter, Ctrl+H = Backspace, Ctrl+J = LineFeed, Ctrl+[ = Esc). Terminals
  // translate those before silvery ever sees them, so they're unreachable
  // outside Kitty disambiguation mode. These letters are safe across all
  // terminals: E / Y / R / N. Slash commands (/inbox, /history, /todos,
  // /mode) are the canonical surface — the Ctrl pairs are shortcuts.
  //
  useInput(
    (input, key) => {
      // Ctrl+D×2 quit — runs FIRST so the chord can't be eaten by other
      // bindings. First press arms a 1500ms window; second press inside
      // the window calls requestExit(). Any other key (handled below)
      // implicitly resets the arm via the `else` branch at the end of
      // this handler. Ctrl+D inside the window short-circuits all other
      // bindings — by the time the user is exiting, intermediate
      // bindings shouldn't fire.
      if (key.ctrl && input === "d") {
        const now = Date.now()
        const sinceLast = now - lastCtrlDAt.current
        if (sinceLast > 0 && sinceLast < DOUBLE_CTRL_D_WINDOW_MS) {
          lastCtrlDAt.current = 0
          requestExit()
          return
        }
        lastCtrlDAt.current = now
        return
      }
      // Any non-Ctrl+D keystroke resets the arm so a stale Ctrl+D from
      // a minute ago doesn't trap the next Ctrl+D into "I meant to exit".
      // Modifier-only events (Shift held, etc.) reach useInput as
      // `input === ""`; treat them as "no key" and don't reset the arm.
      if (lastCtrlDAt.current !== 0 && input.length > 0) {
        lastCtrlDAt.current = 0
      }
      // Escape cancels an in-flight pane drag-move first — highest
      // priority because dropping the drag silently on next mousemove
      // would be confusing. PaneGrid's imperative handle returns true
      // if there was a drag to cancel; we stop further Escape handling
      // in that case.
      if (key.escape && paneGridRef.current?.cancelDrag()) {
        return
      }
      if (key.escape && (showInbox || showHistory)) {
        setShowInbox(false)
        setShowHistory(false)
        return
      }
      // Double-Esc within 500ms → open HistoryDialog (Claude Code parity).
      // We check this BEFORE the other Esc branches so a rapid
      // Esc-Esc reliably opens the dialog, even when the first Esc would
      // also have done something (e.g. restored a queue head). The first
      // Esc still does its normal thing — that's expected; double-Esc is
      // an additive gesture.
      if (key.escape) {
        const now = Date.now()
        const sinceLast = now - lastEscapeAt.current
        if (sinceLast > 0 && sinceLast < DOUBLE_ESC_WINDOW_MS) {
          lastEscapeAt.current = 0
          setShowHistory(true)
          return
        }
        lastEscapeAt.current = now
      }
      // Esc during an in-flight turn → interrupt the active turn (Claude
      // Code parity). Forces UI to idle and emits a system message
      // marking the interrupt. v1 cannot abort the underlying subprocess
      // turn surgically (tracked upstream in km-agent-harness.per-turn-abort)
      // — subsequent stream chunks are dropped instead.
      if (key.escape && focused) {
        const status = focused.store.state.get().status
        const inFlight = status !== "idle" && status !== "ended"
        if (inFlight && focusedRegion === "command" && inputValue.length === 0) {
          controller.interruptActiveTurn(focused.id)
          return
        }
      }
      // Esc on empty command input with non-empty queue → restore the
      // queue HEAD to the input box (Claude Code parity). Replaces the
      // older "clearQueue" behavior — letting the user edit the most
      // recently-queued draft is far more useful than discarding it
      // outright. The rest of the queue stays in place.
      if (key.escape && focusedRegion === "command" && inputValue.length === 0 && focused && queueText.length > 0) {
        const head = controller.popQueueHead(focused.id)
        if (head.length > 0) setInputValue(head)
        return
      }
      // Shift+Tab cycles permission modes. index.tsx passes
      // `handleTabCycling: false` to run() so silvery's focus system
      // doesn't consume the key before it reaches us.
      if (key.shift && key.tab) {
        cycleMode()
        return
      }
      // Cursor-boundary handoff between command and queue is handled by
      // CommandBox's own `onEdge` callbacks on the silvery TextAreas —
      // no parent-side Up/Down intercept needed.
      // Ctrl+E toggles the permission inbox — but only when there's no
      // text to navigate to the end of. With non-empty input we let the
      // keypress fall through to silvery TextArea's readline binding
      // (Ctrl+E = move cursor to end-of-line), the cross-platform
      // expectation. To open the inbox while typing, clear the buffer
      // first or use the `/inbox` slash command.
      if (key.ctrl && input === "e" && (inputValue.length === 0 || focusedRegion !== "command")) {
        setShowInbox((v) => !v)
        return
      }
      // Ctrl-B — background the in-flight turn for the focused session.
      // No-op if there's no active turn (controller checks status). Frees
      // the UI immediately so the user can keep typing while the turn
      // keeps streaming in the background; the eventual result surfaces
      // as a system message in the conversation.
      if (key.ctrl && input === "b") {
        if (focused) controller.backgroundActiveTurn(focused.id)
        return
      }
      // Side panel toggle — Ctrl+O (safe across terminals; Cmd+I was tried
      // but gets intercepted by cmux / most terminal multiplexers before
      // reaching the app). Slash commands /panel, /aside, /todos are the
      // canonical surface.
      if (key.ctrl && input === "o") {
        setShowSidePanel((v) => !v)
        return
      }
      if (key.ctrl && input === "y") {
        setShowSidePanel((v) => !v)
        return
      }
      if (key.ctrl && input === "r") {
        setShowHistory((v) => !v)
        return
      }
      // Ctrl+W — pane chord prefix (vim-window). The next non-modifier
      // keypress within the timeout selects an action. We consume the
      // Ctrl+W itself + the follow-up so neither leaks into TextInput.
      // Resolving the chord follow-up has to come BEFORE the Ctrl+N
      // session cycler so that e.g. `Ctrl+W` then `n` doesn't get
      // intercepted as "next session" (currently we don't bind a chord
      // for `n`, but the order keeps the slot reserved).
      if (chord === "ctrl-w") {
        // Any keypress in chord state consumes the chord — even an
        // unrecognised one — so we don't accidentally swallow the user's
        // next real keystroke after a typo.
        setChord(null)
        if (input === "v") {
          // Vertical split — focused leaf becomes a row-split with the
          // new session as its right sibling.
          splitFocusedPane("row")
          return
        }
        if (input === "s") {
          // Horizontal split — focused leaf becomes a column-split with
          // the new session as its bottom sibling.
          splitFocusedPane("column")
          return
        }
        if (input === "x") {
          // Close the focused pane. v1 reuses the existing exit path when
          // closing the last pane (matches Ctrl+D×2 semantics) and the
          // controller's per-session close otherwise. The closeAll() path
          // is the canonical shutdown for a single-pane window — the
          // controller has no per-session close API today, so a single
          // pane's `x` is best-effort: it just clears the current focus.
          if (focused && sessions.length > 1) {
            // No per-session close API on the controller (yet); send the
            // SDK-level close + drop the handle from the visible list by
            // moving focus to a sibling. The orphaned subprocess shuts
            // down via the same SIGTERM path that closeAll uses.
            focused.session.close()
            focused.unsubscribe()
            const idx = sessions.findIndex((s) => s.id === focused.id)
            const next = sessions[(idx + 1) % sessions.length]
            if (next && next.id !== focused.id) controller.focus(next.id)
          }
          return
        }
        if (input === "z") {
          // Zoom toggle — when on, PaneGrid renders only the focused pane.
          setZoomedPaneId((cur) => (cur ? null : (focused?.id ?? null)))
          return
        }
        // Ctrl+W H/J/K/L — vim-style swap with neighbor in direction.
        // Uppercase form is the canonical "swap" gesture (lowercase
        // h/j/k/l would be "navigate to neighbor" in tmux/vim, but
        // silvercode already uses Ctrl+N for cycle and the focus model
        // is the active-pane bar, not a separate cursor). We accept
        // both upper and lowercase to match user muscle memory.
        if (input === "H" || input === "h") {
          swapWithNeighbor("left")
          return
        }
        if (input === "J" || input === "j") {
          swapWithNeighbor("down")
          return
        }
        if (input === "K" || input === "k") {
          swapWithNeighbor("up")
          return
        }
        if (input === "L" || input === "l") {
          swapWithNeighbor("right")
          return
        }
        return
      }
      if (key.ctrl && input === "w") {
        setChord("ctrl-w")
        return
      }
      // Ctrl+N cycles sessions in left-to-right reading order — i.e.
      // the order the panes appear on screen, which for a 2D tree is
      // the leaf order from the layout, NOT the controller's creation
      // order. Falls back to the session list if the tree disagrees
      // (e.g. mid-reconcile transient).
      if (key.ctrl && input === "n" && sessions.length > 1) {
        const order = leafIds(paneTree).filter((id) => sessions.some((s) => s.id === id))
        const list = order.length > 0 ? order : sessions.map((s) => s.id)
        const idx = list.indexOf(focusedSessionId)
        const next = list[(idx + 1) % list.length]
        if (next) controller.focus(next)
        return
      }
    },
    { isActive: true },
  )

  // Pane layout is owned by <PaneGrid> — it persists per-pane weights to
  // `<cwd>/.km/panes.json` and renders one 1-col `│` divider per
  // gap (NOT a border around each pane, per the chrome constraint in
  // bead km-silvercode.pane-management). The active-pane indicator is a
  // 1-col accent bar inside SessionCard's left edge.

  // Clean exit: close all sessions first so the child claude subprocesses
  // terminate, THEN let silvery restore the terminal. process.exit is still
  // banned inside the silvery app. Without this, Ctrl+D×2 restores the
  // terminal but leaves orphaned claude subprocesses keeping the host
  // process alive.
  const silveryExit = useExit()

  // Resumable session ids, kept fresh on every session change. We read from
  // a ref (not props/state) because the `process.on('exit')` handler below
  // fires during Node's final teardown, long after React has torn down — we
  // need stale-free data at that moment without depending on closures.
  const resumeIdsRef = useRef<string[]>([])
  useEffect(() => {
    resumeIdsRef.current = sessions
      .map((h) => h.session.sessionId)
      .filter((sid): sid is string => typeof sid === "string" && sid !== "pending")
  }, [sessions])

  // Print the resume hint via `process.on('exit')` — the very last thing
  // Node runs before the process dies. This places the write AFTER silvery's
  // teardown (which emits 3J/2J to wipe scrollback), AFTER any queued stderr
  // drain, so the hint survives in the user's real scrollback.
  //
  // Previously printed inline after silveryExit(), but silvery's teardown
  // was landing scrollback-wiping sequences after our write, erasing the
  // hint. `term.signals.on('exit', …)` is synchronous and guaranteed last
  // (Signals runs at topologically-sorted exit ordering), so nothing can
  // overwrite us.
  //
  // Uses silvery's `term.signals.on` rather than raw `process.on("exit",
  // …)` — check-no-raw-lifecycle.sh gates the latter. The returned
  // Disposable is NOT unregistered on React unmount: silvery's exit path
  // unmounts React BEFORE the process dies (via `useExit` → `useDispose`),
  // so if we disposed on unmount the listener would be gone before the
  // exit event runs. Term's signal registry is process-lifetime; it's
  // reaped when the process dies.
  const term = useTerm()
  useEffect(() => {
    function printHintsNow(): void {
      const hints = resumeIdsRef.current
      if (hints.length === 0) return
      const lines = hints.map((sid) => `  silvercode --resume ${sid}`)
      process.stderr.write(
        `\nResume ${hints.length === 1 ? "this session" : "one of these sessions"} with:\n${lines.join("\n")}\n\n`,
      )
    }
    term.signals.on("exit", printHintsNow)
    // No cleanup — see comment above.
  }, [term])

  function requestExit(): void {
    // controller.closeAll() SIGTERMs every child synchronously; silveryExit
    // restores the terminal. The resume hint prints via the process.on('exit')
    // handler above — guaranteed last, so silvery's scrollback-wipe can't
    // clobber it.
    try {
      controller.closeAll()
    } catch {
      /* best-effort — still exit */
    }
    silveryExit()
  }

  // silvery owns the exit lifecycle. `useScopeEffect` registers the
  // controller cleanup on a child of the app's root scope — when the
  // component unmounts (or when SIGINT/SIGTERM disposes the root via the
  // runtime's `withScope` wiring), the deferred callback runs exactly
  // once. This replaces the older `useDispose` shortcut and is the
  // canonical form per `hub/silvery/design/lifecycle-scope.md`.
  useScopeEffect(
    (scope) => {
      scope.defer(() => controller.closeAll())
    },
    [controller],
  )

  // Mode cycler used by the side panel's ⚡ label. Memoized so passing
  // it to SidePanel doesn't force a new prop identity every render.
  const cycleMode = useCallback((): void => {
    setMode((m) => {
      const modes = ["ask", "plan", "accept-edits", "auto", "bypass"]
      return modes[(modes.indexOf(m) + 1) % modes.length]!
    })
  }, [])

  // Thinking cycler: normal → think → think_hard → ultrathink → normal.
  // Also emits the matching slash command to Claude so the budget actually
  // applies on the next turn. `""` stored = "normal" (baseline).
  const cycleThinking = useCallback((): void => {
    setThinking((t) => {
      const tiers = ["normal", "think", "think_hard", "ultrathink"]
      const current = t && tiers.includes(t) ? t : "normal"
      const next = tiers[(tiers.indexOf(current) + 1) % tiers.length]!
      if (focused && next !== "normal") {
        controller.runSlashCommand(focused.id, `/${next}`)
      }
      return next === "normal" ? "" : next
    })
  }, [controller, focused])

  return (
    <AutolinksProvider rules={autolinkRules}>
      <PopoverProvider>
        {/*
        Layout (opencode-style):

          ┌──────────────────────────────┬────────────┐
          │                              │            │
          │          cards area          │  side      │
          │                              │  panel     │
          │──────────────────────────────┤  (full     │
          │       command input          │  height)   │
          │                              │            │
          └──────────────────────────────┴────────────┘

        Side panel spans top to bottom on the right. Left column =
        cards (flexGrow=1) + command input at the bottom. No borders on
        any region — separation is via background color. All status /
        version / cost metadata lives in the side panel's bottom block,
        so the StatusLine at the very bottom is gone.
      */}
        <Screen flexDirection="row">
          {/* LEFT: cards + overlays + palette + input. The outer column has
            `overflow="hidden"` — this is the "cards region vs side panel"
            boundary. CSS spec §4.5 elevates flexShrink on the overflow
            container itself, so any wide descendant is clipped here
            instead of pushing the side panel off-screen.
            silvery-expert audit (session 2026-04-24): silvery's reconciler
            never calls setFlexShrink when unspecified, so flexily defaults
            to shrink=0 — `minWidth={0}` alone does nothing without an
            overflow boundary in the chain. */}
          <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
            <PaneGrid
              ref={paneGridRef}
              sessions={sessions}
              focusedSessionId={focusedSessionId}
              zoomedPaneId={zoomedPaneId}
              tree={paneTree}
              onTreeChange={onTreeChange}
              cwd={props.cwd}
              onFocusSession={(id) => controller.focus(id)}
              onApprovePermission={(sid, rid) => controller.respondPermission(sid, rid, true)}
              onDenyPermission={(sid, rid) => controller.respondPermission(sid, rid, false)}
            />

            {/* Bottom chrome (left column). flexShrink=0 prevents overflow. */}
            <Box flexDirection="column" flexShrink={0}>
              {showInbox && (
                <PermissionInbox
                  sessions={sessions}
                  onApprove={(sid, rid) => controller.respondPermission(sid, rid, true)}
                  onDeny={(sid, rid) => controller.respondPermission(sid, rid, false)}
                  onClose={() => setShowInbox(false)}
                />
              )}
              {showHistory && <HistoryDialog onClose={() => setShowHistory(false)} logDir={props.logDir} />}
              <Notifications sessions={sessions} />

              {paletteQuery !== null && (
                <SlashCommandPalette
                  query={paletteQuery}
                  remoteCommands={focused?.store.state.get().slashCommands}
                  remoteSkills={focused?.store.state.get().skills}
                  onSubmit={(cmd) => handleSubmit(cmd)}
                  onClose={() => setInputValue("")}
                />
              )}

              {/* Unified CommandBox — queue area (when non-empty) stacks on
                top of the command input inside one filled surface with a
                horizontal rule between them. Exactly one cursor is visible
                at a time; focused side is bright, unfocused side dims to
                $fg-muted. Claude-Code-style. */}
              <Box paddingX={2} paddingY={1} flexShrink={0} flexDirection="row">
                <Box flexGrow={1} flexDirection="column">
                  {focused && (
                    <CommandBox
                      queueText={queueText}
                      onQueueChange={(t) => controller.setQueuedText(focused.id, t)}
                      onQueueSubmit={() => {
                        // Force-flush the queue NOW (Enter in queue region).
                        // After flush, queue is empty so focusedRegion's
                        // empty-snap effect moves cursor back to command.
                        controller.flushQueue(focused.id)
                        setFocusedRegion("command")
                      }}
                      focusedRegion={focusedRegion}
                      onFocusRegion={setFocusedRegion}
                      inputValue={inputValue}
                      onInputChange={setInputValue}
                      inputDisabled={!focused}
                      onSubmit={handleSubmit}
                      onExit={requestExit}
                      promptColor={promptColor}
                    />
                  )}
                </Box>
              </Box>
            </Box>
          </Box>

          {/* RIGHT: full-height side panel. Same bg token as the command input
            so the chrome reads as a single unified surface — opencode uses
            the same trick. */}
          {showSidePanel && focused && (
            <Box flexShrink={0} flexBasis={40} flexDirection="column" backgroundColor="$bg-surface-subtle">
              <SidePanel
                focused={focused}
                sessions={sessions}
                focusedSessionId={focusedSessionId}
                onFocusSession={(id) => controller.focus(id)}
                mode={mode}
                onCycleMode={cycleMode}
                thinking={thinking}
                onCycleThinking={cycleThinking}
                cwd={props.cwd}
                controller={controller}
              />
            </Box>
          )}
        </Screen>
      </PopoverProvider>
    </AutolinksProvider>
  )
}
