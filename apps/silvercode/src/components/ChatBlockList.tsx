import React from "react"
import { Box, ListView, Text, type ListViewHandle, type PopoverContent } from "silvery"
import type { ChatLeaf, ChatRawRef, ChatWidth } from "../chat/types.ts"
import { Chat } from "./Chat.tsx"
import { EntryDisclosure } from "./EntryDisclosure.tsx"
import { Content } from "./Content.tsx"
import { SessionEntry } from "./SessionEntry.tsx"
import { SyntaxHighlighter } from "./SyntaxHighlighter.tsx"

export type ChatBlockListProps = {
  leaves: readonly ChatLeaf[]
  activity?: React.ReactNode
  follow?: "end" | false
  viewportBottomInset?: number
  paddingTop?: number
  paddingBottom?: number
}

type ActivityItem = { __activity: true }
type PaddingItem = { __padding: true; id: string; height: number }
type Item = ChatLeaf | ActivityItem | PaddingItem

function isActivity(item: Item): item is ActivityItem {
  return (item as ActivityItem).__activity === true
}

function isPadding(item: Item): item is PaddingItem {
  return (item as PaddingItem).__padding === true
}

function listKey(item: Item, index: number): string {
  if (isActivity(item)) return "__activity"
  if (isPadding(item)) return `__padding:${item.id}:${item.height}`
  return item.id || `leaf:${index}`
}

function renderPadding(height: number): React.ReactNode {
  return (
    <Box flexDirection="column" flexShrink={0}>
      {Array.from({ length: height }, (_, i) => (
        <Text key={i}> </Text>
      ))}
    </Box>
  )
}

function contentWidth(width: ChatWidth): "prose" | "wide" | "full" {
  return width
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch (err) {
    return JSON.stringify(
      {
        error: "Unable to serialize detail payload",
        message: err instanceof Error ? err.message : String(err),
      },
      null,
      2,
    )
  }
}

function compactDetail(leaf: ChatLeaf): unknown {
  const base: Record<string, unknown> = {
    id: leaf.id,
    type: leaf.type,
    channel: leaf.channel,
    eventIds: leaf.eventIds,
    messageIds: leaf.messageIds,
    partIds: leaf.partIds,
    toolIds: leaf.toolIds,
    summary: leaf.summary,
    status: leaf.status,
    severity: leaf.severity,
    width: leaf.width,
    defaultDisclosure: leaf.defaultDisclosure,
    detailAccess: leaf.detailAccess,
    props: leaf.props,
    rawRefs: leaf.rawRefs,
  }
  return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined))
}

function detailPopover(code: string): PopoverContent {
  return {
    body: <SyntaxHighlighter language="json" code={code} bare />,
    maxWidth: 90,
    borderless: true,
    flushTop: true,
    anchorOffsetX: 10,
  }
}

function hasRawRefs(rawRefs: readonly ChatRawRef[]): boolean {
  return rawRefs.length > 0
}

function DetailDisclosure({ leaf, children }: { leaf: ChatLeaf; children: React.ReactNode }): React.ReactElement {
  const detail = React.useMemo(() => safeJson(compactDetail(leaf)), [leaf])
  const canInspect = hasRawRefs(leaf.rawRefs) || leaf.detailAccess.length > 0
  const canExpand = canInspect && leaf.detailAccess.includes("expand")
  const popover = canInspect && leaf.detailAccess.includes("cmd-hover") ? detailPopover(detail) : null
  return (
    <EntryDisclosure popover={popover} canExpand={canExpand} interactive={canInspect} defaultExpanded={false}>
      {({ surfaceProps, isHovered, expanded }) => (
        <Box
          {...surfaceProps}
          flexDirection="column"
          minWidth={0}
          backgroundColor={isHovered && canInspect ? "$bg-surface-hover" : undefined}
        >
          {children}
          {expanded && canExpand ? (
            <Content.Row>
              <Content.Body width={contentWidth(leaf.width)}>
                <Box flexDirection="column" paddingTop={1} minWidth={0}>
                  <SyntaxHighlighter language="json" code={detail} bare />
                </Box>
              </Content.Body>
            </Content.Row>
          ) : null}
        </Box>
      )}
    </EntryDisclosure>
  )
}

function BlockFrame({ leaf, children }: { leaf: ChatLeaf; children: React.ReactNode }): React.ReactElement {
  return (
    <DetailDisclosure leaf={leaf}>
      <Content.Row>
        <Content.Body width={contentWidth(leaf.width)}>{children}</Content.Body>
      </Content.Row>
    </DetailDisclosure>
  )
}

function mutedText(text: string): React.ReactElement {
  return (
    <Text color="$muted" wrap="wrap">
      {text}
    </Text>
  )
}

function renderToolSummary(leaf: Extract<ChatLeaf, { type: "tool" }>): string {
  const status = leaf.status ? ` ${leaf.status}` : ""
  return `${leaf.props.name}${status}`
}

function renderChatLeaf(leaf: ChatLeaf): React.ReactNode {
  switch (leaf.type) {
    case "user-text":
      return (
        <BlockFrame leaf={leaf}>
          <Chat.Turn.Prompt text={leaf.props.text} />
        </BlockFrame>
      )
    case "assistant-text":
      return (
        <BlockFrame leaf={leaf}>
          <Chat.Turn.Narration text={leaf.props.text} />
        </BlockFrame>
      )
    case "reasoning":
      return (
        <BlockFrame leaf={leaf}>
          <Chat.Turn.Narration text={leaf.props.text} muted marker="·" />
        </BlockFrame>
      )
    case "attachment":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="@">{mutedText(leaf.props.attachment.label)}</SessionEntry>
        </BlockFrame>
      )
    case "tool":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="$" markerColor={leaf.status === "failed" ? "$error" : "$muted"}>
            {mutedText(renderToolSummary(leaf))}
          </SessionEntry>
        </BlockFrame>
      )
    case "permission":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="?" markerColor="$warning">
            <Text color="$warning" wrap="wrap">
              {leaf.props.decision ? `${leaf.props.prompt}: ${leaf.props.decision}` : leaf.props.prompt}
            </Text>
          </SessionEntry>
        </BlockFrame>
      )
    case "plan-update":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="□" markerColor="$muted">
            {mutedText(`Plan updated: ${leaf.props.taskCount} task${leaf.props.taskCount === 1 ? "" : "s"}`)}
          </SessionEntry>
        </BlockFrame>
      )
    case "queue":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="›" markerColor="$muted">
            {mutedText(`Queue ${leaf.props.action}`)}
          </SessionEntry>
        </BlockFrame>
      )
    case "notification":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="•" markerColor="$muted">
            <Box flexDirection="column" minWidth={0}>
              {mutedText(
                leaf.props.title
                  ? `${leaf.props.source}: ${leaf.props.title}`
                  : `${leaf.props.source}: ${leaf.props.body}`,
              )}
              {leaf.props.title ? mutedText(leaf.props.body) : null}
            </Box>
          </SessionEntry>
        </BlockFrame>
      )
    case "session-status":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="•" markerColor="$muted">
            {mutedText(leaf.props.value ? `${leaf.props.label}: ${leaf.props.value}` : leaf.props.label)}
          </SessionEntry>
        </BlockFrame>
      )
    case "error":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="!" markerColor="$error">
            <Text color="$error" wrap="wrap">
              {leaf.props.message}
            </Text>
          </SessionEntry>
        </BlockFrame>
      )
    case "read":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="r" markerColor="$muted">
            {mutedText(`Read ${leaf.props.path}`)}
          </SessionEntry>
        </BlockFrame>
      )
    case "search":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="/" markerColor="$muted">
            {mutedText(
              leaf.props.matches === undefined
                ? `Searched ${leaf.props.query}`
                : `Searched ${leaf.props.query}: ${leaf.props.matches} matches`,
            )}
          </SessionEntry>
        </BlockFrame>
      )
    case "patch":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="±" markerColor="$muted">
            {mutedText(`${leaf.props.operation} ${leaf.props.path}`)}
          </SessionEntry>
        </BlockFrame>
      )
    case "command":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="$" markerColor={leaf.props.exitCode && leaf.props.exitCode !== 0 ? "$error" : "$muted"}>
            {mutedText(leaf.props.command)}
          </SessionEntry>
        </BlockFrame>
      )
    case "recap":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker=" " markerColor="$muted" width="100%">
            <Text color="$muted" italic wrap="wrap">
              {leaf.props.text}
            </Text>
          </SessionEntry>
        </BlockFrame>
      )
    case "file-snapshot":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="•" markerColor="$muted">
            {mutedText(`File history snapshot: ${leaf.props.files.length} files`)}
          </SessionEntry>
        </BlockFrame>
      )
    case "hook":
    case "mcp":
    case "usage":
    case "unknown":
      return (
        <BlockFrame leaf={leaf}>
          <SessionEntry marker="•" markerColor="$muted">
            {mutedText("label" in leaf.props ? leaf.props.label : leaf.type)}
          </SessionEntry>
        </BlockFrame>
      )
    default: {
      const _exhaustive: never = leaf
      return _exhaustive
    }
  }
}

export const ChatBlockList = React.forwardRef<ListViewHandle, ChatBlockListProps>(function ChatBlockList(
  { leaves, activity, follow = "end", viewportBottomInset, paddingTop = 0, paddingBottom = 0 },
  ref,
): React.ReactElement {
  const items = React.useMemo<Item[]>(() => {
    const base: Item[] = [...leaves]
    if (activity) base.push({ __activity: true })
    if (base.length === 0) return base
    return [
      ...(paddingTop > 0 ? [{ __padding: true as const, id: "viewport-top", height: paddingTop }] : []),
      ...base,
      ...(paddingBottom > 0 ? [{ __padding: true as const, id: "viewport-bottom", height: paddingBottom }] : []),
    ]
  }, [activity, leaves, paddingBottom, paddingTop])

  const renderItem = React.useCallback(
    (item: Item): React.ReactNode => {
      if (isPadding(item)) return renderPadding(item.height)
      if (isActivity(item)) return activity
      return renderChatLeaf(item)
    },
    [activity],
  )

  if (follow === false) {
    return (
      <Box flexDirection="column" gap={0} alignSelf="stretch" width="100%" flexShrink={0}>
        {items.map((item, i) => (
          <Box key={listKey(item, i)} flexDirection="column" alignSelf="stretch" width="100%" flexShrink={0}>
            {renderItem(item)}
          </Box>
        ))}
      </Box>
    )
  }

  return (
    <ListView
      ref={ref}
      items={items}
      getKey={listKey}
      gap={0}
      maxRendered={200}
      nav={false}
      follow={follow}
      viewportBottomInset={viewportBottomInset}
      renderItem={renderItem}
    />
  )
})
