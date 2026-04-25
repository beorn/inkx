import React, { useState } from "react"
import type { MessageEntry } from "@km/agent-harness"
import { Box, ListView, Text } from "silvery"
import { ActivityIndicator, type ActivityStatus } from "./ActivityIndicator.tsx"
import { AssistantBlock } from "./AssistantBlock.tsx"
import { ToolCallBlock } from "./ToolCallBlock.tsx"
import { ToolResultBlock } from "./ToolResultBlock.tsx"
import { UserMessageBlock } from "./UserMessageBlock.tsx"
import { BACKGROUND_MESSAGE_PREFIX } from "../controller.ts"

/**
 * Virtualized message stream — same shape km-logview uses.
 *
 * ListView owns scroll (wheel / keyboard / cursor). We render with no
 * `height` prop and let flex propagate the actual viewport from the
 * parent (`flex-grow=1 overflow=scroll` inside ListView). This avoids the
 * `useBoxRect` first-frame zero-read class — long paragraphs wrap on the
 * first paint, not after a re-render that may never come for static
 * tests. Cursor follows the latest item on the arrival path (cursorKey
 * bound to state that auto-advances as new messages land) but the user
 * can scroll away with j/k/wheel and the cursor stays where they put it.
 *
 * The ActivityIndicator is rendered as a VIRTUAL tail item after the last
 * real message when the session is active — so the user sees it pulsing
 * where the next assistant response will arrive, not as bottom-pinned
 * chrome. Matches Claude Code's own live-feel.
 *
 * Phase 3 of `km-silvery.view-as-layout-output` — closes
 * `km-silvercode.message-wrap-truncation`.
 */

// Sentinel that MessageList stuffs at the end of the items array when the
// session is active. Distinct shape so the renderer can discriminate.
type ActivityItem = { __activity: true }
type Item = MessageEntry | ActivityItem
function isActivity(item: Item): item is ActivityItem {
  return (item as ActivityItem).__activity === true
}

/**
 * Background-task system message. Rendered when the controller surfaces a
 * "▶ Background task ..." row. Distinct treatment vs. user/assistant rows
 * so the user can immediately see "this came from a backgrounded turn,
 * not from me typing or Claude responding".
 */
function BackgroundSystemBlock({ text }: { text: string }): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1} paddingX={1} paddingY={0} backgroundColor="$bg-surface-subtle">
      <Text color="$info">{text}</Text>
    </Box>
  )
}

function MessageItem({ m }: { m: MessageEntry }): React.ReactElement {
  // Background-task system messages are stuffed into the store as
  // user-messages with a `bg-` prefixed turnId AND a `▶ Background task `
  // text prefix (see controller.ts: BACKGROUND_MESSAGE_PREFIX). Render
  // them with a distinct (system) treatment.
  if (m.role === "user" && (m.id as string).startsWith("bg-") && m.text.startsWith(BACKGROUND_MESSAGE_PREFIX)) {
    return <BackgroundSystemBlock text={m.text} />
  }
  if (m.role === "user") {
    return <UserMessageBlock text={m.text} />
  }
  if (m.role === "system") {
    return <BackgroundSystemBlock text={m.text} />
  }
  // `flexShrink={1} minWidth={0}` propagate the wrap chain through this
  // intermediate column container — without them flexily measures the
  // wrapper at its children's max-content width, which feeds an
  // unconstrained width to the wrap-aware Text inside AssistantBlock /
  // ToolCallBlock and defeats soft-wrapping. Same pattern AssistantBlock
  // applies on its own row container; the MeasuredItem wrapper inside
  // ListView keeps `flexShrink=0` for vertical height measurement, so
  // cross-axis shrinkability has to be declared explicitly here.
  return (
    <Box flexDirection="column" flexShrink={1} minWidth={0}>
      {m.text.length > 0 && <AssistantBlock text={m.text} />}
      {m.toolCalls.map((c) => {
        const results = m.toolResults.filter((r) => r.id === c.id)
        const running = results.length === 0
        return (
          <Box key={c.id} flexDirection="column" flexShrink={1} minWidth={0}>
            <ToolCallBlock id={c.id} name={c.name} input={c.input} mcpServer={c.mcp_server} running={running} />
            {results.map((r) => (
              <ToolResultBlock key={r.id} output={r.output} isError={r.is_error} />
            ))}
          </Box>
        )
      })}
    </Box>
  )
}

export function MessageList({
  messages,
  status,
  turnStartedAt,
  inputTokens,
  outputTokens,
  pendingPermissions,
  inFlightTool,
}: {
  messages: MessageEntry[]
  onApprove: (requestId: string) => void
  onDeny: (requestId: string) => void
  sessionId: string
  status: ActivityStatus
  turnStartedAt: number | null
  inputTokens: number
  outputTokens: number
  pendingPermissions: number
  inFlightTool: string | null
}): React.ReactElement {
  const [cursor, setCursor] = useState<number>(-1)

  const showActivity = status !== "idle" && status !== "ended"
  const items: Item[] = showActivity ? [...messages, { __activity: true }] : messages

  return (
    <ListView
      items={items}
      getKey={(item, i) => (isActivity(item) ? "__activity" : i)}
      gap={1}
      nav
      cursorKey={cursor}
      onCursor={setCursor}
      maxRendered={200}
      renderItem={(item) =>
        isActivity(item) ? (
          <ActivityIndicator
            status={status}
            pendingPermissions={pendingPermissions}
            inFlightTool={inFlightTool}
            turnStartedAt={turnStartedAt}
            inputTokens={inputTokens}
            outputTokens={outputTokens}
          />
        ) : (
          <MessageItem m={item} />
        )
      }
    />
  )
}
