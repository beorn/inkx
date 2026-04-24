import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { SessionState, SessionStore } from "@km/agent-harness"
import { Box, H2, Muted, Small, Text, useWindowSize } from "silvery"
import { useInput } from "silvery/runtime"
import { CommandInput } from "./components/CommandInput.tsx"
import { HistoryView } from "./components/HistoryView.tsx"
import { ModeSwitcher } from "./components/ModeSwitcher.tsx"
import { Notifications } from "./components/Notifications.tsx"
import { PermissionInbox } from "./components/PermissionInbox.tsx"
import { PopoverLayer, PopoverProvider } from "./components/Popover.tsx"
import { SessionCard } from "./components/SessionCard.tsx"
import { SlashCommandPalette } from "./components/SlashCommandPalette.tsx"
import { StatusLine } from "./components/StatusLine.tsx"
import { TodoPanel } from "./components/TodoPanel.tsx"
import { createSilvercodeController, type Controller, type SessionHandle } from "./controller.ts"
import { useStoreSignal } from "./hooks/use-store-signal.ts"
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
}

export function App(props: AppProps): React.ReactElement {
  const { columns: cols, rows: termRows } = useWindowSize()
  const controllerRef = useRef<Controller | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = createSilvercodeController({
      cwd: props.cwd,
      model: props.model,
      resume: props.resume,
      bare: props.bare,
      track: props.track,
      logDir: props.logDir,
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

  useInput(
    (input, key) => {
      if (key.escape && (showInbox || showHistory)) {
        setShowInbox(false)
        setShowHistory(false)
        return
      }
      if (key.ctrl && input === "i") {
        setShowInbox((v) => !v)
        return
      }
      if (key.ctrl && input === "t") {
        setShowTodos((v) => !v)
        return
      }
      if (key.ctrl && input === "h") {
        setShowHistory((v) => !v)
        return
      }
      if (key.ctrl && input === "m") {
        const modes = ["plan", "accept-edits", "auto", "bypass"]
        const idx = modes.indexOf(mode)
        const next = modes[(idx + 1) % modes.length]!
        setMode(next)
        return
      }
      if (key.tab && sessions.length > 1) {
        const idx = sessions.findIndex((s) => s.id === focusedSessionId)
        const next = sessions[(idx + 1) % sessions.length]!
        controller.focus(next.id)
        return
      }
    },
    { isActive: true },
  )

  const columns = props.layout === "grid-4" ? 2 : props.layout === "grid-2" ? 2 : 1
  const cardCount = sessions.length
  const cardHeight = props.layout === "single" ? Math.max(10, termRows - 5) : Math.max(10, Math.floor((termRows - 5) / Math.ceil(cardCount / columns)))

  return (
    <PopoverProvider>
      <Box flexDirection="column" height={termRows} width={cols}>
        {/* Grid of session cards */}
        <Box flexDirection="row" flexWrap="wrap" flexGrow={1}>
          {sessions.map((s) => (
            <Box key={s.id} width={columns === 1 ? "100%" : "50%"} height={cardHeight} padding={0}>
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

        {/* Slash command palette (appears above input when typing '/…') */}
        {paletteQuery !== null && (
          <SlashCommandPalette
            query={paletteQuery}
            onSelect={(cmd) => setInputValue(cmd + " ")}
            onClose={() => setInputValue("")}
          />
        )}

        {/* Command input (user → focused session) */}
        <CommandInput
          value={inputValue}
          onChange={setInputValue}
          disabled={!focused}
          onSubmit={(text) => {
            if (!focused) return
            setInputValue("")
            const trimmed = text.trim()
            if (trimmed.startsWith("/")) {
              const [cmd, ...rest] = trimmed.split(/\s+/)
              const arg = rest.join(" ")
              if (isLocal(cmd ?? "")) {
                switch (cmd) {
                  case "/inbox":
                    setShowInbox(true)
                    return
                  case "/history":
                    setShowHistory(true)
                    return
                  case "/todos":
                    setShowTodos((v) => !v)
                    return
                  case "/handoff": {
                    const otherId = sessions.find((s) => s.id !== focused.id)?.id
                    if (otherId) controller.handoff(focused.id, otherId, arg)
                    return
                  }
                  case "/fork":
                    controller.fork(focused.id)
                    return
                  case "/spawn":
                    controller.spawnSession(arg || undefined)
                    return
                }
              } else {
                controller.runSlashCommand(focused.id, trimmed)
              }
            } else {
              controller.send(focused.id, trimmed)
            }
          }}
        />

        {/* Status line pinned to bottom */}
        <StatusLine
          session={focused}
          mode={mode}
          sessionCount={sessions.length}
          onSwitchMode={setMode}
        />

        {/* Overlays */}
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
        <ModeSwitcher mode={mode} onChange={setMode} />
        <Notifications sessions={sessions} />
        <PopoverLayer />
      </Box>
    </PopoverProvider>
  )
}
