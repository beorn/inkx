/**
 * Popover content builder for autolink detections.
 *
 * Renders a popover for each autolink match — built from the detection's
 * payload (source rule, resolves_to, preview kind). For known preview kinds
 * with a side-effect-free body (readme / first-paragraph) we lazily read the
 * resolved body via `resolvePreview`; for shell / mcp / virtual URLs we keep
 * the popover deliberately minimal in v1 (just the match + target) so we
 * don't trigger subprocess execution on hover.
 *
 * Mirrors silvercode's `renderPopoverContent` (see
 * apps/silvercode/src/components/LinkifiedText.tsx) but uses km-tui's
 * `PopoverContent` shape from `views/Popover.tsx` — which is `lines + render`
 * rather than silvercode's `body` (silvery package's PopoverContent).
 */

import React from "react"
import { Box, Muted, Text } from "@silvery/ag-react"
import { type AutolinkDetection, type AutolinkPreviewKind, resolvePreview } from "@km/autolinks"
import type { PopoverContent } from "../views/Popover.tsx"

/** Preview kinds whose body is markdown source — render with newline preservation. */
function isMarkdownKind(kind: string): boolean {
  return kind === "readme" || kind === "first-paragraph"
}

/**
 * Decode the JSON-encoded `command` carried in a shell-rule detection payload.
 * Returns `undefined` on any shape mismatch so a corrupt payload doesn't crash
 * the popover; the shell resolver surfaces a clearer error.
 */
function safeParseCommand(s: string): { exec: string; args: string[] } | undefined {
  try {
    const parsed = JSON.parse(s) as unknown
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as { exec?: unknown }).exec === "string" &&
      Array.isArray((parsed as { args?: unknown }).args) &&
      (parsed as { args: unknown[] }).args.every((a) => typeof a === "string")
    ) {
      return parsed as { exec: string; args: string[] }
    }
  } catch {
    // fallthrough
  }
  return undefined
}

/**
 * Build a popover render function for an autolink detection. The render
 * callback is lazy — `resolvePreview` is only invoked when the popover
 * actually shows (which already has its own dwell delay), so passive
 * detection-rendering does no I/O.
 */
export function autolinkPopoverContent(d: AutolinkDetection): PopoverContent {
  const isVirtual = d.payload.virtual === "1" || d.payload.source === "<virtual:plain-url>"
  const resolvesTo = d.payload.resolves_to ?? d.match
  const preview = (d.payload.preview ?? "readme") as AutolinkPreviewKind | string

  // Virtual plain URLs: surface the URL itself, no preview fetch (URL meta
  // belongs to the URL-metadata path, not the autolinks system).
  if (isVirtual) {
    return {
      lines: [
        { text: d.match, bold: true, color: "$fg-link", link: true },
        { text: resolvesTo, dim: true },
      ],
      href: resolvesTo,
      maxWidth: 60,
    }
  }

  // Configured autolinks: render via lazy callback. The body is fetched the
  // first time the popover renders (the popover's own dwell + cache means
  // this fires at most once per match per session).
  return {
    lines: [{ text: d.match, bold: true }],
    maxWidth: 60,
    render: () => <AutolinkPopoverBody detection={d} />,
  }
}

/**
 * Lazy body for a configured-autolink popover. Lives inside `render()` so it
 * doesn't invoke `resolvePreview` until the popover dwells.
 *
 * For markdown-bodied kinds (readme / first-paragraph) we render the resolved
 * body as a stack of wrap-friendly Text lines (the popover's max width is
 * narrow). For shell/mcp/unknown kinds we show a structural summary — actual
 * subprocess execution is deferred to a later iteration of this bead.
 */
function AutolinkPopoverBody({ detection: d }: { detection: AutolinkDetection }): React.ReactElement {
  const resolvesTo = d.payload.resolves_to ?? d.match
  const preview = (d.payload.preview ?? "readme") as AutolinkPreviewKind | string
  const cacheKey = d.payload.cache_key ?? d.match
  const commandJson = d.payload.command
  const command = commandJson ? safeParseCommand(commandJson) : undefined

  // Side-effect-free preview kinds: invoke the resolver. resolvePreview owns
  // its own cache + 30s TTL, so re-renders during the popover's lifetime hit
  // the cache instead of re-reading the file.
  let result: ReturnType<typeof resolvePreview> | null = null
  if (preview === "readme" || preview === "first-paragraph") {
    try {
      result = resolvePreview({ preview, resolvesTo, cacheKey, command })
    } catch {
      result = null
    }
  }

  if (result?.kind === "ok" && isMarkdownKind(preview)) {
    return (
      <Box flexDirection="column">
        <Text bold>{d.match}</Text>
        <Muted>
          {preview} · {resolvesTo}
        </Muted>
        <Box flexDirection="column" paddingTop={1}>
          {result.body.split("\n").map((line, i) => (
            <Text key={i} wrap="wrap">
              {line.length === 0 ? " " : line}
            </Text>
          ))}
        </Box>
      </Box>
    )
  }

  if (result?.kind === "error") {
    return (
      <Box flexDirection="column">
        <Text bold>{d.match}</Text>
        <Muted>resolves to {resolvesTo}</Muted>
        <Text color="$fg-error">{result.message}</Text>
      </Box>
    )
  }

  // shell / mcp / unknown: structural summary only (no subprocess execution).
  return (
    <Box flexDirection="column">
      <Text bold>{d.match}</Text>
      <Muted>
        {preview} · {resolvesTo}
      </Muted>
      {command && (
        <Box flexDirection="column" paddingTop={1}>
          <Muted>command</Muted>
          <Text wrap="wrap">{[command.exec, ...command.args].join(" ")}</Text>
        </Box>
      )}
    </Box>
  )
}
