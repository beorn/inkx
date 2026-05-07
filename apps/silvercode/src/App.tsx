import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { createLogger } from "loggily"
import type { AgentSession, MessageEntry, SessionStore } from "@km/agent-harness"

const appStartupLog = createLogger("silvercode:startup")
const appBootT0 = (globalThis as { __SILVERCODE_BOOT_T0?: number }).__SILVERCODE_BOOT_T0 ?? Date.now()
function appStartupTick(label: string, extra?: Record<string, unknown>): void {
  appStartupLog.info?.(label, { elapsedMs: Date.now() - appBootT0, ...extra })
}
appStartupTick("App.tsx:moduleEvaluated")
import {
  Box,
  ChainAppContext,
  type ListViewHandle,
  PopoverProvider,
  Screen,
  Text,
  useExit,
  useScopeEffect,
  useTerm,
} from "silvery"
import { spawn as nodeSpawn } from "node:child_process"
import { AsideLayout } from "./components/AsideLayout.tsx"
import { useResponsiveDisclosure } from "./hooks/useResponsiveDisclosure.ts"
import { useInput } from "silvery/runtime"
import { SessionPromptComposer } from "./components/SessionPromptComposer.tsx"
import { formatLoadingSessionId } from "./components/Welcome.tsx"
import { SessionPromptHistory } from "./components/SessionPromptHistory.tsx"
import { Notifications } from "./components/Notifications.tsx"
import { PaneGrid, type PaneGridHandle } from "./components/PaneGrid.tsx"
import { InlinePermissionPrompt } from "./components/InlinePermissionPrompt.tsx"
import { InlineAskUserQuestionPrompt } from "./components/InlineAskUserQuestionPrompt.tsx"
import { useQueue } from "./hooks/use-queue.ts"
import { SidePanel } from "./components/SidePanel.tsx"
import { prefixSid } from "./sid-prefix.ts"
import { BUILTIN_AGENTS } from "./config-schema.ts"
import { adjacentCapabilityOption, type CapabilityDirection } from "./agent-capabilities.ts"
import { AvailableCommandsPalette } from "./components/AvailableCommandsPalette.tsx"
import { Content } from "./components/Content.tsx"
import { createSilvercodeController, type Controller, type SessionHandle } from "./controller.ts"
import { isLocal } from "./slash-commands.ts"
import { AutolinksProvider } from "./AutolinksContext.tsx"
import { CwdProvider } from "./CwdContext.tsx"
import { loadAutolinksConfig, type AutolinkRule } from "@km/autolinks"
import {
  findNeighbor,
  freshPlaceholderId,
  type LayoutNode,
  leafIds,
  loadPanes,
  reconcileTree,
  removeLeaf,
  renameLeaf,
  savePanes,
  splitLeaf,
  type SplitDirection,
  swapLeaves,
} from "./pane-layout.ts"

type Layout = "single" | "grid-2" | "grid-4"

// SessionUpdateList Shift+PageUp / Shift+PageDown step size (rows). 10 rows
// matches roughly half a typical chat-pane viewport — large enough to
// traverse history quickly, small enough that one PageUp doesn't
// overshoot the user's reading position. ListView has no exposed
// viewport-row count, so we use a constant rather than computing it
// from the (currently-private) trackHeight.
const MESSAGE_LIST_PAGE_STEP = 10

// Side panel column count when rendered (inline or overlay).
const SIDE_PANEL_WIDTH = 32
// Below md there is not enough room for a 40-col overlay without making
// the main chat unusably narrow. Manual /panel still works at md-lg as an
// overlay, and lg+ opens inline by default.
const SIDE_PANEL_OVERLAY_MIN_COLS = 90

function hasConversationContent(messages: readonly MessageEntry[]): boolean {
  return messages.some((m) => {
    if (m.text.trim().length > 0) return true
    return m.ops.some((op) => {
      if (op.kind === "text" || op.kind === "thinking") return op.text.trim().length > 0
      return true
    })
  })
}

// Side panel responsive policy:
//   - cols >= lg (120): panel auto-open, inline as a 40-col gutter beside
//     the message area (leaves ≥80 cols for code/prose — comfortable).
//   - cols <  lg (120): panel hidden by default. Manual /panel or Ctrl+O
//     opens it as an absolute-positioned overlay on top of the message
//     area (right-anchored, full-height — opencode pattern).
//
// Manual override pins for the rest of the session — auto-open only
// applies if the user hasn't expressed a preference yet. Driven through
// silvery's `useResponsiveValue` (xs=30/sm=60/md=90/lg=120/xl=150) via the
// silvercode-local `useResponsiveDisclosure` hook.

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

function isOptionModifier(key: { meta?: boolean; alt?: boolean }): boolean {
  // In silvery's Key shape, `meta` is terminal Alt/Option. Some lower-level
  // chain events still call it `alt`, so accept both names at the app edge.
  return key.meta === true || key.alt === true
}

/**
 * Format the resume hint shown on quit. Pure function so tests can pin
 * the output shape without driving the silvery teardown path. See the
 * useEffect that registers `printHintsNow` for invocation rules and the
 * bead `km-silvercode.resume-hint-not-shown` for context.
 *
 * Three cases:
 *   - One or more real session ids → invite the user to `--resume <sid>`.
 *   - One or more sessions exist but ALL are still "pending" (Claude
 *     never reached session-init) → explain why no resume is on offer.
 *   - Empty list (no sessions at all) → bare confirmation that we exited.
 *
 * The leading + trailing blank lines push the hint into the user's
 * scrollback after silvery's terminal teardown — the prompt that follows
 * lands on its own row instead of butting against our last line.
 */
export function formatResumeHint(sessionIds: ReadonlyArray<string>): string {
  const realIds = sessionIds.filter((sid) => sid !== "pending")
  const lines: string[] = ["\n"]
  if (realIds.length > 0) {
    lines.push(`Resume ${realIds.length === 1 ? "this session" : "one of these sessions"} with:\n`)
    for (const sid of realIds) lines.push(`  silvercode --resume ${sid}\n`)
  } else if (sessionIds.length > 0) {
    lines.push(
      "silvercode: no resumable sessions — Claude didn't reach session-init. Send a turn before quitting to enable --resume.\n",
    )
  } else {
    lines.push("silvercode: exited.\n")
  }
  lines.push("\n")
  return lines.join("")
}

/**
 * SilvercodeLinkOpener — single subscriber for silvery `link:open` events.
 *
 * silvery's `<Link href={...}>` component emits OSC 8 escapes around its
 * children AND fires `link:open` on the chain event bus when armed-clicked
 * (Cmd+click). Two delivery paths:
 *
 *   1. **Terminal-side (preferred).** OSC-8-aware terminals (Ghostty, Kitty,
 *      iTerm2) intercept Cmd-click on the OSC 8 hyperlink range and route
 *      the URI directly through their own opener (LaunchServices on macOS).
 *      The click never reaches silvery; this component never fires.
 *   2. **App-side fallback.** Terminals that don't recognize OSC 8 still
 *      pass the click to silvery's mouse-event router; `<Link>`'s armed
 *      handler emits `link:open` on the chain bus. We catch it here and
 *      shell out to `open` so the same href ends up routed by macOS
 *      LaunchServices regardless of terminal.
 *
 * In-app schemes (`bd://`, `km://`) skip the OSC 8 path in
 * `LinkifiedText.hrefFor` (they render as plain `<Text underline onClick>`
 * with a popover preview), so this opener only ever sees terminal-routable
 * URIs (`file://`, `http(s)://`, autolink-rule resolves_to targets).
 */
function SilvercodeLinkOpener(): null {
  const chain = React.useContext(ChainAppContext)
  React.useEffect(() => {
    if (!chain) return undefined
    const off = chain.events.on("link:open", (...args: unknown[]) => {
      const href = args[0]
      if (typeof href !== "string" || href.length === 0) return
      try {
        // macOS `open <uri>` routes via LaunchServices — same path Ghostty
        // takes for OSC 8. Detached + ignored stdio so the child outlives
        // any pipe handle on this side.
        const child = nodeSpawn("open", [href], { stdio: "ignore", detached: true })
        child.on("error", () => {
          /* opener failed; nothing useful to surface here */
        })
        child.unref()
      } catch {
        /* swallow — link:open is fire-and-forget */
      }
    })
    return off
  }, [chain])
  return null
}

export type AppProps = {
  cwd: string
  model?: string
  resume?: string
  bare: boolean
  layout: Layout
  /**
   * Canonical agent id from BUILTIN_AGENTS — drives both UI (SidePanel
   * branding + capabilities lookup) and controller dispatch. Values:
   *   - claude-code / claude-code-spawn / claude-code-sdk
   *   - codex / codex-spawn
   *   - gemini / copilot / pi-acp
   *   - any free-form id from `ai.acp.<name>` config entries
   * Undefined falls back to the legacy spawnClaude path.
   */
  agent?: string
  logDir?: string
  /**
   * Anthropic account name for per-session credential isolation. Resolves to
   * `~/.config/claude-profiles/<account>/` via `CLAUDE_CONFIG_DIR`. Undefined →
   * use `~/.claude/` (v1.1 multi-account foundation).
   */
  account?: string
  /**
   * v2 opt-in chrome (km-silvercode.pane-headers). When true, every
   * pane gets a Zellij-style 1-row header row with title + drag /
   * split / minimize / close buttons. Default false preserves v1's
   * chrome-minimal contract (km-silvercode.pane-management). Wired to
   * `--pane-headers` in `index.tsx`.
   */
  paneHeaders?: boolean
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
    agent?: string
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

  // First-commit marker — fires once after React commits the initial
  // App tree. The gap between `run:resolved` and this tick is silvery's
  // alt-screen entry + the first paint cycle.
  useEffect(() => {
    appStartupTick("App:firstCommit")
  }, [])

  const controllerRef = useRef<Controller | null>(null)
  if (!controllerRef.current) {
    appStartupTick("App:firstRender:beforeControllerCreate")
    controllerRef.current = createSilvercodeController({
      cwd: props.cwd,
      model: props.model,
      resume: props.resume,
      bare: props.bare,
      agent: props.agent,
      logDir: props.logDir,
      account: props.account,
      initialSessions: props.layout === "grid-4" ? 4 : props.layout === "grid-2" ? 2 : 1,
      spawnFactory: props.spawnFactory,
      getFocusedRegion: () => focusedRegionRef.current,
    })
    appStartupTick("App:firstRender:afterControllerCreate")
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- set above on first render
  const controller = controllerRef.current!

  const [sessions, setSessions] = useState<SessionHandle[]>(controller.snapshot())
  useEffect(() => controller.subscribe((list) => setSessions(list.slice())), [controller])
  const [focusedSessionId, setFocusedSessionId] = useState<string>(() => controller.focusedId())
  useEffect(() => controller.onFocusChange((id) => setFocusedSessionId(id)), [controller])
  // Surface controller-level spawn errors as a visible banner so the user
  // isn't stuck staring at a blank UI when the agent connection drops or
  // the configured agent fails to launch. Stderr writes alone are hidden
  // behind alt-screen. Bead: km-silvercode.spawn-error-blank-screen.
  const [spawnError, setSpawnErrorState] = useState<string | null>(() => controller.lastSpawnError())
  useEffect(() => controller.onSpawnError((msg) => setSpawnErrorState(msg)), [controller])

  const focused = useMemo(
    () => sessions.find((s) => s.id === focusedSessionId) ?? sessions[0],
    [sessions, focusedSessionId],
  )

  const [mode, setMode] = useState<string>("auto")
  const promptColor = MODE_COLOR[mode] ?? "$primary"
  // Thinking mode ("" = none). Set when the user types /think, /think_hard,
  // /ultrathink. Rendered as an optional row in SidePanel's version block.
  const [thinking, setThinking] = useState<string>("")

  // Pending-permission count across all sessions, kept in sync via per-store
  // subscriptions. Bumps on every state.apply() so the composer is disabled
  // while a permission is pending — in-flight keystrokes cannot accidentally
  // answer the inline prompt.
  const [pendingPermissions, setPendingPermissions] = useState(0)
  // Pending-question count (AskUserQuestion overlays). Same disable-composer
  // discipline as pendingPermissions — keystrokes mustn't bleed into the
  // picker. Bead: km-silvercode.askuserquestion-implement.
  const [pendingQuestions, setPendingQuestions] = useState(0)
  useEffect(() => {
    let cancelled = false
    const recompute = () => {
      if (cancelled) return
      let total = 0
      let totalQ = 0
      for (const s of sessions) {
        const st = s.store.state.get()
        total += st.permissions.length
        if (st.pendingQuestion) totalQ += 1
      }
      setPendingPermissions(total)
      setPendingQuestions(totalQ)
    }
    recompute()
    const unsubs = sessions.map((s) => s.store.state.subscribe(recompute))
    return () => {
      cancelled = true
      for (const u of unsubs) u()
    }
  }, [sessions])

  // Side panel disclosure — auto-default driven by viewport breakpoint;
  // manual toggle pins for the session (Ctrl+O / Ctrl+Y / /panel / /aside / /todos).
  // Auto-default: open at lg (120 cols) and above; closed below.
  const panel = useResponsiveDisclosure({
    defaultOpen: (zone) => zone === "lg" || zone === "xl",
  })
  // AsideLayout auto-decides row-vs-column from breakpoint="lg". Caller's
  // job is presence: don't render the panel at all on tiny terminals where
  // even the stacked-column variant would overwhelm the chat region.
  const viewportCols = useTerm((t) => t.size.cols())
  const showSidePanel = panel.open && (viewportCols === 0 || viewportCols >= SIDE_PANEL_OVERLAY_MIN_COLS)
  const togglePanel = panel.toggle

  const [showHistory, setShowHistory] = useState(false)
  // `/raw` slash command toggles a debug view that inlines each user
  // message's `additionalContext` (system-reminders, hook output,
  // isMeta entries — everything stripped from the visible chat surface
  // for readability). When false, only a chip "▸ N hidden lines" shows
  // beneath messages that have hidden context. Bead:
  // km-silvercode.resume-show-everything-collapsed.
  const [showDebug, setShowDebug] = useState(false)
  const [inputValue, setInputValue] = useState("")
  // Mirror inputValue into a ref so the App-level input handler can
  // capture the pre-chord value synchronously. Without this, when the
  // user presses `Ctrl+G v`, TextArea consumes the `v` BEFORE App's
  // useInput sees it (silvery fires all useInput handlers per
  // registration order — there's no priority), so we'd be left with
  // `v` stuck in the input. We snapshot the value before Ctrl+G fires
  // (in the chord branch) and restore it after the chord resolves.
  const inputValueRef = useRef("")
  useEffect(() => {
    inputValueRef.current = inputValue
  }, [inputValue])
  const preChordInputRef = useRef<string | null>(null)
  const paletteQuery = inputValue.startsWith("/") ? inputValue : null

  // Pane management — Ctrl+G chord prefix gates pane operations:
  // `Ctrl+G v` (vsplit), `Ctrl+G s` (hsplit), `Ctrl+G x` (close),
  // `Ctrl+G z` (zoom toggle), `Ctrl+G h/j/k/l` (swap with neighbor).
  //
  // Why Ctrl+G (not Ctrl+W as vim convention would suggest): silvery's
  // TextArea + useReadline consume Ctrl+W as readline word-delete-
  // backwards (vendor/silvery/packages/ag-react/src/hooks/readline-ops.ts
  // line 131) BEFORE App-level useInput sees it. Since the SessionPromptComposer
  // owns focus by default, Ctrl+W never reaches this handler. Ctrl+G is
  // not consumed by readline-ops or useTextArea, so it leaks through to
  // the App-level useInput cleanly. "G" mnemonic = grid management.
  // Bead: km-silvercode.ctrl-w-blocked-by-textarea.
  //
  // The chord lives in a state value so the visual hint shown in the side
  // panel can react to its presence. We ALSO mirror it into a ref because
  // the input handler reads it synchronously — without the ref, React
  // batching means the closure captured by the next keystroke handler
  // sees the previous (null) value, so `Ctrl+G` followed quickly by `v`
  // never resolves the chord. Times out 1500ms after activation so a
  // stale Ctrl+G doesn't trap the next plain keystroke. Bead:
  // km-silvercode.ctrl-g-chord-state-stale.
  const [chord, setChord] = useState<"ctrl-g" | null>(null)
  const chordRef = useRef<"ctrl-g" | null>(null)
  const setChordBoth = useCallback((next: "ctrl-g" | null): void => {
    chordRef.current = next
    setChord(next)
  }, [])
  useEffect(() => {
    if (!chord) return
    const handle = setTimeout(() => {
      preChordInputRef.current = null
      setChordBoth(null)
    }, 1500)
    return () => clearTimeout(handle)
  }, [chord, setChordBoth])
  const [zoomedPaneId, setZoomedPaneId] = useState<string | null>(null)
  // If the zoomed pane disappears (close), drop zoom so the grid re-renders
  // the remaining panes.
  useEffect(() => {
    if (zoomedPaneId && !sessions.some((s) => s.id === zoomedPaneId)) {
      setZoomedPaneId(null)
    }
  }, [zoomedPaneId, sessions])

  // Pane layout tree — owned by App so Ctrl+G chord handlers can edit it
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

  // Registry of SessionUpdateList ListView handles, keyed by session id. Each
  // ChatPane registers its forwarded ListViewHandle here on mount via
  // the `onRegisterScrollList` callback threaded through PaneGrid →
  // LeafContainer → ChatPane. App-level Shift+Up/Down/PageUp/Down/
  // Home/End scroll bindings (below) use this map to call scrollBy /
  // scrollToTop / scrollToBottom on the focused pane's list — keyboard
  // focus normally lives in the SessionPromptComposer, so the ListView never
  // receives Arrow / PageUp / PageDown keys directly.
  //
  // Stored on a ref (not state) — registration is a side-effect, not
  // render input. The handler reads `scrollListsRef.current.get(...)`
  // at keypress time, which always sees the latest value.
  const scrollListsRef = useRef(new Map<string, ListViewHandle>())
  const registerScrollList = useCallback((sessionId: string, handle: ListViewHandle | null): void => {
    if (handle) scrollListsRef.current.set(sessionId, handle)
    else scrollListsRef.current.delete(sessionId)
  }, [])

  // Ctrl+G H/J/K/L — keyboard-driven pane swap (vim-window convention).
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

  // Ctrl+G v / Ctrl+G s — split the focused pane.
  //
  // Race-immune placement via placeholder: the chord handler synchronously
  // inserts a `__pending_*` placeholder leaf in the user's chosen direction,
  // then renames the placeholder to the real session id when
  // `controller.spawnSession()` resolves. This makes the chord the SOLE
  // writer for the new leaf's position — `reconcileTree`'s auto-append
  // path can't race because it skips placeholders by id prefix
  // (pane-layout.ts:isPlaceholderLeafId), and the placeholder occupies
  // the slot synchronously so by the time `sessions[]` updates with the
  // real id, the slot is already wired (drop loop preserves placeholders;
  // auto-append's `present.has(id)` skip fires once we rename in the
  // resolve callback).
  //
  // Bead: km-silvercode.split-direction-race.
  const splitFocusedPane = useCallback(
    (direction: SplitDirection): void => {
      const currentFocus = focusedSessionId
      if (!currentFocus) return
      const placeholder = freshPlaceholderId()
      // Place placeholder synchronously in the user's chosen direction.
      setPaneTree((prev) => splitLeaf(prev, currentFocus, placeholder, direction))
      // When the spawn resolves, rename placeholder → real id (and persist).
      // On failure (cap reached, factory throws), remove the placeholder so
      // the focused pane reclaims its full slot — the controller's spawn-
      // error banner already surfaces the cause to the user.
      void controller
        .spawnSession()
        .then((handle) => {
          setPaneTree((prev) => {
            const next = renameLeaf(prev, placeholder, handle.id)
            savePanes(props.cwd, next)
            return next
          })
          return undefined
        })
        .catch(() => {
          setPaneTree((prev) => removeLeaf(prev, placeholder) ?? prev)
        })
    },
    [controller, focusedSessionId, props.cwd],
  )

  // Pane close — extracted from the Ctrl+G x chord handler so the
  // PaneHeader's `×` button shares the same code path. Closes the named
  // pane (not necessarily the focused one) when there's more than one;
  // single-pane close stays a no-op for safety (matches the chord). The
  // controller has no per-session close API, so we mirror what Ctrl+G x
  // does: SDK-level close + drop the handle locally + advance focus.
  const closePaneById = useCallback(
    (id: string): void => {
      const handle = sessions.find((s) => s.id === id)
      if (!handle) return
      if (sessions.length <= 1) return
      void handle.session.close()
      handle.unsubscribe()
      // Advance focus to the next session in left-to-right reading order
      // so the user keeps a sensible focus after closing.
      const idx = sessions.findIndex((s) => s.id === id)
      const next = sessions[(idx + 1) % sessions.length]
      if (next && next.id !== id) controller.focus(next.id)
    },
    [controller, sessions],
  )

  // Header-button split: spawn a new session as a row-split right-of the
  // named pane. Same effect as splitFocusedPane("row") but parameterised
  // by the pane that owned the click — the user might click `+` on a
  // non-focused pane. Uses the same race-immune placeholder pattern as
  // splitFocusedPane — see that comment for context.
  const splitPaneRightById = useCallback(
    (id: string): void => {
      const placeholder = freshPlaceholderId()
      setPaneTree((prev) => splitLeaf(prev, id, placeholder, "row"))
      void controller
        .spawnSession()
        .then((handle) => {
          setPaneTree((prev) => {
            const next = renameLeaf(prev, placeholder, handle.id)
            savePanes(props.cwd, next)
            return next
          })
          return undefined
        })
        .catch(() => {
          setPaneTree((prev) => removeLeaf(prev, placeholder) ?? prev)
        })
    },
    [controller, props.cwd],
  )

  // Per-pane minimize state. Keyed by session id — when the pane closes
  // the entry leaks until reconcile drops it (cheap; we never have many
  // panes). Toggle is idempotent: click `_` to minimize, click `□` to
  // restore. PaneGrid renders only the header row when minimized.
  const [minimizedPaneIds, setMinimizedPaneIds] = useState<ReadonlySet<string>>(() => new Set())
  const toggleMinimizePane = useCallback((id: string): void => {
    setMinimizedPaneIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

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
  // SessionPromptComposer is the single command-input surface. Its REACT
  // ELEMENT is the same in every session state — only the parent slot
  // differs:
  //   - welcome (focused, messages.length === 0): rendered inside Welcome,
  //     centered under the banner via the `composerSlot` prop;
  //   - chat (focused, messages.length >= 1): rendered at the bottom of the
  //     left column;
  //   - pre-spawn (no focused, sessions.length === 0): rendered inside
  //     PaneGrid's empty-sessions placeholder, centered under the banner.
  //
  // App owns the controlled state (inputValue, focusedRegion, queue, …) so
  // the typed text persists across the welcome → chat transition even
  // though the parent slot changes. `welcomeIsFocused` decides which slot
  // gets the composer; bottom-of-layout suppresses its render in that case
  // so only one composer is mounted at a time.
  // Bead: km-silvercode.welcome-bypassed-by-pane-grid-spawn.
  // Derive welcomeIsFocused on every render — no useState+useEffect
  // false→true flip on first commit. Pre-spawn (focused=undefined) and
  // fresh-session (messages=[]) both want welcome chrome; only an
  // active conversation moves the composer to the bottom slot.
  //
  // Initial-state stability matters: useState with an "is conversation
  // empty?" initializer would land at `false` when sessions=[] (because
  // focused is undefined) and then flip to `true` once the spawn
  // microtask resolves and the recompute effect fired. That flip moved
  // the composer between two parent slots (Welcome group ↔ bottom slot)
  // → React unmounted/remounted the underlying TextInput → readline
  // cursor reset. By deriving each render from the canonical source
  // (focused?.messages.length), the value is stable from frame 0 and
  // only changes when the user actually types a turn.
  // Bead: km-silvery.startup-layout-cascade (L3 trigger).
  const conversationStarted = useSyncExternalStore(
    (cb) => (focused ? focused.store.state.subscribe(cb) : () => {}),
    () => (focused ? hasConversationContent(focused.store.state.get().messages) : false),
  )
  const welcomeIsFocused = !conversationStarted
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
  // 500ms open the SessionPromptHistory (rewind/edit history). The first Esc
  // still does its normal thing per the rules in the useInput handler.
  const lastEscapeAt = useRef<number>(0)
  const DOUBLE_ESC_WINDOW_MS = 500
  // Ctrl+D×2 quit — Claude Code parity. First Ctrl+D arms a 1500ms
  // window; a second Ctrl+D inside the window calls requestExit(). Any
  // other key resets the arm so a stale Ctrl+D doesn't trap the next
  // keystroke. silvery's multi-line TextArea (used by SessionPromptComposer) does
  // NOT consume Ctrl+D as delete-forward — only useReadline / single-line
  // TextInput do — so the App-level useInput here reliably receives the
  // chord. See bead km-silvercode.ctrl-d-quit.
  const lastCtrlDAt = useRef<number>(0)
  const DOUBLE_CTRL_D_WINDOW_MS = 1500

  // Pre-spawn first-prompt buffer. When the user types into the welcome
  // composer before a SessionHandle exists, the submit lands here; an
  // effect below flushes it through `handleSubmit` once the first
  // session materializes. This is the "type during spawn" path — the
  // welcome composer feels live from frame 0 even though `controller.send`
  // doesn't exist yet.
  const pendingFirstPromptRef = useRef<string | null>(null)
  useEffect(() => {
    if (sessions.length === 0 || !focused) return
    const pending = pendingFirstPromptRef.current
    if (pending == null) return
    pendingFirstPromptRef.current = null
    handleSubmit(pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length, focused])

  function handleSubmit(text: string): void {
    if (!focused) return
    const focusedId = focused.id
    const now = Date.now()
    if (now - lastSubmitAt.current < 50) return
    lastSubmitAt.current = now
    setInputValue("")
    let trimmed = text.trim()
    // Trailing '&' submits + immediately backgrounds (Claude Code parity).
    // Remove the '&' (and any whitespace before it), send the cleaned
    // message, then call backgroundActiveTurn so the turn runs in the
    // background and the UI is freed for next input. Edge case: text is
    // just "&" → no message sent, just background the existing turn (same
    // as Ctrl+B). Slash commands keep their literal '&' if any (rare).
    let backgroundAfterSubmit = false
    if (!trimmed.startsWith("/") && trimmed.endsWith("&")) {
      // Remove the trailing '&' AND any whitespace before it.
      const stripped = trimmed.slice(0, -1).trimEnd()
      if (stripped.length === 0) {
        // "&" alone → background the existing turn, no send.
        controller.backgroundActiveTurn(focusedId)
        return
      }
      trimmed = stripped
      backgroundAfterSubmit = true
    }
    // Let the cleared composer paint before optimistic chat updates or
    // backend stdin writes do heavier synchronous work.
    const dispatchAfterComposerPaint = (dispatch: () => void, backgroundSessionId?: string): void => {
      setTimeout(() => {
        dispatch()
        if (backgroundSessionId) {
          void Promise.resolve().then(() => controller.backgroundActiveTurn(backgroundSessionId))
        }
      }, 0)
    }
    if (trimmed.startsWith("/")) {
      const [cmd, ...rest] = trimmed.split(/\s+/)
      const arg = rest.join(" ")
      if (isLocal(cmd ?? "")) {
        switch (cmd) {
          case "/history":
            return setShowHistory(true)
          case "/todos":
          case "/panel":
          case "/aside":
            return togglePanel()
          case "/debug":
            // Toggle the debug view: inline every user message's hidden
            // context (system-reminders, hook output, isMeta auto-prompts
            // like "Continue from where you left off."). Lets the user see
            // exactly what the model received during a resumed session.
            // Hidden from the empty-query palette by default — see
            // slash-commands.ts. Bead: km-silvercode.resume-show-everything-collapsed.
            return setShowDebug((v) => {
              const next = !v
              controller.notificationMuteState.set("debug", !next)
              return next
            })
          case "/mode": {
            const modes = ["ask", "plan", "accept-edits", "auto", "bypass"]
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- modulo by modes.length keeps index in bounds
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
            const otherId = sessions.find((s) => s.id !== focusedId)?.id
            if (otherId) controller.handoff(focusedId, otherId, arg)
            return
          }
          case "/fork":
            void controller.fork(focusedId)
            return
          case "/spawn":
            void controller.spawnSession(arg || undefined)
            return
        }
      } else {
        const dispatchSlash = () => controller.runSlashCommand(focusedId, trimmed)
        const status = focused.store.state.get().status
        if (status === "idle" || status === "ended") {
          dispatchAfterComposerPaint(dispatchSlash)
        } else {
          dispatchSlash()
        }
      }
    } else {
      const dispatchPrompt = () => controller.send(focusedId, injectThinkingKeyword(trimmed, thinking))
      const backgroundAfterDispatch = () => {
        if (backgroundAfterSubmit) void Promise.resolve().then(() => controller.backgroundActiveTurn(focusedId))
      }
      const status = focused.store.state.get().status
      if (status === "idle" || status === "ended") {
        dispatchAfterComposerPaint(dispatchPrompt, backgroundAfterSubmit ? focusedId : undefined)
      } else {
        dispatchPrompt()
        backgroundAfterDispatch()
      }
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
      // ── App-level SessionUpdateList scroll bindings ──────────────────
      // SessionPromptComposer owns keyboard focus by default and silvery's TextArea
      // consumes ArrowUp/ArrowDown/PageUp/PageDown — without an app-level
      // intercept the user has no way to scroll the update stream from
      // the keyboard. We use the Shift modifier so plain Arrow keys
      // still reach the textarea for cursor movement.
      //
      //   Shift+Up / Shift+Down       → scroll by ±1 row
      //   Shift+PageUp / Shift+PageDn → scroll by ±10 rows (page step)
      //   Shift+Home                  → scrollToTop
      //   Shift+End                   → scrollToBottom (re-engages follow="end")
      //
      // The bindings target the FOCUSED session's SessionUpdateList — multi-pane
      // layouts route the keystroke to the pane the user is looking at.
      // Bead: km-silvercode.no-keyboard-scroll-from-command-box.
      if (key.shift && (key.upArrow || key.downArrow || key.pageUp || key.pageDown || key.home || key.end)) {
        const list = focused ? scrollListsRef.current.get(focused.id) : undefined
        if (list) {
          if (key.upArrow) list.scrollBy(-1)
          else if (key.downArrow) list.scrollBy(1)
          else if (key.pageUp) list.scrollBy(-MESSAGE_LIST_PAGE_STEP)
          else if (key.pageDown) list.scrollBy(MESSAGE_LIST_PAGE_STEP)
          else if (key.home) list.scrollToTop()
          else if (key.end) list.scrollToBottom()
          return
        }
      }
      // Escape cancels an in-flight pane drag-move first — highest
      // priority because dropping the drag silently on next mousemove
      // would be confusing. PaneGrid's imperative handle returns true
      // if there was a drag to cancel; we stop further Escape handling
      // in that case.
      if (key.escape && paneGridRef.current?.cancelDrag()) {
        return
      }
      if (key.escape && showHistory) {
        setShowHistory(false)
        return
      }
      // Double-Esc within 500ms → open SessionPromptHistory (Claude Code parity).
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
      // Codex parity: Option+. raises reasoning, Option+, lowers it.
      // Descriptor-backed so Claude and future agents use their own order.
      if (isOptionModifier(key) && input === ".") {
        cycleThinking(1)
        return
      }
      if (isOptionModifier(key) && input === ",") {
        cycleThinking(-1)
        return
      }
      // Cursor-boundary handoff between command and queue is handled by
      // SessionPromptComposer's own `onEdge` callbacks on the silvery TextAreas —
      // no parent-side Up/Down intercept needed.
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
      // canonical surface. togglePanel() also marks the user-override flag
      // so the responsive auto-open logic doesn't clobber the choice.
      if (key.ctrl && input === "o") {
        togglePanel()
        return
      }
      if (key.ctrl && input === "y") {
        togglePanel()
        return
      }
      if (key.ctrl && input === "r") {
        setShowHistory((v) => !v)
        return
      }
      // Ctrl+G — pane chord prefix. The next non-modifier keypress
      // within the timeout selects an action. We consume the Ctrl+G
      // itself + the follow-up so neither leaks into TextInput.
      // Resolving the chord follow-up has to come BEFORE the Ctrl+N
      // session cycler so that e.g. `Ctrl+G` then `n` doesn't get
      // intercepted as "next session" (currently we don't bind a chord
      // for `n`, but the order keeps the slot reserved).
      //
      // History: was Ctrl+W (vim-window), but TextArea consumes Ctrl+W
      // as readline word-delete before this handler runs. Bead
      // km-silvercode.ctrl-w-blocked-by-textarea.
      if (chordRef.current === "ctrl-g") {
        // Any keypress in chord state consumes the chord — even an
        // unrecognised one — so we don't accidentally swallow the user's
        // next real keystroke after a typo.
        setChordBoth(null)
        // Restore the input value snapshot taken when Ctrl+G fired, so
        // the chord follow-up letter (which TextArea also inserts) is
        // wiped. We schedule the restore via setTimeout(0) — by then,
        // TextArea's onChange has fully propagated through React, and
        // our restore is the last write to win. Microtask is too early
        // (TextArea's setInputValue runs after our handler returns).
        const snapshot = preChordInputRef.current
        preChordInputRef.current = null
        if (snapshot !== null) {
          const restore = snapshot
          setTimeout(() => setInputValue(restore), 0)
        }
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
          // (Note: lower-case x — chord follow-ups are case-insensitive
          // letters; uppercase versions are handled by H/J/K/L below.)
          if (focused && sessions.length > 1) {
            // No per-session close API on the controller (yet); send the
            // SDK-level close + drop the handle from the visible list by
            // moving focus to a sibling. The orphaned subprocess shuts
            // down via the same SIGTERM path that closeAll uses.
            void focused.session.close()
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
        // Ctrl+G H/J/K/L — vim-style swap with neighbor in direction.
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
      if (key.ctrl && input === "g") {
        // Snapshot the current input value so we can restore it after the
        // chord follow-up resolves — TextArea will insert the follow-up
        // letter into the input regardless of whether App's chord branch
        // ran (silvery has no priority/cancel between useInput handlers).
        preChordInputRef.current = inputValueRef.current
        setChordBoth("ctrl-g")
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
  // 1-col accent bar inside ChatPane's left edge.

  // Clean exit: close all sessions first so the child claude subprocesses
  // terminate, THEN let silvery restore the terminal. process.exit is still
  // banned inside the silvery app. Without this, Ctrl+D×2 restores the
  // terminal but leaves orphaned claude subprocesses keeping the host
  // process alive.
  const silveryExit = useExit()

  // Resumable session ids — read LIVE at exit time via the handle's
  // `session.sessionId` getter (spawn.ts updates the captured local on
  // session-init; the getter reflects the current value). A previous
  // useEffect-based snapshot of just the strings missed updates because
  // session-init mutates the handle internally without changing the
  // `sessions` array reference, so React never re-ran the effect and the
  // ref stayed full of "pending". The fix is to keep a ref to the sessions
  // ARRAY itself and re-read every getter at print time.
  //
  // We keep ALL session IDs (including the placeholder `"pending"` value
  // spawn.ts sets before the first session-init event). The renderer below
  // filters them at print time so the user sees an explanation when only
  // pending sessions exist (vs. silent "nothing happened").
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  // Print the resume hint when the app is tearing down so the user can
  // copy `silvercode --resume <sid>` from their scrollback.
  //
  // Plumbing details:
  //
  //   - `term.signals.on("exit", …)` registers an `onDispose: true` handler
  //     (the default). It fires synchronously inside `term[Symbol.dispose]`
  //     during silvery's `cleanup()` — AFTER the writeSync block has emitted
  //     `\x1b[?1049l` to leave the alt screen (so writes here land in the
  //     user's real scrollback) and AFTER `process.on("exit")` would fire
  //     (signals also installs that, but the handler is unregistered before
  //     Node's exit event runs, so we don't double-print).
  //   - We register the SAME handler under three signals (`exit`,
  //     `SIGINT`, `SIGTERM`) with distinct `name`s. Reason: a SIGINT path
  //     ends with the term being disposed before "exit" can fire on
  //     process; signals.dispose() runs every onDispose handler exactly
  //     once across all signals (one global topological pass), so the user
  //     gets one print even when both paths trigger.
  //   - Output goes to **stdout**, not stderr. Stderr is commonly
  //     redirected (`silvercode 2>/dev/null`) and several CI / wrapper
  //     setups eat stderr after a non-zero exit; stdout survives those.
  //   - We always write SOMETHING (resume IDs or a fallback message) so
  //     the user gets a clear "yes, the quit happened" signal even when
  //     no session ever produced a real session id (e.g. quitting before
  //     Claude's first session-init event arrives).
  //   - The returned `SignalUnregister` is NOT unregistered on React
  //     unmount: silvery's exit path unmounts React BEFORE the term is
  //     disposed (via `useExit` → `useDispose`), so disposing the listener
  //     on unmount would lose it before signals.dispose() runs. Term's
  //     signal registry is process-lifetime; it's reaped when the process
  //     dies.
  //
  // Bead: km-silvercode.resume-hint-not-shown.
  const term = useTerm()
  useEffect(() => {
    let printed = false
    function printHintsNow(): void {
      if (printed) return
      printed = true
      try {
        // Prefix each session id with the agent that minted it, so
        // `silvercode --resume <id>` is self-describing and routes back
        // to the correct backend without the user having to remember
        // `--agent` separately. See sid-prefix.ts for the round-trip
        // contract.
        const agentForPrefix = props.agent ?? "claude"
        const ids: string[] = sessionsRef.current
          .map((h) => h.session.sessionId)
          .filter((sid) => typeof sid === "string")
          .map((sid) => (sid === "pending" ? sid : prefixSid(agentForPrefix, sid)))
        process.stdout.write(formatResumeHint(ids))
      } catch {
        // stdout may be torn down on a hard crash path; best-effort.
      }
    }
    // Register under exit / SIGINT / SIGTERM with distinct names. A single
    // signals.dispose() pass runs each onDispose handler once globally;
    // the `printed` guard above belts-and-suspenders against any future
    // change that could call us twice.
    term.signals.on("exit", printHintsNow, { name: "silvercode-resume-hint-exit" })
    term.signals.on("SIGINT", printHintsNow, { name: "silvercode-resume-hint-sigint" })
    term.signals.on("SIGTERM", printHintsNow, { name: "silvercode-resume-hint-sigterm" })
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

  // Active agent's capability arrays — drive both Shift-Tab cycler and
  // the SidePanel cycle button so they always match the active agent.
  // Without this, codex sessions cycled through Claude's modes (wrong).
  const agentCapabilities = useMemo(
    () => (props.agent ? BUILTIN_AGENTS[props.agent]?.capabilities : undefined),
    [props.agent],
  )

  // Mode cycler used by the side panel's ⚡ label AND Shift+Tab. Routes
  // through the active agent's capabilities.planning array — falls back
  // to the legacy Claude mode list when no descriptors exist.
  const cycleMode = useCallback((): void => {
    const modes = agentCapabilities?.planning?.map((o) => o.id) ?? ["ask", "plan", "accept-edits", "auto", "bypass"]
    if (modes.length === 0) return
    setMode((m) => modes[(modes.indexOf(m) + 1) % modes.length] ?? modes[0] ?? m)
    // Fire the activate hook for the next option so the agent-side
    // change (e.g. codex's /plan slash command) actually happens.
    if (focused && agentCapabilities?.planning) {
      const next = agentCapabilities.planning.find((o) => o.id === modes[(modes.indexOf(mode) + 1) % modes.length])
      if (next) {
        void next.activate({
          controller,
          sessionId: focused.id,
          setThinking,
          setMode,
        })
      }
    }
  }, [agentCapabilities, controller, focused, mode])

  // Thinking cycler: routes through capabilities.thinking when set,
  // falls back to Claude's hardcoded tier list. Also emits the matching
  // slash command to Claude so the budget actually applies on the next turn.
  const cycleThinking = useCallback(
    (direction: CapabilityDirection = 1): void => {
      const tiers = agentCapabilities?.thinking
      if (tiers && tiers.length > 0) {
        const next = adjacentCapabilityOption(tiers, thinking, direction)
        void next.activate({
          controller,
          sessionId: focused?.id ?? "",
          setThinking,
          setMode,
        })
        return
      }

      // Legacy fallback for tests/custom agents without descriptors.
      // Claude descriptors cover normal production Claude paths.
      setThinking((t) => {
        const tiers = ["normal", "think", "think_hard", "ultrathink"]
        const current = t && tiers.includes(t) ? t : "normal"
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- modulo by tiers.length keeps index in bounds
        const next = tiers[(tiers.indexOf(current) + direction + tiers.length) % tiers.length]!
        if (focused && next !== "normal") {
          controller.runSlashCommand(focused.id, `/${next}`)
        }
        return next === "normal" ? "" : next
      })
    },
    [agentCapabilities, controller, focused, thinking],
  )

  return (
    <CwdProvider value={props.cwd}>
      <AutolinksProvider rules={autolinkRules}>
        <PopoverProvider>
          <SilvercodeLinkOpener />
          {/*
        Layout (opencode-style):

          ┌──────────────────────────────┬────────────┐
          │                              │            │
          │          chat panes area          │  side      │
          │                              │  panel     │
          │──────────────────────────────┤  (full     │
          │       command input          │  height)   │
          │                              │            │
          └──────────────────────────────┴────────────┘

        Side panel spans top to bottom on the right. Left column =
        chat panes (flexGrow=1) + command input at the bottom. No borders on
        any region — separation is via background color. All status /
        version / cost metadata lives in the side panel's bottom block,
        so the StatusLine at the very bottom is gone.
      */}
          <Screen flexDirection="row">
            <AsideLayout
              asideWidth={SIDE_PANEL_WIDTH}
              asideBackgroundColor="$bg-surface-subtle"
              aside={
                showSidePanel ? (
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
                    agent={props.agent}
                    capabilities={agentCapabilities}
                    setThinking={setThinking}
                    setMode={setMode}
                    defaultModel={props.agent ? BUILTIN_AGENTS[props.agent]?.defaultModel : undefined}
                    debugChannelVisible={showDebug}
                    onDebugChannelVisibleChange={(visible) => {
                      controller.notificationMuteState.set("debug", !visible)
                      setShowDebug(visible)
                    }}
                  />
                ) : null
              }
            >
              {/* LEFT: chat panes + overlays + palette + input. The outer column has
              `overflow="hidden"` — this is the "chat pane region vs side panel"
              boundary. CSS spec §4.5 elevates flexShrink on the overflow
              container itself, so any wide descendant is clipped here
              instead of pushing the side panel off-screen.
              silvery-expert audit (session 2026-04-24): silvery's reconciler
              never calls setFlexShrink when unspecified, so flexily defaults
              to shrink=0 — `minWidth={0}` alone does nothing without an
              overflow boundary in the chain. */}
              <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
                <Content.Layout>
                  {sessions.length === 0 && spawnError ? (
                    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
                      <Text bold color="$error">
                        {"Spawn failed"}
                      </Text>
                      <Text>{""}</Text>
                      <Text color="$fg">{spawnError}</Text>
                      <Text>{""}</Text>
                      <Text color="$muted">{"Common causes:"}</Text>
                      <Text color="$muted">{" - Agent binary missing or misconfigured"}</Text>
                      <Text color="$muted">{" - Account credentials missing"}</Text>
                      <Text color="$muted">{" - ACP server initialize timeout / connection closed"}</Text>
                      <Text>{""}</Text>
                      <Text color="$muted">{"Press Ctrl+D twice to quit."}</Text>
                    </Box>
                  ) : (
                    <PaneGrid
                      ref={paneGridRef}
                      controller={controller}
                      sessions={sessions}
                      focusedSessionId={focusedSessionId}
                      zoomedPaneId={zoomedPaneId}
                      tree={paneTree}
                      onTreeChange={onTreeChange}
                      cwd={props.cwd}
                      onFocusSession={(id) => controller.focus(id)}
                      onApprovePermission={(sid, rid) => controller.respondPermission(sid, rid, true)}
                      onDenyPermission={(sid, rid) => controller.respondPermission(sid, rid, false)}
                      paneHeaders={props.paneHeaders === true}
                      onSplitRightPane={splitPaneRightById}
                      onClosePane={closePaneById}
                      onToggleMinimizePane={toggleMinimizePane}
                      minimizedPaneIds={minimizedPaneIds}
                      onRegisterScrollList={registerScrollList}
                      showDebug={showDebug}
                      agent={props.agent}
                      model={props.model}
                      resume={props.resume}
                      composerSlot={
                        // Focused-pane command surface. ChatPane renders
                        // it inside the same Content.Layout as the transcript;
                        // Welcome may also show a resume-loading notice above
                        // it, but loading must not replace the input.
                        renderCommandSurface()
                      }
                    />
                  )}

                  {/* Bottom chrome (left column). flexShrink=0 prevents overflow. */}
                  <Box flexDirection="column" flexShrink={0}>
                    <InlineAskUserQuestionPrompt
                      focused={focused}
                      sessions={sessions}
                      onAnswer={(sid, toolUseId, answers) => controller.respondAskUserQuestion(sid, toolUseId, answers)}
                      onCancel={(sid, toolUseId) => controller.cancelAskUserQuestion(sid, toolUseId)}
                    />
                    {showHistory && (
                      <SessionPromptHistory onClose={() => setShowHistory(false)} logDir={props.logDir} />
                    )}
                    <Notifications sessions={sessions} />
                  </Box>
                </Content.Layout>
              </Box>
            </AsideLayout>
          </Screen>
        </PopoverProvider>
      </AutolinksProvider>
    </CwdProvider>
  )

  // Build the SessionPromptComposer element. Called from two places (welcome
  // slot + bottom slot); only one mounts at a time. App-owned state means
  // the typed buffer persists across the welcome → chat slot transition.
  function renderComposer(): React.ReactElement | null {
    const palette =
      paletteQuery !== null ? (
        <AvailableCommandsPalette
          query={paletteQuery}
          remoteCommands={focused?.store.state.get().slashCommands}
          remoteSkills={focused?.store.state.get().skills}
          onSubmit={(cmd) => handleSubmit(cmd)}
          onClose={() => setInputValue("")}
        />
      ) : null
    if (!focused) {
      // Pre-spawn (sessions.length === 0): render a buffered composer that
      // routes submits through `handleSubmit` (which queues into a pending
      // ref until SessionHandle materializes). Fresh startup begins spawning
      // immediately, but the command surface stays live and the first prompt
      // is replayed into the session as soon as the handle exists.
      return (
        <Box flexDirection="column" width="100%" minWidth={0}>
          {palette}
          <SessionPromptComposer
            queueText=""
            onQueueChange={() => {}}
            onQueueSubmit={() => {}}
            focusedRegion="command"
            onFocusRegion={() => {}}
            inputValue={inputValue}
            onInputChange={setInputValue}
            inputDisabled={Boolean(props.resume)}
            onSubmit={(text) => {
              const trimmed = text.trim()
              if (!trimmed || props.resume) return
              pendingFirstPromptRef.current = trimmed
              setInputValue("")
            }}
            onExit={requestExit}
            promptColor={promptColor}
          />
        </Box>
      )
    }
    const f = focused
    return (
      <Box flexDirection="column" width="100%" minWidth={0}>
        {palette}
        <SessionPromptComposer
          queueText={queueText}
          onQueueChange={(t) => controller.setQueuedText(f.id, t)}
          onQueueSubmit={() => {
            controller.flushQueue(f.id)
            setFocusedRegion("command")
          }}
          focusedRegion={focusedRegion}
          onFocusRegion={setFocusedRegion}
          inputValue={inputValue}
          onInputChange={setInputValue}
          inputDisabled={pendingPermissions > 0 || pendingQuestions > 0}
          onSubmit={handleSubmit}
          onExit={requestExit}
          promptColor={promptColor}
        />
      </Box>
    )
  }

  function renderCommandSurface(): React.ReactElement | null {
    const focusedPermissions = focused?.store.state.get().permissions.length ?? 0
    if (focusedPermissions > 0) {
      return (
        <InlinePermissionPrompt
          focused={focused}
          sessions={sessions}
          onApprove={(sid, rid) => controller.respondPermission(sid, rid, true)}
          onDeny={(sid, rid) => controller.respondPermission(sid, rid, false)}
          onSelectOption={(sid, rid, optionId, approved) =>
            controller.respondPermissionOption(sid, rid, optionId, approved)
          }
        />
      )
    }
    return renderComposer()
  }
}
