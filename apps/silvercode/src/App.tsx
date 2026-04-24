import React, { useEffect, useMemo, useRef, useState } from "react"
import type { SessionStore } from "@km/agent-harness"
import { Box, PopoverProvider, Screen, useDispose, useExit } from "silvery"
import { useInput } from "silvery/runtime"
import { CommandInput } from "./components/CommandInput.tsx"
import { HistoryView } from "./components/HistoryView.tsx"
import { Notifications } from "./components/Notifications.tsx"
import { PermissionInbox } from "./components/PermissionInbox.tsx"
import { SessionCard } from "./components/SessionCard.tsx"
import { SidePanel } from "./components/SidePanel.tsx"
import { SlashCommandPalette } from "./components/SlashCommandPalette.tsx"
import { createSilvercodeController, type Controller, type SessionHandle } from "./controller.ts"
import { isLocal } from "./slash-commands.ts"

type Layout = "single" | "grid-2" | "grid-4"
type Track = "claude" | "sdk" | "codex"

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
  const [showInbox, setShowInbox] = useState(false)
  const [showSidePanel, setShowSidePanel] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const paletteQuery = inputValue.startsWith("/") ? inputValue : null

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
            const modes = ["plan", "accept-edits", "auto", "bypass"]
            const target = modes.includes(arg) ? arg : modes[(modes.indexOf(mode) + 1) % modes.length]!
            setMode(target)
            return
          }
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
      controller.send(focused.id, trimmed)
    }
  }

  // Ctrl key choices avoid ASCII control-code aliases (Ctrl+I = Tab, Ctrl+M =
  // Enter, Ctrl+H = Backspace, Ctrl+J = LineFeed, Ctrl+[ = Esc). Terminals
  // translate those before silvery ever sees them, so they're unreachable
  // outside Kitty disambiguation mode. These letters are safe across all
  // terminals: E / Y / R / N. Slash commands (/inbox, /history, /todos,
  // /mode) are the canonical surface — the Ctrl pairs are shortcuts.
  //
  // Known silvery quirk: when our app-level useInput fires on a Ctrl+letter,
  // the TextInput in CommandInput STILL sees the same key event and inserts
  // the plain letter via its readline fallback (unknown ctrl combos aren't
  // consumed by readline). We strip the trailing letter after handling so
  // users don't see 'o' appended to their prompt every time they toggle.
  function handleCtrlLetter(letter: string, action: () => void): void {
    action()
    // TextInput's onChange runs AFTER our useInput in the same tick. Setting
    // inputValue synchronously doesn't reliably win the race. Defer with a
    // microtask so we run after TextInput's insert, then strip.
    queueMicrotask(() => {
      setInputValue((v) => (v.endsWith(letter) ? v.slice(0, -1) : v))
    })
  }
  useInput(
    (input, key) => {
      if (key.escape && (showInbox || showHistory)) {
        setShowInbox(false)
        setShowHistory(false)
        return
      }
      if (key.ctrl && input === "e") return handleCtrlLetter("e", () => setShowInbox((v) => !v))
      // Side panel toggle — Ctrl+O (safe across terminals; Cmd+I was tried
      // but gets intercepted by cmux / most terminal multiplexers before
      // reaching the app). Slash commands /panel, /aside, /todos are the
      // canonical surface.
      if (key.ctrl && input === "o") return handleCtrlLetter("o", () => setShowSidePanel((v) => !v))
      if (key.ctrl && input === "y") return handleCtrlLetter("y", () => setShowSidePanel((v) => !v))
      if (key.ctrl && input === "r") return handleCtrlLetter("r", () => setShowHistory((v) => !v))
      if (key.ctrl && input === "n" && sessions.length > 1) {
        return handleCtrlLetter("n", () => {
          const idx = sessions.findIndex((s) => s.id === focusedSessionId)
          const next = sessions[(idx + 1) % sessions.length]!
          controller.focus(next.id)
        })
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

  // On any exit path (Ctrl+D×2, Ctrl+C, /quit), capture the resumable
  // session IDs so we can print them to stderr AFTER silvery restores
  // the terminal — that way the user sees "resume with silvercode
  // --resume <id>" in their normal scrollback, not inside the alt-screen
  // view that's about to go away.
  function printResumeHints(): void {
    const hints = controller
      .snapshot()
      .map((h) => h.session.sessionId)
      .filter((sid) => typeof sid === "string" && sid !== "pending")
    if (hints.length === 0) return
    const lines = hints.map((sid) => `  silvercode --resume ${sid}`)
    process.stderr.write(
      `\nResume ${hints.length === 1 ? "this session" : "one of these sessions"} with:\n${lines.join("\n")}\n\n`,
    )
  }

  function requestExit(): void {
    // controller.closeAll() SIGTERMs every child synchronously; silveryExit
    // restores the terminal; resume hints print to real stderr after the
    // alt screen is gone. Closes the whole path in one tick.
    try {
      controller.closeAll()
    } catch {
      /* best-effort — still exit */
    }
    silveryExit()
    printResumeHints()
  }

  // silvery owns the exit lifecycle. useDispose wires our cleanup into
  // SIGINT + SIGTERM + React unmount with a single line. Before silvery
  // shipped useDispose, this was 10 lines of term.signals.on / useEffect
  // / guard-against-double-run boilerplate — that was the ergonomic-gap
  // /big session flagged as its top reframe.
  useDispose(() => {
    controller.closeAll()
    printResumeHints()
  })

  // Mode cycler used by the side panel's ⚡ label.
  function cycleMode(): void {
    const modes = ["plan", "accept-edits", "auto", "bypass"]
    setMode(modes[(modes.indexOf(mode) + 1) % modes.length]!)
  }

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
        {/* LEFT: cards + overlays + palette + input */}
        <Box flexDirection="column" flexGrow={1} minHeight={0}>
          <Box flexDirection="row" flexWrap="wrap" flexGrow={1} flexShrink={1} minHeight={0}>
            {sessions.map((s) => (
              <Box key={s.id} flexDirection="column" flexGrow={1} flexBasis={cardBasis} minHeight={0}>
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

            {/* Command input region — floats with transparent margin on
                all sides so it reads as its own surface, visually separated
                from the side panel (which sits immediately to its right)
                and from the terminal edges. The inner Box carries the bg +
                content padding; the outer Box is transparent gutter. */}
            <Box paddingX={1} paddingBottom={1} flexShrink={0}>
              <Box backgroundColor="$bg-surface-subtle" paddingX={2} paddingY={1}>
                <CommandInput
                  value={inputValue}
                  onChange={setInputValue}
                  disabled={!focused}
                  onSubmit={handleSubmit}
                  onExit={requestExit}
                />
              </Box>
            </Box>
          </Box>
        </Box>

        {/* RIGHT: full-height side panel. Same bg token as the command input
            so the chrome reads as a single unified surface — opencode uses
            the same trick. */}
        {showSidePanel && focused && (
          <Box
            flexShrink={0}
            flexBasis={40}
            flexDirection="column"
            backgroundColor="$bg-surface-subtle"
          >
            <SidePanel
              focused={focused}
              sessions={sessions}
              focusedSessionId={focusedSessionId}
              onFocusSession={(id) => controller.focus(id)}
              mode={mode}
              onCycleMode={cycleMode}
              cwd={props.cwd}
            />
          </Box>
        )}
      </Screen>
    </PopoverProvider>
  )
}
