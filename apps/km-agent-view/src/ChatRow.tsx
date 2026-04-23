/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom */
import React from "react"
import { Box, Text } from "silvery"
import { colorize } from "@km/logview/colorize"
import type { LogRow } from "@km/logview/view-config"
import { Pill } from "./pills.tsx"

/**
 * ChatRow — one message in the iMessage-style stream.
 *
 * Alignment:
 *   USER kind        → right-aligned "bubble" (colored bg, right margin)
 *   everything else  → left-aligned, subtle border/tint
 *
 * Bubble width caps at ~70% of available cols, min 20. Caller passes `cols`
 * for the cap; if omitted, bubbles fall back to flexBasis 70%.
 *
 * Styling is intentionally minimal for v0 — we lean on $color4 / $color2 /
 * $fg-muted to carry the visual distinction. v1+ may add borderStyle,
 * explicit `$bg-primary-subtle` tokens, and animation.
 *
 * Body rendering reuses colorize() from km-logview so log-shaped content
 * (JSON, tags) stays readable inside the bubble.
 */

function kindFg(kind: string | undefined): string {
  switch (kind) {
    case "user":
      return "$color4"
    case "assistant":
      return "$color2"
    case "thinking":
      return "$color8"
    case "tool_use":
      return "$color6"
    case "tool_result":
      return "$color14"
    case "hook":
      return "$color5"
    case "inject":
      return "$fg-warning"
    case "hook_fail":
      return "$fg-error"
    case "system":
      return "$color3"
    default:
      return "$fg-muted"
  }
}

const KIND_LABEL: Record<string, string> = {
  user: "USER",
  assistant: "ASSIST",
  thinking: "think",
  tool_use: "→ tool",
  tool_result: "← result",
  inject: "⚠ inject",
  hook: "◆ hook",
  hook_fail: "✗ hook",
  system: "SYSTEM",
}

function firstLine(s: unknown): string {
  if (typeof s !== "string") return ""
  const nl = s.indexOf("\n")
  return nl === -1 ? s : s.slice(0, nl)
}

function bodyLines(s: unknown): string[] {
  if (typeof s !== "string") return []
  return s.split("\n")
}

export function ChatRow({
  row,
  isCursor,
  cols,
}: {
  row: LogRow
  isCursor: boolean
  cols: number
}) {
  const kind = row.kind ?? ""
  const isUser = kind === "user"
  const color = kindFg(kind)
  const label = KIND_LABEL[kind] ?? kind
  const time = typeof row.fields.time === "string" ? row.fields.time : ""
  const toolLabel = typeof row.fields.label === "string" ? row.fields.label : ""
  const body = row.fields.body
  const bodyHead = firstLine(body)
  const bodyRest = bodyLines(body).slice(1)

  // Bubble sizing: bubble column shrinks to content width (not `maxWidth`)
  // so right-aligned USER bubbles actually hug the right edge — wrapping
  // only kicks in when content exceeds the cap. This is the iMessage look:
  // short messages are narrow chips; long messages wrap inside a capped
  // column.
  const cap = Math.max(20, Math.min(cols - 4, Math.floor(cols * 0.7)))

  // Dim non-cursor rows slightly for the "recedes into stream" effect.
  // Cursor row gets a bg tint so it still pops against the chat flow.
  const cursorBg = isCursor ? "$bg-cursor" : undefined
  const fgForBody = isCursor ? "$fg-cursor" : color

  return (
    <Box
      flexDirection="row"
      width="100%"
      justifyContent={isUser ? "flex-end" : "flex-start"}
      paddingX={1}
      backgroundColor={cursorBg}
    >
      <Box flexDirection="column" maxWidth={cap} flexShrink={0} alignItems={isUser ? "flex-end" : "flex-start"}>
        <Box flexDirection="row">
          {/* Header: KIND chip · tool-name · time. Muted when non-cursor. */}
          <Pill color={isCursor ? undefined : color} isCursor={isCursor}>
            {label}
          </Pill>
          {toolLabel ? (
            <>
              <Text>{" "}</Text>
              <Pill color={isCursor ? undefined : color} bold={false} isCursor={isCursor}>
                {toolLabel}
              </Pill>
            </>
          ) : null}
          {time ? (
            <>
              <Text>{"  "}</Text>
              <Text color={isCursor ? "$fg-cursor" : "$fg-muted"} dim={!isCursor}>
                {time}
              </Text>
            </>
          ) : null}
        </Box>
        {bodyHead ? (
          <Text color={fgForBody} bold={isUser || undefined} wrap="wrap">
            {colorize(bodyHead)}
          </Text>
        ) : null}
        {bodyRest.map((line, i) => (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: line order is stable within a row
            key={`b${i}`}
            color={isCursor ? "$fg-cursor" : "$fg-muted"}
            dim={!isCursor}
            wrap="wrap"
          >
            {colorize(line)}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

/**
 * ClusterRow — a collapsed run of N hook events as a single pill row.
 *
 * Left-aligned (hooks are never "user-side"). Renders as:
 *   ◆ N hooks        [first hook's time]
 * Enter expands the cluster inline (state lives in the parent App).
 */
export function ClusterRow({
  count,
  time,
  isCursor,
  expanded,
}: {
  count: number
  time: string
  isCursor: boolean
  expanded: boolean
}) {
  const color = kindFg("hook")
  return (
    <Box flexDirection="row" width="100%" paddingX={1} backgroundColor={isCursor ? "$bg-cursor" : undefined}>
      <Pill color={isCursor ? undefined : color} isCursor={isCursor}>
        {`◆ ${count} hooks`}
      </Pill>
      <Text>{"  "}</Text>
      <Text color={isCursor ? "$fg-cursor" : "$fg-muted"} dim={!isCursor}>
        {expanded ? "[expanded — Enter to collapse]" : "[Enter to expand]"}
      </Text>
      {time ? (
        <>
          <Text>{"  "}</Text>
          <Text color={isCursor ? "$fg-cursor" : "$fg-muted"} dim={!isCursor}>
            {time}
          </Text>
        </>
      ) : null}
    </Box>
  )
}
