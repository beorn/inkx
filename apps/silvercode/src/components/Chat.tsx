import React from "react"
import { Box, Prose, Text, useHover } from "silvery"
import type { AgentPlan, AgentPlanEntry } from "@km/agent-harness"
import type { SessionInfo } from "../cross-agent-state.ts"
import { buildTextAnalysis, shrinkwrapWidth } from "@silvery/ag-term/pipeline/pretext"
import { Content, useContentLayout } from "./Content.tsx"
import { MarkdownView } from "./MarkdownView.tsx"
import { SessionEntry } from "./SessionEntry.tsx"
import { StatusGlyph } from "./StatusGlyph.tsx"
import { ChatMessageSummary, type ChatMessageSummaryItem } from "./ChatMessageSummary.tsx"
import { BlockInteraction, safeJson } from "./BlockInteraction.tsx"
import { parseBlocks, type MdBlock } from "../markdown.ts"

type LaneWidth = "prose" | "wide" | "full" | "auto"

function Pane({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
      {children}
    </Box>
  )
}

function Header({ children }: { children?: React.ReactNode }): React.ReactElement {
  return <>{children}</>
}

function Session({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Content.Layout>{children}</Content.Layout>
}

function Metadata({ children }: { children: React.ReactNode }): React.ReactElement {
  return <>{children}</>
}

function Notification({ children }: { children: React.ReactNode }): React.ReactElement {
  return <>{children}</>
}

function Composer({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Content.Row>
      <Content.Body width="auto">{children}</Content.Body>
    </Content.Row>
  )
}

function planEntryLabel(entry: AgentPlanEntry): string {
  return entry.status === "in_progress" ? (entry.activeForm ?? entry.content) : entry.content
}

function planCounts(plan: AgentPlan): { pending: number; active: number; completed: number; cancelled: number } {
  let pending = 0
  let active = 0
  let completed = 0
  let cancelled = 0
  for (const entry of plan.entries) {
    if (entry.status === "completed") completed++
    else if (entry.status === "cancelled") cancelled++
    else if (entry.status === "in_progress") active++
    else pending++
  }
  return { pending, active, completed, cancelled }
}

function planEntryMarker(entry: AgentPlanEntry): { glyph: string; color?: string; active: boolean } {
  if (entry.status === "completed") return { glyph: "✓", color: "$muted", active: false }
  if (entry.status === "cancelled") return { glyph: "×", color: "$muted", active: false }
  if (entry.status === "in_progress") return { glyph: "□", color: "$warning", active: true }
  return { glyph: "□", color: undefined, active: false }
}

function planHasOpenEntries(plan: AgentPlan): boolean {
  return plan.entries.some((entry) => entry.status === "in_progress" || entry.status === "pending")
}

function orderedPlanEntries(plan: AgentPlan): AgentPlanEntry[] {
  const order = (entry: AgentPlanEntry): number => {
    if (entry.status === "in_progress") return 0
    if (entry.status === "pending") return 1
    if (entry.status === "completed") return 2
    return 3
  }
  return [...plan.entries].sort((a, b) => order(a) - order(b) || a.order - b.order)
}

function PlanDrawer({
  plan,
  defaultExpanded = true,
}: {
  plan: AgentPlan | null | undefined
  defaultExpanded?: boolean
}): React.ReactElement | null {
  const [expanded, setExpanded] = React.useState(defaultExpanded)
  const hover = useHover()
  if (!plan || plan.entries.length === 0) return null
  if (!planHasOpenEntries(plan)) return null
  const active = plan.entries.find((entry) => entry.status === "in_progress")
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- early return above guarantees entries.length > 0
  const next = active ?? plan.entries.find((entry) => entry.status === "pending") ?? plan.entries[0]!
  const counts = planCounts(plan)
  const headerMarker = planEntryMarker(next)
  const orderedEntries = orderedPlanEntries(plan)
  const collapseCompleted = counts.completed > 3
  const visibleEntries = collapseCompleted
    ? orderedEntries.filter((entry) => entry.status !== "completed")
    : orderedEntries
  const detailEntries = visibleEntries.filter((entry) => entry.id !== next.id)
  const footerText = collapseCompleted ? `+${counts.completed} completed` : ""

  return (
    <Content.Row>
      <Content.Body width="prose">
        <Box
          width="100%"
          minWidth={0}
          flexDirection="column"
          backgroundColor={hover.isHovered ? "$bg-surface-hover" : "$bg-surface-raised"}
          paddingLeft={1}
          paddingRight={2}
          paddingY={1}
          onClick={() => setExpanded((value) => !value)}
          onMouseEnter={hover.onMouseEnter}
          onMouseLeave={hover.onMouseLeave}
        >
          <Box flexDirection="row" gap={1} minWidth={0}>
            <Text color="$muted">{expanded ? "▾" : "▸"}</Text>
            <StatusGlyph
              glyph={headerMarker.glyph}
              active={headerMarker.active}
              color={headerMarker.color}
              period={1800}
            />
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Text wrap="truncate">{planEntryLabel(next)}</Text>
            </Box>
          </Box>
          {expanded && (detailEntries.length > 0 || footerText.length > 0) ? (
            <Box flexDirection="column" paddingLeft={2} minWidth={0}>
              {detailEntries.map((entry) => {
                const marker = planEntryMarker(entry)
                const color = entry.status === "completed" || entry.status === "cancelled" ? "$muted" : undefined
                return (
                  <Box key={entry.id} flexDirection="row" gap={1} minWidth={0}>
                    <StatusGlyph
                      glyph={marker.glyph}
                      active={marker.active}
                      color={marker.color ?? color}
                      period={1800}
                    />
                    <Box flexGrow={1} flexShrink={1} minWidth={0}>
                      <Text color={color} strikethrough={entry.status === "completed" ? true : undefined} wrap="wrap">
                        {planEntryLabel(entry)}
                      </Text>
                    </Box>
                  </Box>
                )
              })}
              {footerText.length > 0 ? (
                <Box flexDirection="row" gap={1} minWidth={0}>
                  <Text color="$muted"> </Text>
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Text color="$muted" wrap="wrap">
                      {footerText}
                    </Text>
                  </Box>
                </Box>
              ) : null}
            </Box>
          ) : null}
        </Box>
      </Content.Body>
    </Content.Row>
  )
}

const ACTIVE_AGENT_STATE = "thinking"

function agentStatusColor(status: SessionInfo["status"]): string {
  if (status === ACTIVE_AGENT_STATE) return "$warning"
  if (status === "waiting") return "$info"
  if (status === "ended") return "$muted"
  return "$success"
}

function agentStatusGlyph(status: SessionInfo["status"]): string {
  if (status === ACTIVE_AGENT_STATE) return "●"
  if (status === "waiting") return "?"
  if (status === "ended") return "×"
  return "○"
}

export type AgentDrawerMetrics = {
  readonly elapsedMs?: number
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly costUsd?: number
}

export type AgentDrawerMetadata = {
  readonly model?: string
  readonly account?: string
  readonly cwd?: string
  readonly subagentType?: string
  readonly prompt?: string
  readonly tools?: number
  readonly mcpServers?: number
  readonly slashCommands?: number
  readonly skills?: number
  readonly plugins?: number
}

export type AgentDrawerSubagent = {
  readonly id: string
  readonly label: string
  readonly detail?: string
  readonly status?: "running" | "done"
  readonly metrics?: AgentDrawerMetrics
  readonly metadata?: AgentDrawerMetadata
  readonly raw?: unknown
}

export type AgentDrawerSession = SessionInfo & {
  readonly metrics?: AgentDrawerMetrics
  readonly metadata?: AgentDrawerMetadata
  readonly raw?: unknown
}

function AgentDrawerRow({
  marker,
  markerColor,
  active = false,
  children,
  payload,
}: {
  marker: string
  markerColor: string
  active?: boolean
  children: React.ReactNode
  payload: unknown
}): React.ReactElement {
  return (
    <BlockInteraction
      detail={safeJson(payload)}
      language="json"
      maxWidth={90}
      canExpand={false}
      hoverBackground={false}
    >
      {({ surfaceProps, isHovered }) => {
        const rowBg = isHovered ? "$bg-surface-hover" : "$bg-surface-raised"
        return (
          <Box {...surfaceProps} flexDirection="row" gap={1} minWidth={0} backgroundColor={rowBg}>
            <StatusGlyph glyph={marker} active={active} color={markerColor} period={1800} backgroundColor={rowBg} />
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
              {children}
            </Box>
          </Box>
        )
      }}
    </BlockInteraction>
  )
}

function AgentsDrawer({
  sessions,
  selfSessionId,
  subagents = [],
  defaultExpanded = false,
}: {
  sessions: readonly AgentDrawerSession[] | null | undefined
  selfSessionId?: string
  subagents?: readonly AgentDrawerSubagent[]
  defaultExpanded?: boolean
}): React.ReactElement | null {
  const activeSessions = (sessions ?? []).filter((session) => session.status !== "ended")
  const hasLiveSubagent = subagents.some((agent) => agent.status !== "done")
  const visibleSubagents = hasLiveSubagent ? subagents : []
  const [expanded, setExpanded] = React.useState(defaultExpanded)
  const hover = useHover()
  const total = activeSessions.length + visibleSubagents.length
  React.useEffect(() => {
    if (total > 1) setExpanded(true)
  }, [total])
  if (total <= 1) return null
  const running =
    activeSessions.filter((session) => session.status === ACTIVE_AGENT_STATE || session.status === "waiting").length +
    visibleSubagents.filter((agent) => agent.status !== "done").length
  const label = running > 0 ? `${running}/${total} active` : `${total} idle`

  return (
    <Content.Row>
      <Content.Body width="prose">
        <Box
          width="100%"
          minWidth={0}
          flexDirection="column"
          backgroundColor={hover.isHovered ? "$bg-surface-hover" : "$bg-surface-raised"}
          paddingLeft={1}
          paddingRight={2}
          paddingY={1}
          onClick={() => setExpanded((value) => !value)}
          onMouseEnter={hover.onMouseEnter}
          onMouseLeave={hover.onMouseLeave}
        >
          <Box flexDirection="row" gap={1} minWidth={0}>
            <Text color="$muted">{expanded ? "▾" : "▸"}</Text>
            <Text color="$muted">Agents</Text>
            <Box flexGrow={1} />
            <Text color="$muted">{label}</Text>
          </Box>
          {expanded ? (
            <Box flexDirection="column" paddingLeft={2} minWidth={0}>
              {activeSessions.map((session) => {
                const self = session.sessionId === selfSessionId
                const color = agentStatusColor(session.status)
                return (
                  <AgentDrawerRow
                    key={session.sessionId}
                    marker={agentStatusGlyph(session.status)}
                    markerColor={color}
                    active={session.status === ACTIVE_AGENT_STATE || session.status === "waiting"}
                    payload={{ kind: "session", ...session, self }}
                  >
                    <Text wrap="truncate">{session.name}</Text>
                  </AgentDrawerRow>
                )
              })}
              {visibleSubagents.map((agent) => (
                <AgentDrawerRow
                  key={agent.id}
                  marker={agent.status === "done" ? "✓" : "●"}
                  markerColor={agent.status === "done" ? "$muted" : "$warning"}
                  active={agent.status !== "done"}
                  payload={{ kind: "subagent", ...agent, raw: agent.raw ?? agent }}
                >
                  <Text wrap="truncate">{agent.label}</Text>
                </AgentDrawerRow>
              ))}
            </Box>
          ) : null}
        </Box>
      </Content.Body>
    </Content.Row>
  )
}

function MessageGroup({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1} flexShrink={0} minWidth={0}>
      {children}
    </Box>
  )
}

const USER_BUBBLE_PADDING_X = 2
const USER_BUBBLE_HORIZONTAL_CHROME = USER_BUBBLE_PADDING_X * 2
const USER_PROMPT_BUBBLE_BG = "$bg-surface-raised"

function shrinkTextMeasure(text: string, maxWidth: number): number {
  const cap = Math.max(1, maxWidth)
  if (text.length === 0) return 0
  return Math.max(1, shrinkwrapWidth(buildTextAnalysis(text), cap))
}

function userBlockVisualWidth(block: MdBlock, maxInnerWidth: number): number {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "quote":
      return shrinkTextMeasure(block.text, maxInnerWidth)
    case "bullet": {
      const markerWidth = block.depth * 2 + 2
      return markerWidth + shrinkTextMeasure(block.text, maxInnerWidth - markerWidth)
    }
    case "ordered": {
      const markerWidth = block.depth * 2 + `${block.number}.`.length + 1
      return markerWidth + shrinkTextMeasure(block.text, maxInnerWidth - markerWidth)
    }
    case "code":
      return Math.min(
        maxInnerWidth,
        Math.max(block.language.length, ...block.code.split("\n").map((line) => line.length)),
      )
    case "table":
      return maxInnerWidth
    case "rule":
    case "blank":
      return 0
  }
}

function userBubbleWidthForText(text: string, maxBubbleWidth: number): number {
  const maxInnerWidth = Math.max(1, maxBubbleWidth - USER_BUBBLE_HORIZONTAL_CHROME)
  const blocks = parseBlocks(text)
  const visualWidth =
    blocks.length > 0
      ? Math.max(1, ...blocks.map((block) => userBlockVisualWidth(block, maxInnerWidth)))
      : Math.max(1, ...text.split("\n").map((line) => line.length))
  return Math.max(1, Math.min(maxBubbleWidth, visualWidth + USER_BUBBLE_HORIZONTAL_CHROME))
}

function Prompt({
  text,
  additionalContext,
  showDebug,
}: {
  text: string
  additionalContext?: string
  showDebug?: boolean
}): React.ReactElement {
  const hasContext = (additionalContext?.length ?? 0) > 0
  const isMetaOnly = text.length === 0 && hasContext
  const lineCount = additionalContext ? additionalContext.split("\n").length : 0
  const content = useContentLayout()
  const maxBubbleWidth = Math.max(1, Math.min(58, Math.floor(content.measure * 0.8)))
  const bubbleWidth = userBubbleWidthForText(text, maxBubbleWidth)
  const innerBubbleWidth = Math.max(1, bubbleWidth - USER_BUBBLE_HORIZONTAL_CHROME)

  return (
    <Box flexDirection="column" alignSelf="stretch" width="100%" flexShrink={1} minWidth={0} paddingY={0}>
      {!isMetaOnly && (
        <Box flexDirection="column" width="100%" flexShrink={1} minWidth={0}>
          <Box
            key={`${content.available}:${bubbleWidth}`}
            flexDirection="row"
            alignSelf="flex-end"
            width={bubbleWidth}
            maxWidth={maxBubbleWidth}
            flexShrink={0}
            minWidth={0}
            backgroundColor={USER_PROMPT_BUBBLE_BG}
            paddingY={1}
          >
            <Box
              width={USER_BUBBLE_PADDING_X}
              flexShrink={0}
              backgroundColor={USER_PROMPT_BUBBLE_BG}
              userSelect="none"
            />
            <Prose
              width={innerBubbleWidth}
              flexGrow={1}
              flexShrink={1}
              minWidth={0}
              backgroundColor={USER_PROMPT_BUBBLE_BG}
              userSelect="text"
            >
              <MarkdownView source={text} role="user" layout="inline" backgroundColor={USER_PROMPT_BUBBLE_BG} />
            </Prose>
            <Box
              width={USER_BUBBLE_PADDING_X}
              flexShrink={0}
              backgroundColor={USER_PROMPT_BUBBLE_BG}
              userSelect="none"
            />
          </Box>
        </Box>
      )}
      {hasContext && (
        <Box flexDirection="column" flexShrink={1} minWidth={0}>
          <Text color="$muted">
            {lineCount} line{lineCount === 1 ? "" : "s"} of hidden context (run `/debug` to toggle)
          </Text>
          {showDebug && (
            <Box flexDirection="column" flexShrink={1} minWidth={0}>
              <Text color="$muted" wrap="wrap">
                {additionalContext}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

function Block({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="column" flexShrink={0} minWidth={0}>
      {children}
    </Box>
  )
}

function hasCodeMarkdownBlock(text: string): boolean {
  return parseBlocks(text).some((block) => block.kind === "code")
}

function hasTableMarkdownBlock(text: string): boolean {
  return parseBlocks(text).some((block) => block.kind === "table")
}

type MarkdownPart = { kind: "text" | "table"; source: string }

function splitMarkdownTables(source: string): MarkdownPart[] {
  const lines = source.split("\n")
  const parts: MarkdownPart[] = []
  let textRun: string[] = []
  const flushText = (): void => {
    const source = textRun.join("\n").trim()
    if (source.length > 0) parts.push({ kind: "text", source })
    textRun = []
  }
  for (let i = 0; i < lines.length; ) {
    const line = lines[i] ?? ""
    const next = lines[i + 1] ?? ""
    if (looksLikeTableHeader(line, next)) {
      flushText()
      const tableRun = [line, next]
      i += 2
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i] ?? "")) {
        tableRun.push(lines[i] ?? "")
        i++
      }
      parts.push({ kind: "table", source: tableRun.join("\n") })
      continue
    }
    textRun.push(line)
    i++
  }
  flushText()
  return parts
}

function looksLikeTableHeader(line: string, next: string): boolean {
  if (!/^\s*\|.*\|\s*$/.test(line)) return false
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next)
}

function Message({
  text,
  marker = "•",
  muted = false,
}: {
  text: string
  marker?: React.ReactNode
  muted?: boolean
}): React.ReactElement {
  const hasCode = hasCodeMarkdownBlock(text)
  const hasTable = hasTableMarkdownBlock(text)
  const layout = hasTable ? "content" : "inline"
  if (muted) {
    return (
      <SessionEntry marker={marker} markerColor="$muted">
        <Prose flexGrow={1} minWidth={0} maxWidth="100%">
          <Text color="$muted" wrap="wrap" minWidth={0} maxWidth="100%">
            {text}
          </Text>
        </Prose>
      </SessionEntry>
    )
  }
  if (hasTable) {
    const parts = splitMarkdownTables(text)
    return (
      <Box flexDirection="column" width="100%" minWidth={0}>
        {parts.map((part, index) =>
          part.kind === "table" ? (
            <MarkdownView key={index} source={part.source} layout={layout} />
          ) : (
            <Content.Prose key={index}>
              <SessionEntry marker={index === 0 ? marker : " "} markerColor="$fg" width="100%">
                <Prose flexGrow={1} minWidth={0}>
                  <MarkdownView source={part.source} layout="content" inlineProse />
                </Prose>
              </SessionEntry>
            </Content.Prose>
          ),
        )}
      </Box>
    )
  }
  return (
    <SessionEntry marker={marker} markerColor="$fg">
      <Prose flexGrow={1} minWidth={0}>
        <MarkdownView source={text} layout={layout} />
      </Prose>
    </SessionEntry>
  )
}

function Thought({ text, marker = "·" }: { text: string; marker?: React.ReactNode }): React.ReactElement {
  return <Message text={text} marker={marker} muted />
}

function Activity({
  items,
  timestamp,
  details,
  livePreview,
  defaultExpanded,
  width = "prose",
  naturalWidth,
  onDisclosureToggle,
  onExpandedChange,
}: {
  items: ChatMessageSummaryItem[]
  timestamp?: string
  details?: React.ReactNode
  livePreview?: React.ReactNode
  defaultExpanded?: boolean
  width?: "prose" | "wide" | "auto"
  naturalWidth?: number
  onDisclosureToggle?: () => void
  onExpandedChange?: (expanded: boolean) => void
}): React.ReactElement {
  return (
    <ChatMessageSummary
      items={items}
      timestamp={timestamp}
      details={details}
      livePreview={livePreview}
      defaultExpanded={defaultExpanded}
      width={width}
      naturalWidth={naturalWidth}
      onDisclosureToggle={onDisclosureToggle}
      onExpandedChange={onExpandedChange}
    />
  )
}

function Tool({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="column" gap={0} alignSelf="stretch" width="100%" minWidth={0}>
      {children}
    </Box>
  )
}

function Summary({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="column" minWidth={0}>
      {children}
    </Box>
  )
}

function Stats({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Text color="$muted" wrap="wrap">
      {children}
    </Text>
  )
}

function Body({ width = "prose", children }: { width?: LaneWidth; children: React.ReactNode }): React.ReactElement {
  return <Content.Body width={width}>{children}</Content.Body>
}

export const Chat = {
  Pane,
  Header,
  Session,
  Metadata,
  Notification,
  Composer,
  PlanDrawer,
  AgentsDrawer,
  Body,
  MessageGroup,
  Message,
  Prompt,
  Block,
  Thought,
  Activity,
  Tool,
  Summary,
  Stats,
}
