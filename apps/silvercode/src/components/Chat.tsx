import React from "react"
import { Box, Prose, Text, type PopoverContent, useHover } from "silvery"
import type { AgentPlan, AgentPlanEntry } from "@km/agent-harness"
import type { SessionInfo } from "../cross-agent-state.ts"
import { buildTextAnalysis, shrinkwrapWidth } from "@silvery/ag-term/pipeline/pretext"
import { Content, useContentLayout } from "./Content.tsx"
import { EntryDisclosure } from "./EntryDisclosure.tsx"
import { MarkdownView } from "./MarkdownView.tsx"
import { SessionEntry } from "./SessionEntry.tsx"
import { StatusGlyph } from "./StatusGlyph.tsx"
import { SyntaxHighlighter } from "./SyntaxHighlighter.tsx"
import { ChatMessageSummary, type ChatMessageSummaryItem } from "./ChatMessageSummary.tsx"
import { parseBlocks, type MdBlock } from "../markdown.ts"

type LaneWidth = "prose" | "wide" | "full" | "auto"

function Root({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
      {children}
    </Box>
  )
}

function Transcript({ children }: { children: React.ReactNode }): React.ReactElement {
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
  if (entry.status === "in_progress") return { glyph: "▸", color: "$warning", active: false }
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
  defaultExpanded = false,
}: {
  plan: AgentPlan | null | undefined
  defaultExpanded?: boolean
}): React.ReactElement | null {
  const [expanded, setExpanded] = React.useState(defaultExpanded)
  const hover = useHover()
  const content = useContentLayout()
  if (!plan || plan.entries.length === 0) return null
  if (!planHasOpenEntries(plan)) return null
  const active = plan.entries.find((entry) => entry.status === "in_progress")
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- early return at line 94 guarantees entries.length > 0
  const next = active ?? plan.entries.find((entry) => entry.status === "pending") ?? plan.entries[0]!
  const counts = planCounts(plan)
  const collapsedSummaryText = [
    counts.pending > 0 ? `${counts.pending} pending` : null,
    counts.completed > 0 ? `${counts.completed} completed` : null,
    counts.cancelled > 0 ? `${counts.cancelled} cancelled` : null,
  ]
    .filter((part): part is string => part != null)
    .join(" · ")
  const nextMarker = planEntryMarker(next)
  const orderedEntries = orderedPlanEntries(plan)
  const collapseCompleted = counts.completed > 3
  const visibleExpandedEntries = collapseCompleted
    ? orderedEntries.filter((entry) => entry.status !== "completed")
    : orderedEntries
  const expandedFooterText = collapseCompleted ? `+${counts.completed} completed` : ""
  const drawerWidth = Math.max(24, Math.floor(content.measure * 0.6))

  return (
    <Content.Row>
      <Content.Body width="prose">
        <Box width="100%" minWidth={0} flexDirection="row" justifyContent="flex-end">
          <Box
            width={drawerWidth}
            maxWidth="100%"
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
              {expanded ? (
                <Text color="$muted">Plan</Text>
              ) : (
                <>
                  <StatusGlyph
                    glyph={nextMarker.glyph}
                    active={nextMarker.active}
                    color={nextMarker.color}
                    period={1800}
                  />
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Text wrap="wrap">{planEntryLabel(next)}</Text>
                  </Box>
                </>
              )}
            </Box>
            {expanded || collapsedSummaryText.length > 0 ? (
              <Box flexDirection="column" paddingLeft={2} minWidth={0}>
                {expanded
                  ? visibleExpandedEntries.map((entry) => {
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
                            <Text
                              color={color}
                              strikethrough={entry.status === "completed" ? true : undefined}
                              wrap="wrap"
                            >
                              {planEntryLabel(entry)}
                            </Text>
                          </Box>
                        </Box>
                      )
                    })
                  : null}
                {expanded && expandedFooterText.length > 0 ? (
                  <Box flexDirection="row" gap={1} minWidth={0}>
                    <Text color="$muted"> </Text>
                    <Box flexGrow={1} flexShrink={1} minWidth={0}>
                      <Text color="$muted" wrap="wrap">
                        {expandedFooterText}
                      </Text>
                    </Box>
                  </Box>
                ) : null}
                {!expanded && collapsedSummaryText.length > 0 ? (
                  <Box flexDirection="row" gap={1} minWidth={0}>
                    <Text color="$muted"> </Text>
                    <Box flexGrow={1} flexShrink={1} minWidth={0}>
                      <Text color="$muted" wrap="wrap">
                        {collapsedSummaryText}
                      </Text>
                    </Box>
                  </Box>
                ) : null}
              </Box>
            ) : null}
          </Box>
        </Box>
      </Content.Body>
    </Content.Row>
  )
}

function agentStatusColor(status: SessionInfo["status"]): string {
  if (status === "thinking") return "$warning"
  if (status === "waiting") return "$info"
  if (status === "ended") return "$muted"
  return "$success"
}

function agentStatusGlyph(status: SessionInfo["status"]): string {
  if (status === "thinking") return "●"
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

export type AgentDrawerDiagnostic = {
  readonly kind: "subagent-count-mismatch"
  readonly claimed: number
  readonly observed: number
  readonly text: string
}

export type AgentDrawerSession = SessionInfo & {
  readonly metrics?: AgentDrawerMetrics
  readonly metadata?: AgentDrawerMetadata
  readonly raw?: unknown
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch (err) {
    return JSON.stringify(
      {
        error: "Unable to serialize agent detail payload",
        message: err instanceof Error ? err.message : String(err),
      },
      null,
      2,
    )
  }
}

function agentDetailPopover(payload: unknown): PopoverContent {
  return {
    body: <SyntaxHighlighter language="json" code={safeJson(payload)} bare />,
    maxWidth: 90,
    borderless: true,
    flushTop: true,
    anchorOffsetX: 10,
  }
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
    <EntryDisclosure popover={agentDetailPopover(payload)} canExpand={false}>
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
    </EntryDisclosure>
  )
}

function AgentsDrawer({
  sessions,
  selfSessionId,
  subagents = [],
  diagnostics = [],
  defaultExpanded = false,
}: {
  sessions: readonly AgentDrawerSession[] | null | undefined
  selfSessionId?: string
  subagents?: readonly AgentDrawerSubagent[]
  diagnostics?: readonly AgentDrawerDiagnostic[]
  defaultExpanded?: boolean
}): React.ReactElement | null {
  const activeSessions = (sessions ?? []).filter((session) => session.status !== "ended")
  const hasLiveSubagent = subagents.some((agent) => agent.status !== "done")
  const hasDiagnostics = diagnostics.length > 0
  const visibleSubagents = hasLiveSubagent || hasDiagnostics ? subagents : []
  const primaryDiagnostic = diagnostics[0]
  const missingSubagentRows = primaryDiagnostic
    ? Array.from({ length: Math.max(0, primaryDiagnostic.claimed - visibleSubagents.length) }, (_, index) => ({
        id: `missing-agent-event:${primaryDiagnostic.claimed}:${primaryDiagnostic.observed}:${index}`,
        label: `Missing Agent event #${index + 1}`,
        diagnostic: primaryDiagnostic,
      }))
    : []
  const [expanded, setExpanded] = React.useState(defaultExpanded)
  const hover = useHover()
  const total = activeSessions.length + visibleSubagents.length + missingSubagentRows.length + diagnostics.length
  React.useEffect(() => {
    if (total > 1) setExpanded(true)
  }, [total])
  if (total <= 1) return null
  const running =
    activeSessions.filter((session) => session.status === "thinking" || session.status === "waiting").length +
    visibleSubagents.filter((agent) => agent.status !== "done").length
  const label = primaryDiagnostic
    ? `${primaryDiagnostic.observed}/${primaryDiagnostic.claimed} observed`
    : running > 0
      ? `${running}/${total} active`
      : `${total} idle`

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
                    active={session.status === "thinking" || session.status === "waiting"}
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
              {missingSubagentRows.map((missing) => (
                <AgentDrawerRow
                  key={missing.id}
                  marker="!"
                  markerColor="$warning"
                  active={false}
                  payload={{ kind: "missing-subagent-event", diagnostic: missing.diagnostic, label: missing.label }}
                >
                  <Text color="$muted" wrap="truncate">
                    {missing.label}
                  </Text>
                </AgentDrawerRow>
              ))}
              {diagnostics.map((diagnostic, index) => (
                <AgentDrawerRow
                  key={`diagnostic-${index}-${diagnostic.claimed}-${diagnostic.observed}`}
                  marker="!"
                  markerColor="$warning"
                  active={false}
                  payload={{ kind: "diagnostic", diagnostic }}
                >
                  <Text wrap="truncate">
                    Only {diagnostic.observed} of {diagnostic.claimed} Agent events observed
                  </Text>
                </AgentDrawerRow>
              ))}
            </Box>
          ) : null}
        </Box>
      </Content.Body>
    </Content.Row>
  )
}

function TurnRoot({ children }: { children: React.ReactNode }): React.ReactElement {
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
            paddingX={USER_BUBBLE_PADDING_X}
            paddingY={1}
            userSelect="none"
          >
            <Prose width="100%" flexGrow={1} flexShrink={1} minWidth={0} userSelect="text">
              <MarkdownView source={text} role="user" layout="inline" />
            </Prose>
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

function Segment({ children }: { children: React.ReactNode }): React.ReactElement {
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

function Narration({
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
  const layout = hasCode || hasTable ? "content" : "inline"
  if (hasCode) {
    return (
      <Box flexDirection="column" position="relative" width="100%" maxWidth="100%" minWidth={0}>
        <Prose flexGrow={1} minWidth={0}>
          <MarkdownView source={text} layout="inline" />
        </Prose>
      </Box>
    )
  }
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

function ToolGroup({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="column" gap={0} minWidth={0}>
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
  Root,
  Transcript,
  Metadata,
  Notification,
  Composer,
  PlanDrawer,
  AgentsDrawer,
  Body,
  Turn: {
    Root: TurnRoot,
    Prompt,
    Segment,
    Narration,
    Activity,
    ToolGroup,
    Summary,
    Stats,
  },
}
