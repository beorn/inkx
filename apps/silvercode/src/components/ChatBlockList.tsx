import React from "react"
import { Box, ListView, Text, type ListViewHandle } from "silvery"
import type { ChatLeaf, ChatRawRef, ChatWidth } from "../chat/types.ts"
import { Chat } from "./Chat.tsx"
import { Content } from "./Content.tsx"
import { SessionEntry } from "./SessionEntry.tsx"
import { SyntaxHighlighter } from "./SyntaxHighlighter.tsx"
import { BlockInteraction, safeJson } from "./BlockInteraction.tsx"

export type ChatBlockListProps = {
  leaves: readonly ChatLeaf[]
  activity?: React.ReactNode
  follow?: "end" | false
  viewportBottomInset?: number
  paddingTop?: number
  paddingBottom?: number
}

type ChatBlockActivityTail = { __activity: true }
type ChatBlockPadding = { __padding: true; id: string; height: number }
type ChatBlockListItem = ChatLeaf | ChatBlockActivityTail | ChatBlockPadding

function isChatBlockActivityTail(item: ChatBlockListItem): item is ChatBlockActivityTail {
  return (item as ChatBlockActivityTail).__activity === true
}

function isChatBlockPadding(item: ChatBlockListItem): item is ChatBlockPadding {
  return (item as ChatBlockPadding).__padding === true
}

function listKey(item: ChatBlockListItem, index: number): string {
  if (isChatBlockActivityTail(item)) return "__activity"
  if (isChatBlockPadding(item)) return `__padding:${item.id}:${item.height}`
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

function compactDetail(leaf: ChatLeaf): unknown {
  const base: Record<string, unknown> = {
    id: leaf.id,
    type: leaf.type,
    track: leaf.track,
    eventIds: leaf.eventIds,
    messageIds: leaf.messageIds,
    blockIds: leaf.blockIds,
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

function hasRawRefs(rawRefs: readonly ChatRawRef[]): boolean {
  return rawRefs.length > 0
}

function DetailDisclosure({ leaf, children }: { leaf: ChatLeaf; children: React.ReactNode }): React.ReactElement {
  const detail = React.useMemo(() => safeJson(compactDetail(leaf)), [leaf])
  const canInspect = hasRawRefs(leaf.rawRefs) || leaf.detailAccess.length > 0
  const canExpand = canInspect && leaf.detailAccess.includes("expand")
  return (
    <BlockInteraction
      detail={detail}
      language="json"
      maxWidth={90}
      popover={canInspect && leaf.detailAccess.includes("cmd-hover") ? undefined : null}
      canExpand={canExpand}
      interactive={canInspect}
      defaultExpanded={false}
      expandedContent={
        <Content.Row>
          <Content.Body width={contentWidth(leaf.width)}>
            <Box flexDirection="column" paddingTop={1} minWidth={0}>
              <SyntaxHighlighter language="json" code={detail} bare />
            </Box>
          </Content.Body>
        </Content.Row>
      }
    >
      {children}
    </BlockInteraction>
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

function notificationSourceLabel(source: string): string {
  return source.replace(/(^|[-_\s]+)([a-z])/g, (_match, separator: string, letter: string) => {
    const normalizedSeparator = separator.trim().length > 0 ? " " : ""
    return `${normalizedSeparator}${letter.toUpperCase()}`
  })
}

function renderToolSummary(leaf: Extract<ChatLeaf, { type: "tool" }>): string {
  const status = leaf.status ? ` ${leaf.status}` : ""
  return `${leaf.props.name}${status}`
}

function renderChatLeaf(leaf: ChatLeaf): React.ReactNode {
  switch (leaf.type) {
    case "message":
      return (
        <BlockFrame leaf={leaf}>
          {leaf.props.role === "user" ? (
            <Chat.Prompt text={leaf.props.text} />
          ) : (
            <Chat.Message text={leaf.props.text} />
          )}
        </BlockFrame>
      )
    case "thought":
      return (
        <BlockFrame leaf={leaf}>
          <Chat.Thought text={leaf.props.text} />
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
            {mutedText(`Plan updated: ${leaf.props.stepCount} step${leaf.props.stepCount === 1 ? "" : "s"}`)}
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
                  ? `${notificationSourceLabel(leaf.props.source)}: ${leaf.props.title}`
                  : `${notificationSourceLabel(leaf.props.source)}: ${leaf.props.body}`,
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
  const items = React.useMemo<ChatBlockListItem[]>(() => {
    const base: ChatBlockListItem[] = [...leaves]
    if (activity) base.push({ __activity: true })
    if (base.length === 0) return base
    return [
      ...(paddingTop > 0 ? [{ __padding: true as const, id: "viewport-top", height: paddingTop }] : []),
      ...base,
      ...(paddingBottom > 0 ? [{ __padding: true as const, id: "viewport-bottom", height: paddingBottom }] : []),
    ]
  }, [activity, leaves, paddingBottom, paddingTop])

  const renderItem = React.useCallback(
    (item: ChatBlockListItem): React.ReactNode => {
      if (isChatBlockPadding(item)) return renderPadding(item.height)
      if (isChatBlockActivityTail(item)) return activity
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
