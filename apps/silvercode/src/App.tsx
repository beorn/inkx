import React, { useEffect, useMemo, useRef, useState } from "react"
import type { SessionStore } from "@km/agent-harness"
import { Box, useExit, useWindowSize } from "silvery"
import { useInput } from "silvery/runtime"
import { AppHeader } from "./components/AppHeader.tsx"
import { CommandInput } from "./components/CommandInput.tsx"
import { HistoryView } from "./components/HistoryView.tsx"
import { Notifications } from "./components/Notifications.tsx"
import { PermissionInbox } from "./components/PermissionInbox.tsx"
import { PopoverLayer, PopoverProvider } from "./components/Popover.tsx"
import { SessionCard } from "./components/SessionCard.tsx"
import { SlashCommandPalette } from "./components/SlashCommandPalette.tsx"
import { StatusLine } from "./components/StatusLine.tsx"
import { TodoPanel } from "./components/TodoPanel.tsx"
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
  const [showTodos, setShowTodos] = useState(true)
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
            return setShowTodos((v) => !v)
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
  useInput(
    (input, key) => {
      if (key.escape && (showInbox || showHistory)) {
        setShowInbox(false)
        setShowHistory(false)
        return
      }
      if (key.ctrl && input === "e") return setShowInbox((v) => !v)
      if (key.ctrl && input === "y") return setShowTodos((v) => !v)
      if (key.ctrl && input === "r") return setShowHistory((v) => !v)
      if (key.ctrl && input === "n" && sessions.length > 1) {
        const idx = sessions.findIndex((s) => s.id === focusedSessionId)
        const next = sessions[(idx + 1) % sessions.length]!
        controller.focus(next.id)
        return
      }
    },
    { isActive: true },
  )

  // grid-2 → 2 cards, 1 row of 2. grid-4 → 4 cards, 2 rows of 2 via flexWrap.
  // No manual height/width math — let flex compute from flexGrow + flexBasis.
  const cardBasis = props.layout === "single" ? "100%" : "50%"

  // Bind the root box to the live window dims so resize events propagate — on
  // SIGWINCH useWindowSize re-renders, the root re-sizes, and the flex
  // children (cards / input / status) redistribute automatically.
  const { columns: cols, rows } = useWindowSize()

  // Clean exit: close all sessions first so the child claude subprocesses
  // terminate, THEN let silvery restore the terminal. process.exit is still
  // banned inside the silvery app. Without this, Ctrl+D×2 restores the
  // terminal but leaves orphaned claude subprocesses keeping the host
  // process alive.
  const silveryExit = useExit()
  async function requestExit(): Promise<void> {
    try {
      await controller.closeAll()
    } catch {
      /* best-effort — still exit */
    }
    silveryExit()
  }

  return (
    <PopoverProvider>
      <Box flexDirection="column" width={cols} height={rows} overflow="hidden">
        {/* Top banner */}
        <AppHeader cwd={props.cwd} track={props.track} />

        {/* Session cards grid */}
        <Box flexDirection="row" flexWrap="wrap" flexGrow={1}>
          {sessions.map((s) => (
            <Box key={s.id} flexDirection="column" flexGrow={1} flexBasis={cardBasis}>
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

        {/* Overlays first so they stack above the chrome below */}
        {showInbox && (
          <PermissionInbox
            sessions={sessions}
            onApprove={(sid, rid) => controller.respondPermission(sid, rid, true)}
            onDeny={(sid, rid) => controller.respondPermission(sid, rid, false)}
            onClose={() => setShowInbox(false)}
          />
        )}
        {showTodos && focused && <TodoPanel handle={focused} />}
        {showHistory && <HistoryView onClose={() => setShowHistory(false)} logDir={props.logDir} />}
        <Notifications sessions={sessions} />

        {/* Slash-command palette when typing /… */}
        {paletteQuery !== null && (
          <SlashCommandPalette
            query={paletteQuery}
            onSubmit={(cmd) => handleSubmit(cmd)}
            onClose={() => setInputValue("")}
          />
        )}

        <CommandInput
          value={inputValue}
          onChange={setInputValue}
          disabled={!focused}
          onSubmit={handleSubmit}
          onExit={() => void requestExit()}
        />

        <StatusLine session={focused} mode={mode} sessionCount={sessions.length} onSwitchMode={setMode} />

        <PopoverLayer />
      </Box>
    </PopoverProvider>
  )
}
