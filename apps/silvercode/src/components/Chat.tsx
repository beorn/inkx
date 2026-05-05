import React from "react"
import { Box, Prose, Text } from "silvery"
import { buildTextAnalysis, shrinkwrapWidth } from "@silvery/ag-term/pipeline/pretext"
import { Content, useContentLayout } from "./Content.tsx"
import { MarkdownView } from "./MarkdownView.tsx"
import { SessionEntry } from "./SessionEntry.tsx"
import { TurnActivitySummary, type TurnActivitySummaryItem } from "./TurnActivitySummary.tsx"
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
          >
            <Prose width="100%" flexGrow={1} flexShrink={1} minWidth={0}>
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
        <Prose flexGrow={1}>
          <Text color="$muted" wrap="wrap">
            {text}
          </Text>
        </Prose>
      </SessionEntry>
    )
  }
  return (
    <SessionEntry marker={marker} markerColor="$fg" width={hasTable ? "100%" : "90%"}>
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
  items: TurnActivitySummaryItem[]
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
    <TurnActivitySummary
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
