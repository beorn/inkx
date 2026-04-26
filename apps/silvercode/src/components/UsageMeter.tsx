/**
 * UsageMeter family — token / cost UI aligned to ACP's SessionUpdate
 * `usage_update` shape.
 *
 * Components:
 *   <UsageMeter>       — slim horizontal progress bar (used/size with %)
 *   <UsageBreakdown>   — collapsible popover with per-category token counts
 *   <UsageMetrics>     — inline chip: cost + latency, right-aligned label
 *
 * All consume the `UsageUpdate` type from `@km/agent-harness` (silvercode's
 * canonical ACP-shaped types), which maps directly to the ACP
 * `SessionUpdate.usage_update` wire payload.
 *
 * Bead: km-silvercode.acp-usage-and-permission (Part A).
 */
import React, { useState } from "react"
import { Accordion, AnimatedNumber, Box, Muted, ProgressBar, Text } from "silvery"
import type { UsageUpdate } from "@km/agent-harness"

// ---------------------------------------------------------------------------
// UsageMeter — slim context-window progress bar
// ---------------------------------------------------------------------------

export interface UsageMeterProps {
  usage: UsageUpdate
  /**
   * Width of the progress bar in columns. Defaults to 20.
   * The percentage label is always appended to the right.
   */
  width?: number
}

/**
 * A single-line context-window bar: `[████░░░░] 42%`.
 *
 * Colour shifts from `$success` → `$warning` → `$error` as the window fills.
 */
export function UsageMeter({ usage, width = 20 }: UsageMeterProps): React.ReactElement {
  const pct = usage.size > 0 ? Math.min(1, usage.used / usage.size) : 0
  const color = pct > 0.85 ? "$error" : pct > 0.6 ? "$warning" : "$success"

  return (
    <Box flexDirection="row" gap={1} alignItems="center">
      <ProgressBar value={pct} width={width} color={color} />
      <Muted>{Math.round(pct * 100)}%</Muted>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// UsageBreakdown — collapsible token attribution accordion
// ---------------------------------------------------------------------------

export interface UsageBreakdownRow {
  label: string
  tokens: number
}

export interface UsageBreakdownProps {
  usage: UsageUpdate
  /**
   * Per-category breakdown rows (message tokens, tool tokens, system tokens,
   * etc.). When omitted the accordion renders only the used/size totals.
   */
  rows?: UsageBreakdownRow[]
  /** Whether the breakdown starts expanded. Defaults to false. */
  defaultExpanded?: boolean
}

/**
 * Collapsible accordion that shows token attribution by category.
 * The header is a `<UsageMeter>` inline so the bar is always visible.
 */
export function UsageBreakdown({ usage, rows = [], defaultExpanded = false }: UsageBreakdownProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const titleNode = (
    <Box flexDirection="row" gap={1} alignItems="center">
      <UsageMeter usage={usage} width={16} />
      <Muted>
        <AnimatedNumber value={usage.used} duration={300} /> / {usage.size.toLocaleString()} tokens
      </Muted>
    </Box>
  )

  return (
    <Accordion title={titleNode as unknown as string} expanded={expanded} onToggle={setExpanded}>
      <Box flexDirection="column" paddingLeft={2} gap={0}>
        {rows.map((row) => (
          <Box key={row.label} flexDirection="row" gap={1}>
            <Muted>{row.label}</Muted>
            <AnimatedNumber value={row.tokens} duration={300} color="$primary" />
          </Box>
        ))}
        {rows.length === 0 && (
          <Box flexDirection="row" gap={1}>
            <Muted>Used</Muted>
            <AnimatedNumber value={usage.used} duration={300} color="$primary" />
          </Box>
        )}
      </Box>
    </Accordion>
  )
}

// ---------------------------------------------------------------------------
// UsageMetrics — inline cost + latency chip
// ---------------------------------------------------------------------------

export interface UsageMetricsProps {
  usage: UsageUpdate
  /**
   * Turn latency in milliseconds. When provided, renders a `Xms` or `Xs`
   * label after the cost.
   */
  latencyMs?: number
}

/**
 * Compact right-aligned chip: `$0.012 · 1.4s`. Renders nothing when both
 * cost and latency are absent.
 */
export function UsageMetrics({ usage, latencyMs }: UsageMetricsProps): React.ReactElement | null {
  const parts: string[] = []

  if (usage.cost) {
    const { amount, currency } = usage.cost
    const symbol = currency === "USD" ? "$" : `${currency} `
    parts.push(`${symbol}${amount.toFixed(4)}`)
  }

  if (latencyMs !== undefined) {
    parts.push(latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(1)}s`)
  }

  if (parts.length === 0) return null

  return <Muted>{parts.join(" · ")}</Muted>
}

// ---------------------------------------------------------------------------
// StructuredQuestion / StructuredAnswer — silvercode extension for mid-turn
// structured questions (beyond binary permission allow/deny).
// ---------------------------------------------------------------------------

export interface StructuredQuestionOption {
  id: string
  label: string
  description?: string
}

export interface StructuredQuestionProps {
  /** The question text posed to the user. */
  question: string
  /**
   * When provided, renders as a multi-choice list. When omitted, the
   * question is free-text and the answer is expected via a TextInput (parent
   * component responsibility).
   */
  options?: StructuredQuestionOption[]
  /** Currently highlighted option index. Only relevant with `options`. */
  highlightedIndex?: number
}

/**
 * Renders the agent's mid-turn question in a bordered card.
 *
 * For free-text questions: shows the question text + a hint that the user
 * should type their answer in the prompt composer below.
 *
 * For multi-choice questions: renders the options list inline. The parent
 * owns navigation state and passes `highlightedIndex`.
 */
export function StructuredQuestion({
  question,
  options,
  highlightedIndex = 0,
}: StructuredQuestionProps): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="$info" padding={1} gap={1}>
      <Text bold color="$info">
        {question}
      </Text>
      {options && options.length > 0 ? (
        <Box flexDirection="column">
          {options.map((opt, i) => (
            <Box key={opt.id} flexDirection="row" gap={1}>
              <Text color={i === highlightedIndex ? "$primary" : "$muted"}>{i === highlightedIndex ? "▶" : " "}</Text>
              <Box flexDirection="column">
                <Text color={i === highlightedIndex ? "$primary" : undefined}>{opt.label}</Text>
                {opt.description && <Muted>{opt.description}</Muted>}
              </Box>
            </Box>
          ))}
          <Muted>↑↓ navigate · Enter = select · Esc = skip</Muted>
        </Box>
      ) : (
        <Muted>Type your answer below and press Enter.</Muted>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------

export interface StructuredAnswerProps {
  /** The original question text. */
  question: string
  /** The user's answer — free text or the selected option label. */
  answer: string
}

/**
 * Renders the user's answer back inline after submission, giving the
 * conversation a clear record of what was decided.
 */
export function StructuredAnswer({ question, answer }: StructuredAnswerProps): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="$border" padding={1} gap={0}>
      <Muted>{question}</Muted>
      <Text bold>{answer}</Text>
    </Box>
  )
}
