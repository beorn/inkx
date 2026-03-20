/**
 * Chat view — pure rendering + signal reads.
 *
 * No input handling here — all key dispatch happens outside React
 * via withTerminal()'s term:key handler. The view only reads signals
 * and renders UI.
 *
 * In production, imports would come from:
 * - Box, Text, Link, Spinner, ScrollbackList, TextArea → `@silvery/ag-react/ui`
 * - useTerminalFocused                                  → `@silvery/ag-term`
 * - signal, useSignal                                   → `@silvery/signals` + `/react`
 * - useChat, formatTokens, etc.                         → app model (uses @silvery/model)
 * - invoke                                              → `@silvery/commands`
 *
 * Era 2 aspirations (marked with "Era 2:" comments below):
 * - Focus, dimensions, elapsed time are all signals from the runtime
 * - Animation/streaming would be a scope-owned effect, not model logic
 * - No special-purpose hooks — just useSignal() for everything
 */

import React, { useState, useEffect, useCallback, type JSX } from "react"
import { Box, Text, Link, Spinner, ScrollbackList, TextArea, useTerminalFocused } from "@silvery/react"
import { signal, useSignal, type Signal } from "./signal.js"
import { useChat, formatTokens, formatCost, computeCumulativeTokens } from "./model.js"
import { invoke } from "./app.js"
import type { Message, ToolCall } from "./types.js"
import {
  TOOL_COLORS,
  URL_RE,
  RANDOM_USER_COMMANDS,
  CONTEXT_WINDOW,
} from "../../../silvery/examples/interactive/aichat/script.js"

const NEVER_PENDING = signal(false) as Signal<boolean>

// ============================================================================
// ChatView — top-level component
// ============================================================================

export function ChatView({ ctrlDPending }: { ctrlDPending?: Signal<boolean> }): JSX.Element {
  const chat = useChat.get()
  const messages = useSignal(chat.messages)
  const isCompacting = useSignal(chat.compacting)

  return (
    <Box flexDirection="column" paddingX={1}>
      <ScrollbackList
        items={messages}
        keyExtractor={(msg: Message) => msg.id}
        markers={true}
        footer={<DemoFooter ctrlDPending={ctrlDPending} />}
      >
        {(message: Message, index: number) => {
          const isLatest = index === messages.length - 1
          return (
            <Box flexDirection="column">
              {index > 0 && <Text> </Text>}
              {isCompacting && isLatest && <CompactingOverlay />}
              <MessageItem message={message} isLatest={isLatest} />
            </Box>
          )
        }}
      </ScrollbackList>
    </Box>
  )
}

// ============================================================================
// DemoFooter
// ============================================================================

export function DemoFooter({ ctrlDPending = NEVER_PENDING }: { ctrlDPending?: Signal<boolean> }): JSX.Element {
  const chat = useChat.get()
  // Era 2: useSignal(app.focused) — focus is a signal from @silvery/ag-term,
  // not a special hook. Same for dimensions: useSignal(app.dims). (Decision 29: callable accessor)
  const terminalFocused = useTerminalFocused()
  const isDone = useSignal(chat.done)
  const isCompacting = useSignal(chat.compacting)
  const autoText = useSignal(chat.autoTypingText)
  const pending = useSignal(ctrlDPending)
  // Era 2: elapsed would be a signal from a timer plugin — scope.interval(1000)
  // returns a Signal<number> that increments every second. No useEffect needed.
  const elapsed = useElapsed()

  const [inputText, setInputText] = useState("")
  const [randomIdx, setRandomIdx] = useState(() => Math.floor(Math.random() * RANDOM_USER_COMMANDS.length))

  const nextHint = chat.getNextHint()
  const randomPlaceholder = RANDOM_USER_COMMANDS[randomIdx % RANDOM_USER_COMMANDS.length]!
  const effectiveMessage = nextHint || randomPlaceholder
  const placeholder = !terminalFocused ? "Click to focus" : pending ? "Press Ctrl-D again to exit" : effectiveMessage

  const handleSubmit = useCallback(
    (text: string) => {
      const msg = !text.trim() && effectiveMessage ? effectiveMessage : text
      invoke({ command: chat.commands.submit, args: { text: msg } })
      setInputText("")
      setRandomIdx((i) => i + 1)
    },
    [chat, effectiveMessage],
  )

  const displayText = autoText ?? inputText

  return (
    <Box flexDirection="column" width="100%">
      <Text> </Text>
      <Box
        flexDirection="row"
        borderStyle="round"
        borderColor={!isDone && terminalFocused ? "$focusborder" : "$inputborder"}
        paddingX={1}
      >
        <Text bold color="$focusring">
          {"❯"}{" "}
        </Text>
        <Box flexShrink={1} flexGrow={1}>
          <TextArea
            value={displayText}
            onChange={autoText ? () => {} : setInputText}
            onSubmit={handleSubmit}
            submitKey="enter"
            height={1}
            placeholder={placeholder}
            isActive={!isDone && !autoText && terminalFocused}
          />
        </Box>
      </Box>
      <Box paddingX={2} width="100%">
        <StatusBar elapsed={elapsed} ctrlDPending={pending} />
      </Box>
    </Box>
  )
}

// ============================================================================
// MessageItem
// ============================================================================

export function MessageItem({ message, isLatest }: { message: Message; isLatest: boolean }): JSX.Element {
  const chat = useChat.get()
  const chatPhase = useSignal(chat.phase)
  const streamContent = useSignal(chat.currentContent)
  const toolIdx = useSignal(chat.activeToolIndex)
  // Era 2: pulse would be a derived signal — computed(() => Math.floor(app.now() / 400) % 2 === 0)
  // where app.now is a frame-synced timestamp signal. No setInterval needed. (Decision 29: callable accessor)
  const pulseVal = usePulse()

  const phase = isLatest ? chatPhase : ("idle" as const)
  const displayContent = isLatest && chatPhase === "streaming" ? streamContent : message.content

  if (message.role === "system") {
    return (
      <Box flexDirection="column">
        <Text> </Text>
        <Text bold>AI Chat</Text>
        <Text> </Text>
        <Text color="$muted">{message.content}</Text>
        <Text> </Text>
      </Box>
    )
  }

  if (message.role === "user") {
    return (
      <Box paddingX={1} flexDirection="row" backgroundColor="$surface-bg">
        <Text bold color="$focusring">
          {"❯"}{" "}
        </Text>
        <Box flexShrink={1}>
          <Text>{message.content}</Text>
        </Box>
      </Box>
    )
  }

  const toolCalls = message.toolCalls ?? []
  const toolRevealCount = phase === "tools" || phase === "idle" ? toolCalls.length : 0
  const hasOperations = toolCalls.length > 0 || !!message.thinking

  const metaParts: string[] = []
  if (message.tokens && phase === "idle") metaParts.push(`${formatTokens(message.tokens.output)} tokens`)
  if (message.thinking && (phase === "idle" || phase === "streaming")) metaParts.push("thought for 1s")
  const metaStr = metaParts.length > 0 ? ` (${metaParts.join(" · ")})` : ""

  const { title, body } = splitTitleBody(message.content)
  const bulletColor = hasOperations ? "$success" : "$muted"
  const contentText = displayContent ? (title ? body || displayContent : displayContent) : ""
  const showCursor = phase === "streaming" && streamContent.length < message.content.length

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color={bulletColor} dimColor={hasOperations && !pulseVal && phase !== "idle"}>
          {"●"}
        </Text>
        {phase === "thinking" ? (
          <Text color="$muted" italic>
            {" "}
            <Spinner type="dots" /> thinking
          </Text>
        ) : (
          <>
            {title && phase === "idle" && <Text> {title}</Text>}
            {phase === "idle" && <Text color="$muted">{metaStr}</Text>}
          </>
        )}
      </Text>

      <Box
        flexDirection="column"
        borderStyle="bold"
        borderColor="$border"
        borderLeft
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        paddingLeft={1}
      >
        {message.thinking && (phase === "thinking" || phase === "streaming") && (
          <ThinkingBlock text={message.thinking} done={phase !== "thinking"} />
        )}

        {(phase === "streaming" || phase === "tools" || phase === "idle") && contentText && (
          <Text>
            {contentText}
            {showCursor && <Text color="$primary">{"▌"}</Text>}
          </Text>
        )}

        {toolRevealCount > 0 && (
          <Box flexDirection="column">
            {toolCalls.map((call, i) => (
              <ToolCallBlock
                key={i}
                call={call}
                phase={phase === "idle" ? "done" : i < toolIdx ? "done" : i === toolIdx ? "running" : "pending"}
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function StatusBar({ elapsed, ctrlDPending }: { elapsed: number; ctrlDPending: boolean }): JSX.Element {
  const chat = useChat.get()
  const messages = useSignal(chat.messages)
  const isCompacting = useSignal(chat.compacting)
  const baseline = useSignal(chat.contextBaseline)

  const cumulative = computeCumulativeTokens(messages)
  const cost = formatCost(cumulative.input, cumulative.output)
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const elapsedStr = `${minutes}:${seconds.toString().padStart(2, "0")}`

  const CTX_W = 20
  const effectiveContext = Math.max(0, cumulative.currentContext - baseline)
  const ctxFrac = effectiveContext / CONTEXT_WINDOW
  const ctxFilled = Math.round(Math.min(ctxFrac, 1) * CTX_W)
  const ctxPct = Math.round(ctxFrac * 100)
  const ctxColor = ctxPct > 100 ? "$error" : ctxPct > 80 ? "$warning" : "$primary"
  const ctxBar = "\u2588".repeat(ctxFilled) + "\u2591".repeat(CTX_W - ctxFilled)

  const keys = ctrlDPending ? "Ctrl-D again to exit" : isCompacting ? "compacting..." : "esc quit"

  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      <Text color="$muted" wrap="truncate">
        {elapsedStr}
        {"  "}
        {keys}
      </Text>
      <Text color={ctxPct > 80 ? ctxColor : "$muted"} wrap="truncate">
        ctx {ctxBar} {ctxPct}%{"  "}
        {cost}
      </Text>
    </Box>
  )
}

function CompactingOverlay(): JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="$warning" paddingX={1} overflow="hidden">
      <Text color="$warning" bold>
        <Spinner type="arc" /> Compacting context
      </Text>
      <Text> </Text>
      <Text color="$muted">Freezing messages into terminal scrollback. Scroll up to review.</Text>
    </Box>
  )
}

function ThinkingBlock({ text, done }: { text: string; done: boolean }): JSX.Element {
  if (done)
    return (
      <Text color="$muted" italic>
        {"▸ thought"}
      </Text>
    )
  return (
    <Text color="$muted" wrap="truncate" italic>
      {text}
    </Text>
  )
}

function ToolCallBlock({ call, phase }: { call: ToolCall; phase: "pending" | "running" | "done" }): JSX.Element {
  const color = TOOL_COLORS[call.tool] ?? "$muted"

  return (
    <Box flexDirection="column">
      <Text>
        {phase === "running" ? (
          <>
            <Spinner type="dots" />{" "}
          </>
        ) : phase === "done" ? (
          <Text color="$success">{"✓ "}</Text>
        ) : (
          <Text color="$muted">{"○ "}</Text>
        )}
        <Text color={color} bold>
          {call.tool}
        </Text>{" "}
        {call.tool === "Bash" || call.tool === "Grep" || call.tool === "Glob" ? (
          <Text color="$muted">{call.args}</Text>
        ) : (
          <Link href={`file://${call.args}`}>{call.args}</Link>
        )}
      </Text>
      {phase === "done" && (
        <Box flexDirection="column" paddingLeft={2}>
          {call.output.map((line, i) => {
            if (line.startsWith("+")) return <LinkifiedLine key={i} text={line} color="$success" />
            if (line.startsWith("-")) return <LinkifiedLine key={i} text={line} color="$error" />
            return <LinkifiedLine key={i} text={line} />
          })}
        </Box>
      )}
    </Box>
  )
}

function LinkifiedLine({ text, dim, color }: { text: string; dim?: boolean; color?: string }): JSX.Element {
  const parts: JSX.Element[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  URL_RE.lastIndex = 0
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <Text key={`t${lastIndex}`} dim={dim} color={color}>
          {text.slice(lastIndex, match.index)}
        </Text>,
      )
    }
    const url = match[0]
    parts.push(
      <Link key={`l${match.index}`} href={url} dim={dim}>
        {url}
      </Link>,
    )
    lastIndex = match.index + url.length
  }
  if (lastIndex < text.length) {
    parts.push(
      <Text key={`t${lastIndex}`} dim={dim} color={color}>
        {text.slice(lastIndex)}
      </Text>,
    )
  }
  if (parts.length === 0) {
    return (
      <Text dim={dim} color={color}>
        {text}
      </Text>
    )
  }
  return <Text>{parts}</Text>
}

// ── View-local hooks ─────────────────────────────────────────
// These are view concerns — not model state.
// Era 2: these would be replaced by runtime-provided signals from @silvery/ag-term
// (app.focused, scope.interval(), app.now) composed with computed() from @silvery/signals.

function usePulse(ms = 400): boolean {
  const [val, setVal] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setVal((v) => !v), ms)
    return () => clearInterval(id)
  }, [ms])
  return val
}

function useElapsed(): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  return elapsed
}

// ── Helpers ──────────────────────────────────────────────────

function splitTitleBody(content: string): { title: string; body: string } {
  const match = content.match(/^(.+?[.!?])\s+(.+)$/s)
  if (match && match[1]!.length <= 40) return { title: match[1]!, body: match[2]! }
  if (content.length <= 40) return { title: content, body: "" }
  return { title: "", body: content }
}
