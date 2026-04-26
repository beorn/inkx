import React from "react"
import type { MessageEntry } from "@km/agent-harness"
import { Box, ListView, type ListViewHandle, Text } from "silvery"
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

function MessageItem({ m, showRaw }: { m: MessageEntry; showRaw: boolean }): React.ReactElement {
  // Background-task system messages are stuffed into the store as
  // user-messages with a `bg-` prefixed turnId AND a `▶ Background task `
  // text prefix (see controller.ts: BACKGROUND_MESSAGE_PREFIX). Render
  // them with a distinct (system) treatment.
  if (m.role === "user" && (m.id as string).startsWith("bg-") && m.text.startsWith(BACKGROUND_MESSAGE_PREFIX)) {
    return <BackgroundSystemBlock text={m.text} />
  }
  if (m.role === "user") {
    return <UserMessageBlock text={m.text} additionalContext={m.additionalContext} showRaw={showRaw} />
  }
  if (m.role === "system") {
    return <BackgroundSystemBlock text={m.text} />
  }
  // Wrap chain is automatic post km-flexily.recursive-min-content —
  // flexily propagates min-content through Box wrappers, so the
  // historical `flexShrink={1} minWidth={0}` ceremony is no longer needed
  // on the intermediate columns.
  return (
    <Box flexDirection="column" gap={1}>
      {m.text.length > 0 && <AssistantBlock text={m.text} />}
      {m.toolCalls.map((c) => {
        const results = m.toolResults.filter((r) => r.id === c.id)
        const running = results.length === 0
        return (
          <Box key={c.id} flexDirection="column">
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

export const MessageList = React.forwardRef<
  ListViewHandle,
  {
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
    /** Toggled by App-level `/raw` slash command. When true, each user
     *  message inlines its `additionalContext` (system-reminders, hook
     *  output, isMeta bodies) below the visible prompt. Default false.
     *  Bead: km-silvercode.resume-show-everything-collapsed. */
    showRaw?: boolean
  }
>(function MessageList(
  { messages, status, turnStartedAt, inputTokens, outputTokens, pendingPermissions, inFlightTool, showRaw = false },
  ref,
): React.ReactElement {
  const showActivity = status !== "idle" && status !== "ended"
  const items: Item[] = showActivity ? [...messages, { __activity: true }] : messages

  // `follow="end"` is the canonical chat-style auto-follow API
  // (silvery bead `km-silvery.listview-followpolicy-split`). It owns
  // viewport position via row-space snap math while atEnd; cursor is
  // a SELECTION marker only and does NOT drive the viewport. We
  // therefore drop the historical `cursorKey={lastKey}` pin — it was
  // a workaround for the legacy "cursor and stickyBottom both fight
  // for scroll authority" race. With `follow="end"`, no pin is
  // required to land + stay at the tail.
  //
  // The forwarded ref exposes `scrollBy` / `scrollToTop` /
  // `scrollToBottom` so App.tsx can wire app-level Shift+Up/Down/
  // PageUp/PageDown/Home/End scroll bindings — the CommandBox owns
  // keyboard focus by default, so MessageList never receives Arrow/
  // PageUp/PageDown directly. Mirrors Claude Code's keyboard-only
  // scroll story.
  // NB: `nav` is intentionally OFF. ListView with `nav={true}` registers a
  // `useInput` that consumes Ctrl+D / Ctrl+U as vim half-page-down/up
  // (ListView.tsx:1189) and j/k/arrows as cursor moves. Silvercode's
  // MessageList has no item-selection — chat messages aren't a select-list.
  // Leaving `nav` on caused Ctrl+D to scroll-jump because activeCursor
  // defaulted to 0 (no `cursorKey`) and moveTo(0 + pageStep) drove the
  // viewport via the cursor-follow scrollTo path. App-level Shift+Up/Down/
  // PageUp/PageDown/Home/End are the canonical scroll surface — they call
  // ListView's imperative scrollBy/scrollToTop/scrollToBottom directly.
  // Bead: km-silvercode.ctrl-d-scrolls-to-top.
  return (
    <ListView
      ref={ref}
      items={items}
      getKey={(item, i) => (isActivity(item) ? "__activity" : i)}
      gap={1}
      maxRendered={200}
      follow="end"
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
          <MessageItem m={item} showRaw={showRaw} />
        )
      }
    />
  )
})
