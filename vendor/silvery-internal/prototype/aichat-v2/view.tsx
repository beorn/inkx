/**
 * Chat view — pure rendering + signal reads.
 *
 * All state mutations go through invoke(). View-local concerns
 * (pulse animation, elapsed timer) live in hooks, not the model.
 */

import React, { useState, useEffect, useCallback } from "react"
import { Box, Text, Link, Spinner, ScrollbackList, TextInput, useTerminalFocused } from "@silvery/react"
import { useInput, useExit, type Key } from "@silvery/term/runtime"
import { useSignal, type Signal } from "./signal.js"
import { useChat, formatTokens, formatCost, computeCumulativeTokens } from "./model.js"
import { invoke, type Mapping } from "./app.js"
import type { Exchange, ToolCall } from "./types.js"
import {
  TOOL_COLORS,
  URL_RE,
  RANDOM_USER_COMMANDS,
  CONTEXT_WINDOW,
} from "../../../silvery/examples/interactive/aichat/script.js"

// ============================================================================
// ChatView — top-level component
// ============================================================================

export function ChatView({
  autoStart,
  keys,
  ctrlDPending,
}: {
  autoStart: boolean
  keys?: Mapping<string>
  ctrlDPending?: Signal<boolean>
}): JSX.Element {
  const exit = useExit()
  const chat = useChat.get()
  const exchanges = useSignal(chat.exchanges)
  const isDone = useSignal(chat.done)
  const isCompacting = useSignal(chat.compacting)

  useEffect(() => chat.advance(), [chat])

  // Auto-exit in auto mode
  useEffect(() => {
    if (!autoStart || !isDone) return
    const timer = setTimeout(exit, 1000)
    return () => clearTimeout(timer)
  }, [autoStart, isDone, exit])

  // All key dispatch goes through keymap → invoke()
  useInput((input: string, key: Key) => {
    const keyStr = normalizeKey(input, key)
    const inv = keys?.(keyStr)
    if (inv) invoke(inv)
  })

  return (
    <Box flexDirection="column" paddingX={1}>
      <ScrollbackList
        items={exchanges}
        keyExtractor={(ex) => ex.id}
        markers={true}
        footer={<DemoFooter ctrlDPending={ctrlDPending} />}
      >
        {(exchange, index) => {
          const isLatest = index === exchanges.length - 1
          return (
            <Box flexDirection="column">
              {index > 0 && <Text> </Text>}
              {isCompacting && isLatest && <CompactingOverlay />}
              {isDone && autoStart && isLatest && <SessionComplete />}
              <ExchangeItem exchange={exchange} isLatest={isLatest} />
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

const AUTO_SUBMIT_DELAY = 10_000

export function DemoFooter({ ctrlDPending }: { ctrlDPending?: Signal<boolean> }): JSX.Element {
  const chat = useChat.get()
  const terminalFocused = useTerminalFocused()
  const isDone = useSignal(chat.done)
  const chatPhase = useSignal(chat.phase)
  const isCompacting = useSignal(chat.compacting)
  const autoText = useSignal(chat.autoTypingText)
  const pending = ctrlDPending ? useSignal(ctrlDPending) : false
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

  // Auto-submit after idle delay (demo behavior)
  useEffect(() => {
    if (
      isDone ||
      isCompacting ||
      chatPhase !== "idle" ||
      !effectiveMessage ||
      inputText ||
      autoText ||
      !terminalFocused
    )
      return
    const timer = setTimeout(
      () => invoke({ command: chat.commands.submit, args: { text: effectiveMessage } }),
      AUTO_SUBMIT_DELAY,
    )
    return () => clearTimeout(timer)
  }, [isDone, isCompacting, chatPhase, effectiveMessage, inputText, autoText, chat, terminalFocused])

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
          <TextInput
            value={displayText}
            onChange={autoText ? () => {} : setInputText}
            onSubmit={handleSubmit}
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
// ExchangeItem
// ============================================================================

export function ExchangeItem({ exchange, isLatest }: { exchange: Exchange; isLatest: boolean }): JSX.Element {
  const chat = useChat.get()
  const chatPhase = useSignal(chat.phase)
  const streamContent = useSignal(chat.currentContent)
  const toolIdx = useSignal(chat.activeToolIndex)
  const pulseVal = usePulse()

  const phase = isLatest ? chatPhase : ("idle" as const)
  const displayContent = isLatest && chatPhase === "streaming" ? streamContent : exchange.content

  if (exchange.role === "system") {
    return (
      <Box flexDirection="column">
        <Text> </Text>
        <Text bold>AI Chat</Text>
        <Text> </Text>
        <Text color="$muted">{exchange.content}</Text>
        <Text> </Text>
      </Box>
    )
  }

  if (exchange.role === "user") {
    return (
      <Box paddingX={1} flexDirection="row" backgroundColor="$surface-bg">
        <Text bold color="$focusring">
          {"❯"}{" "}
        </Text>
        <Box flexShrink={1}>
          <Text>{exchange.content}</Text>
        </Box>
      </Box>
    )
  }

  const toolCalls = exchange.toolCalls ?? []
  const toolRevealCount = phase === "tools" || phase === "idle" ? toolCalls.length : 0
  const hasOperations = toolCalls.length > 0 || !!exchange.thinking

  const metaParts: string[] = []
  if (exchange.tokens && phase === "idle") metaParts.push(`${formatTokens(exchange.tokens.output)} tokens`)
  if (exchange.thinking && (phase === "idle" || phase === "streaming")) metaParts.push("thought for 1s")
  const metaStr = metaParts.length > 0 ? ` (${metaParts.join(" · ")})` : ""

  const { title, body } = splitTitleBody(exchange.content)
  const bulletColor = hasOperations ? "$success" : "$muted"
  const contentText = displayContent ? (title ? body || displayContent : displayContent) : ""
  const showCursor = phase === "streaming" && streamContent.length < exchange.content.length

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
        {exchange.thinking && (phase === "thinking" || phase === "streaming") && (
          <ThinkingBlock text={exchange.thinking} done={phase !== "thinking"} />
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
  const exchanges = useSignal(chat.exchanges)
  const isCompacting = useSignal(chat.compacting)
  const baseline = useSignal(chat.contextBaseline)

  const cumulative = computeCumulativeTokens(exchanges)
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
      <Text color="$muted">Freezing exchanges into terminal scrollback. Scroll up to review.</Text>
    </Box>
  )
}

function SessionComplete(): JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="$success" paddingX={1}>
      <Text color="$success" bold>
        {"✓"} Session complete
      </Text>
      <Text color="$muted">Scroll up to review — colors, borders, and hyperlinks preserved in scrollback.</Text>
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

function normalizeKey(input: string, key: Key): string {
  if (key.escape) return "escape"
  if (key.ctrl) return `ctrl+${input}`
  return input
}

function splitTitleBody(content: string): { title: string; body: string } {
  const match = content.match(/^(.+?[.!?])\s+(.+)$/s)
  if (match && match[1]!.length <= 40) return { title: match[1]!, body: match[2]! }
  if (content.length <= 40) return { title: content, body: "" }
  return { title: "", body: content }
}
