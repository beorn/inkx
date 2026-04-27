import React from "react"
import { Box, Link, Muted, Prose, Text, usePopover } from "silvery"
import { detectReferences, type Detection } from "../detection.ts"
import { useAutolinks } from "../AutolinksContext.tsx"
import { detectAutolinks, mergeDetections, resolvePreview, type AutolinkPreviewKind } from "@km/autolinks"
import { MarkdownView } from "./MarkdownView.tsx"

/** Preview kinds whose body is markdown source — render via MarkdownView. */
function isMarkdownKind(kind: AutolinkPreviewKind): boolean {
  return kind === "readme" || kind === "first-paragraph"
}

/**
 * Decode the JSON-encoded `command` carried in the detection payload (per
 * `match.ts`). Returns `undefined` on any shape mismatch so a corrupt payload
 * doesn't crash the popover; the shell resolver will surface a clearer error.
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
  } catch {}
  return undefined
}

function renderAutolinkPopover(d: Detection): React.ReactNode {
  const preview = (d.payload.preview ?? "readme") as AutolinkPreviewKind
  const resolvesTo = d.payload.resolves_to ?? ""
  const cacheKey = d.payload.cache_key ?? d.match
  const commandJson = d.payload.command
  const command = commandJson ? safeParseCommand(commandJson) : undefined
  const result = resolvePreview({ preview, resolvesTo, cacheKey, command })
  if (result.kind === "error") {
    return (
      <Box flexDirection="column">
        <Text bold>{d.match}</Text>
        <Muted>resolves to {resolvesTo}</Muted>
        <Text color="$error">{result.message}</Text>
      </Box>
    )
  }
  // Markdown-source kinds (readme / first-paragraph) render through
  // MarkdownView — emphasis, code spans, headings, and bullets all carry
  // through. Shell, bd-active, and (defensively) mcp render as plain text
  // since their body is program output, not markdown.
  //
  // The popover is narrow (~50 cols typical). Wrap MarkdownView in a
  // <Prose flexShrink={1} minWidth={0}> so the inner Text nodes can shrink
  // to the popover width — without the explicit shrink/minWidth, Yoga
  // refuses to compress below a child's intrinsic size and the popover
  // expands to fit the longest line.
  return (
    <Box flexDirection="column">
      <Text bold>{d.match}</Text>
      <Muted>
        {preview} · {resolvesTo}
      </Muted>
      <Box flexDirection="column" paddingTop={1}>
        {isMarkdownKind(preview) ? (
          <Prose flexShrink={1} minWidth={0}>
            <MarkdownView source={result.body} />
          </Prose>
        ) : (
          result.body.split("\n").map((line, i) => (
            <Text key={i} wrap="wrap">
              {line.length === 0 ? " " : line}
            </Text>
          ))
        )}
      </Box>
    </Box>
  )
}

function renderPopoverContent(d: Detection): React.ReactNode {
  switch (d.kind) {
    case "bead":
      return (
        <Box flexDirection="column">
          <Text bold>{d.payload.id}</Text>
          <Text>Bead details resolve via `bd show {d.payload.id}`.</Text>
        </Box>
      )
    case "file":
      return (
        <Box flexDirection="column">
          <Text bold>{d.payload.path}</Text>
          {d.payload.line && <Text>line {d.payload.line}</Text>}
        </Box>
      )
    case "km-node":
      return (
        <Box flexDirection="column">
          <Text bold>km node {d.payload.id}</Text>
          <Text>Node summary resolves via km_get_node.</Text>
        </Box>
      )
    case "code-ref":
      return (
        <Box flexDirection="column">
          <Text bold>
            {d.payload.path}:{d.payload.line}
          </Text>
        </Box>
      )
    // Plain URLs land here as `kind: "autolink"` with `payload.virtual === "1"`
    // — the migration in `bd-km-silvercode.url-detection-via-handlers` removed
    // the dedicated `kind: "url"` branch in favor of the handler registry path.
    case "autolink":
      return renderAutolinkPopover(d)
  }
}

/**
 * Build an OSC 8 hyperlink href for a detection, or `null` for in-app-only
 * kinds (bd://, km://) that the terminal can't open via LaunchServices.
 *
 * Schemes:
 *   - `file://<absolute>[:line[:col]]` — Ghostty / Kitty / iTerm2 route to
 *     the macOS default-app handler (text editor for `.ts`, etc.).
 *   - `<scheme>://...` — passthrough for autolink rules whose
 *     `payload.resolves_to` is already a full URI.
 *   - `null` — render with a plain `<Text underline onClick>` so the
 *     in-app popover handler still fires; OSC 8 wouldn't help anyway.
 */
function hrefFor(d: Detection): string | null {
  switch (d.kind) {
    case "file": {
      const path = d.payload.path
      // Tilde paths and bare relative paths can't be resolved without
      // process context here — fall back to popover-only.
      if (!path || !path.startsWith("/")) return null
      const line = d.payload.line ? `:${d.payload.line}` : ""
      return `file://${path}${line}`
    }
    case "code-ref": {
      const path = d.payload.path
      if (!path || !path.startsWith("/")) return null
      const line = d.payload.line ? `:${d.payload.line}` : ""
      const col = d.payload.col ? `:${d.payload.col}` : ""
      return `file://${path}${line}${col}`
    }
    case "autolink": {
      // Virtual=1 → plain URL match — d.match IS the URI.
      if (d.payload.virtual === "1") return d.match
      // Configured rules — `resolves_to` is the canonical target.
      const target = d.payload.resolves_to
      return typeof target === "string" && target.length > 0 ? target : null
    }
    case "bead":
    case "km-node":
      // In-app schemes; OSC 8 LaunchServices can't open them.
      return null
  }
}

function colorFor(d: Detection): string {
  switch (d.kind) {
    case "bead":
      return "$accent"
    case "file":
      return "$primary"
    case "km-node":
      return "$accent"
    case "code-ref":
      return "$primary"
    case "autolink":
      // Virtual plain-URL detections inherit the legacy URL color so plain
      // links read like links. Configured autolinks keep `$secondary` to
      // distinguish rule-driven matches from raw URLs.
      return d.payload.virtual === "1" ? "$info" : "$secondary"
  }
}

export function LinkifiedText({ text, role }: { text: string; role?: "assistant" | "user" }): React.ReactElement {
  const popover = usePopover()
  const { rules } = useAutolinks()
  const detections = React.useMemo(() => {
    const builtins = detectReferences(text)
    if (rules.length === 0) return builtins
    const auto = detectAutolinks(text, rules)
    return mergeDetections(builtins, auto)
  }, [text, rules])

  // Each markdown line renders as a SINGLE outer <Text wrap="wrap"> with
  // nested styled Text spans for detected references. This is the only
  // shape that gives correct word-wrap across detection boundaries — the
  // earlier `<Box flexDirection="row" flexWrap="wrap">` over per-piece
  // flex children dropped boundary whitespace and shoved punctuation
  // (e.g. ":" after a URL) onto its own visual line because each piece
  // was an atomic flex item.
  //
  // With nested Text, silvery's text pipeline (collectTextWithBg +
  // mergeStyleContext in vendor/silvery render-text.ts) treats the
  // children as virtual text nodes — they contribute to one unified
  // text run for word-wrap, and their styles project onto the cells.
  //
  // <Prose> still wraps the line stack so flexily measures every Text
  // against the parent's available width.
  const lines = text.split("\n")
  let offset = 0
  return (
    <Prose>
      {lines.map((line, lineIdx) => {
        const lineStart = offset
        const lineEnd = offset + line.length
        const lineDetections = detections.filter((d) => d.start >= lineStart && d.end <= lineEnd)
        offset = lineEnd + 1
        if (lineDetections.length === 0) {
          return (
            <Text key={lineIdx} color={role === "user" ? "$fg" : undefined} wrap="wrap">
              {line}
            </Text>
          )
        }
        // Boundary whitespace preservation: gap text between detections is
        // wrapped in `<Text>` rather than `React.Fragment`. Every piece is
        // now a virtual silvery-text child with uniform shape — the link
        // `<Text>` and the surrounding gap `<Text>` both contribute to
        // the parent's unified text run as styled spans. In testing the
        // cell-level invariant — the character at the position
        // immediately after the link is always the trailing space, never
        // the next word's first character — holds in both shapes; this
        // change is the smaller-radius fix that consolidates on a single
        // node type at the boundary so renderers (xterm.js / native
        // terminal) see consistent cell metadata across pieces. Bead:
        // km-silvercode.autolink-trailing-space-eaten.
        const pieces: React.ReactNode[] = []
        let cursor = lineStart
        for (const d of lineDetections) {
          if (d.start > cursor) {
            pieces.push(<Text key={`t${cursor}`}>{line.slice(cursor - lineStart, d.start - lineStart)}</Text>)
          }
          // Two render paths:
          //   - href != null  → silvery <Link> emits OSC 8; Ghostty / Kitty /
          //     iTerm2 handle Cmd-click natively via LaunchServices, and
          //     silvery's `link:open` event is the in-app fallback (routed
          //     via <SilvercodeLinkOpener> in App.tsx). Underline only
          //     paints while Cmd-hovered (arm-on-cmd-hover variant).
          //   - href == null  → in-app schemes (bd://, km://) where OSC 8
          //     can't help; keep the click-to-popover affordance.
          const href = hrefFor(d)
          const showPopover = () =>
            popover?.show({ body: renderPopoverContent(d) }, { x: 0, y: 0 })
          pieces.push(
            href ? (
              <Link key={`d${d.start}`} href={href} color={colorFor(d)} onClick={showPopover}>
                {d.match}
              </Link>
            ) : (
              <Text
                key={`d${d.start}`}
                color={colorFor(d)}
                underline
                onClick={showPopover}
              >
                {d.match}
              </Text>
            ),
          )
          cursor = d.end
        }
        if (cursor < lineEnd) {
          pieces.push(<Text key={`tail${cursor}`}>{line.slice(cursor - lineStart)}</Text>)
        }
        return (
          <Text key={lineIdx} color={role === "user" ? "$fg" : undefined} wrap="wrap">
            {pieces}
          </Text>
        )
      })}
    </Prose>
  )
}
