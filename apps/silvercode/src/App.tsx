import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AgentSession, SessionStore } from "@km/agent-harness"
import { Box, PopoverProvider, Screen, useExit, useScopeEffect, useTerm } from "silvery"
import { useInput } from "silvery/runtime"
import { CommandBox } from "./components/CommandBox.tsx"
import { HistoryView } from "./components/HistoryView.tsx"
import { Notifications } from "./components/Notifications.tsx"
import { PermissionInbox } from "./components/PermissionInbox.tsx"
import { useQueue } from "./hooks/use-queue.ts"
import { SessionCard } from "./components/SessionCard.tsx"
import { SidePanel } from "./components/SidePanel.tsx"
import { SlashCommandPalette } from "./components/SlashCommandPalette.tsx"
import { createSilvercodeController, type Controller, type SessionHandle } from "./controller.ts"
import { isLocal } from "./slash-commands.ts"

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
   * `~/.silvercode/accounts/<account>/` via `CLAUDE_CONFIG_DIR`. Undefined →
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
  // When the queue empties while it has focus, snap focus back to the
  // command region — there's nowhere for the cursor to live in the queue.
  useEffect(() => {
    if (queueText.length === 0 && focusedRegion === "queue") setFocusedRegion("command")
  }, [queueText, focusedRegion])

  // Dedupe: when the palette is open and user presses Enter, both the
  // palette's useInput AND TextInput's internal Enter handler fire in the
  // same tick. Guard with a ts ref so the second call is a no-op.
  const lastSubmitAt = useRef<number>(0)

  function handleSubmit(text: string): void {
    if (!focused) return
    const now = Date.now()
    if (now - lastSubmitAt.current < 50) return
    lastSubmitAt.current = now
    setInputValue("")
    const trimmed = text.trim()
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
      if (key.escape && (showInbox || showHistory)) {
        setShowInbox(false)
        setShowHistory(false)
        return
      }
      // Esc on empty command input with no overlays open and a non-empty
      // queue → cancel all queued messages. We only fire when the
      // command region owns focus; the queue TextArea handles its own
      // Esc (silvery's native — clears its own selection or no-op).
      if (key.escape && focusedRegion === "command" && inputValue.length === 0 && focused && queueText.length > 0) {
        controller.clearQueue(focused.id)
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
      if (key.ctrl && input === "e") {
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
      // Ctrl+N cycles sessions. Now that the queue is a silvery TextArea
      // (Option B), there's no editor-mode aliasing — Ctrl+N is always
      // session cycling at the App level.
      if (key.ctrl && input === "n" && sessions.length > 1) {
        const idx = sessions.findIndex((s) => s.id === focusedSessionId)
        const next = sessions[(idx + 1) % sessions.length]!
        controller.focus(next.id)
        return
      }
    },
    { isActive: true },
  )

  // Layout adapts to actual session count: single session → full width;
  // 2+ sessions (e.g. from /fork or /spawn) → 50% basis + flexWrap so they
  // tile instead of stacking on top of each other. The --layout flag sets
  // the initial session count; forks grow that count at runtime and the
  // layout follows.
  const cardBasis = sessions.length <= 1 ? "100%" : "50%"

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
          <Box flexDirection="row" flexWrap="wrap" flexGrow={1} flexShrink={1} minHeight={0}>
            {sessions.map((s) => (
              <Box
                key={s.id}
                flexDirection="column"
                flexGrow={1}
                flexShrink={1}
                flexBasis={cardBasis}
                minHeight={0}
                minWidth={0}
              >
                <SessionCard
                  handle={s}
                  isFocused={s.id === focusedSessionId}
                  onFocus={() => controller.focus(s.id)}
                  onApprove={(reqId) => controller.respondPermission(s.id, reqId, true)}
                  onDeny={(reqId) => controller.respondPermission(s.id, reqId, false)}
                />
              </Box>
            ))}
          </Box>

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
            {showHistory && <HistoryView onClose={() => setShowHistory(false)} logDir={props.logDir} />}
            <Notifications sessions={sessions} />

            {paletteQuery !== null && (
              <SlashCommandPalette
                query={paletteQuery}
                remoteCommands={focused?.store.state.get().slashCommands}
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
  )
}
