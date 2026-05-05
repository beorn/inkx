import React from "react"
import { Box, Image, Muted, Prose, Text } from "silvery"
import { detectReferences, type Detection } from "../detection.ts"
import { useAutolinks } from "../AutolinksContext.tsx"
import { useCwd } from "../CwdContext.tsx"
import { detectAutolinks, mergeDetections, resolvePreview, type AutolinkPreviewKind } from "@km/autolinks"
import { MarkdownView } from "./MarkdownView.tsx"
import { resolveDisplayPath } from "../utils/format-path.ts"
import { LinkedTerm } from "./LinkedTerm.tsx"
import { HoverPreviewTarget } from "./HoverPreviewTarget.tsx"

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
      <Box flexDirection="column">
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

function isImagePath(path: string): boolean {
  return /\.(?:png|jpe?g|gif|webp)$/i.test(path)
}

function imagePreview(src: Buffer | string, label: string): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text bold wrap="truncate">
        {label}
      </Text>
      <Image src={src} width={48} height={16} fallback="[image preview]" />
    </Box>
  )
}

function dataImageBuffer(d: Detection): Buffer | null {
  if (d.kind !== "data-image") return null
  const data = d.payload.data
  if (typeof data !== "string" || data.length === 0) return null
  try {
    return Buffer.from(data, "base64")
  } catch {
    return null
  }
}

function renderPopoverContent(d: Detection, cwd: string, home: string | undefined): React.ReactNode {
  switch (d.kind) {
    case "bead":
      return (
        <Box flexDirection="column">
          <Text bold>{d.payload.id}</Text>
          <Text>Bead details resolve via `bd show {d.payload.id}`.</Text>
        </Box>
      )
    case "file": {
      const abs = resolveAbsolute(d.payload.path ?? "", cwd, home)
      if (abs && isImagePath(abs)) return imagePreview(abs, d.payload.path ?? abs)
      return (
        <Box flexDirection="column">
          <Text bold>{d.payload.path}</Text>
          {d.payload.line && <Text>line {d.payload.line}</Text>}
        </Box>
      )
    }
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
    case "data-image": {
      const image = dataImageBuffer(d)
      if (image) return imagePreview(image, String(d.payload.mimeType ?? "image"))
      return (
        <Box flexDirection="column">
          <Text bold>image data</Text>
          <Text color="$error">Could not decode base64 image data.</Text>
        </Box>
      )
    }
    // Plain URLs land here as `kind: "autolink"` with `payload.virtual === "1"`
    // — the migration in `bd-km-silvercode.url-detection-via-handlers` removed
    // the dedicated `kind: "url"` branch in favor of the handler registry path.
    case "autolink":
      return renderAutolinkPopover(d)
  }
}

/**
 * Resolve a path string into an absolute path, given the silvercode cwd.
 *
 *   - `~`              → `$HOME`
 *   - `~/foo`          → `$HOME/foo`
 *   - `/abs`           → unchanged
 *   - `apps/foo.ts`    → `${cwd}/apps/foo.ts` (when cwd is non-empty)
 *   - relative w/o cwd → `null` (caller falls back to popover-only)
 *
 * Returned paths are always absolute and have no `..` segments — that's
 * a property `file://` URI consumers (LaunchServices) generally tolerate
 * but that the deduplication in `detection.ts` doesn't normalize.
 */
function resolveAbsolute(p: string, cwd: string, home: string | undefined): string | null {
  if (!p) return null
  const expanded = resolveDisplayPath(p, home ? { home } : undefined)
  if (expanded.startsWith("/")) return expanded
  if (cwd.length > 0) return `${cwd.replace(/\/$/, "")}/${expanded.replace(/^\.\/+/, "")}`
  return null
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
 *
 * `cwd` and `home` are required for resolving relative + tilde paths;
 * they come from `<CwdProvider>` and `process.env.HOME`.
 */
function hrefFor(d: Detection, cwd: string, home: string | undefined): string | null {
  switch (d.kind) {
    case "file":
    case "code-ref": {
      const abs = resolveAbsolute(d.payload.path ?? "", cwd, home)
      if (!abs) return null
      const line = d.payload.line ? `:${d.payload.line}` : ""
      const col = d.payload.col ? `:${d.payload.col}` : ""
      return `file://${abs}${line}${col}`
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
    case "data-image":
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
    case "data-image":
      return "$info"
  }
}

function visibleLinkText(d: Detection): { linked: string; suffix: string } {
  if (d.kind === "data-image") return { linked: "[image data]", suffix: "" }
  if (d.kind !== "file" && d.kind !== "code-ref") return { linked: d.match, suffix: "" }
  const path = d.payload.path ?? ""
  if (path.length === 0 || !d.match.startsWith(path)) return { linked: d.match, suffix: "" }
  return { linked: path, suffix: d.match.slice(path.length) }
}

function PopoverTextLink({
  children,
  color,
  backgroundColor,
  popoverBody,
}: {
  children: React.ReactNode
  color: string
  backgroundColor?: string
  popoverBody: React.ReactNode
}): React.ReactElement {
  return (
    <LinkedTerm color={color} backgroundColor={backgroundColor} popoverBody={popoverBody}>
      {children}
    </LinkedTerm>
  )
}

function PopoverLink({
  href,
  children,
  color,
  backgroundColor,
  popoverBody,
}: {
  href: string
  children: React.ReactNode
  color: string
  backgroundColor?: string
  popoverBody: React.ReactNode
}): React.ReactElement {
  return (
    <LinkedTerm href={href} color={color} backgroundColor={backgroundColor} popoverBody={popoverBody}>
      {children}
    </LinkedTerm>
  )
}

function PopoverRow({
  children,
  popoverBody,
}: {
  children: React.ReactNode
  popoverBody: React.ReactNode
}): React.ReactElement {
  return (
    <HoverPreviewTarget popover={{ body: popoverBody }}>
      {({ props }) => (
        <Box
          flexDirection="row"
          flexShrink={1}
          minWidth={0}
          onMouseEnter={props.onMouseEnter}
          onMouseLeave={props.onMouseLeave}
        >
          {children}
        </Box>
      )}
    </HoverPreviewTarget>
  )
}

export function LinkifiedText({
  text,
  role,
  backgroundColor,
  color,
  wrap,
}: {
  text: string
  role?: "assistant" | "user"
  backgroundColor?: string
  color?: string
  wrap?: "wrap" | "truncate" | "even"
}): React.ReactElement {
  const { rules } = useAutolinks()
  const cwd = useCwd()
  // `process.env.HOME` is read once at render — stable across the session.
  const home = process.env["HOME"]
  const wrapMode = wrap ?? (role === "user" ? "even" : "wrap")
  const detections = React.useMemo(() => {
    const builtins = detectReferences(text)
    if (rules.length === 0) return builtins
    const auto = detectAutolinks(text, rules)
    return mergeDetections(builtins, auto)
  }, [text, rules])

  // Each markdown line renders as a SINGLE outer wrapping <Text> with
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
            <Text
              key={lineIdx}
              color={role === "user" ? "$fg" : color}
              backgroundColor={backgroundColor}
              wrap={wrapMode}
            >
              {line}
            </Text>
          )
        }
        if (wrapMode === "truncate") {
          const rowPieces: React.ReactNode[] = []
          let rowCursor = lineStart
          for (const d of lineDetections) {
            if (d.start > rowCursor) {
              rowPieces.push(
                <Text
                  key={`t${rowCursor}`}
                  color={role === "user" ? "$fg" : color}
                  backgroundColor={backgroundColor}
                  wrap="truncate"
                >
                  {line.slice(rowCursor - lineStart, d.start - lineStart)}
                </Text>,
              )
            }
            const href = hrefFor(d, cwd, home)
            const popoverBody = renderPopoverContent(d, cwd, home)
            const visible = visibleLinkText(d)
            rowPieces.push(
              href ? (
                <PopoverLink
                  key={`d${d.start}`}
                  href={href}
                  color={color ?? colorFor(d)}
                  backgroundColor={backgroundColor}
                  popoverBody={popoverBody}
                >
                  {visible.linked}
                </PopoverLink>
              ) : (
                <PopoverTextLink
                  key={`d${d.start}`}
                  color={color ?? colorFor(d)}
                  backgroundColor={backgroundColor}
                  popoverBody={popoverBody}
                >
                  {visible.linked}
                </PopoverTextLink>
              ),
            )
            if (visible.suffix.length > 0) {
              rowPieces.push(
                <Text key={`d${d.start}-suffix`} backgroundColor={backgroundColor} wrap="truncate">
                  {visible.suffix}
                </Text>,
              )
            }
            rowCursor = d.end
          }
          if (rowCursor < lineEnd) {
            rowPieces.push(
              <Text
                key={`tail${rowCursor}`}
                color={role === "user" ? "$fg" : color}
                backgroundColor={backgroundColor}
                wrap="truncate"
              >
                {line.slice(rowCursor - lineStart)}
              </Text>,
            )
          }
          const firstPopoverBody = renderPopoverContent(lineDetections[0]!, cwd, home)
          return (
            <PopoverRow key={lineIdx} popoverBody={firstPopoverBody}>
              {rowPieces}
            </PopoverRow>
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
            pieces.push(
              <Text key={`t${cursor}`} backgroundColor={backgroundColor}>
                {line.slice(cursor - lineStart, d.start - lineStart)}
              </Text>,
            )
          }
          // Two render paths:
          //   - href != null  → silvery <Link> emits OSC 8; Ghostty / Kitty /
          //     iTerm2 handle Cmd-click natively via LaunchServices, and
          //     silvery's `link:open` event is the in-app fallback (routed
          //     via <SilvercodeLinkOpener> in App.tsx). Underline only
          //     paints while Cmd-hovered (arm-on-cmd-hover variant).
          //   - href == null  → in-app schemes (bd://, km://) where OSC 8
          //     can't help; keep the click-to-popover affordance.
          const href = hrefFor(d, cwd, home)
          const popoverBody = renderPopoverContent(d, cwd, home)
          const visible = visibleLinkText(d)
          pieces.push(
            href ? (
              <PopoverLink
                key={`d${d.start}`}
                href={href}
                color={color ?? colorFor(d)}
                backgroundColor={backgroundColor}
                popoverBody={popoverBody}
              >
                {visible.linked}
              </PopoverLink>
            ) : (
              <PopoverTextLink
                key={`d${d.start}`}
                color={color ?? colorFor(d)}
                backgroundColor={backgroundColor}
                popoverBody={popoverBody}
              >
                {visible.linked}
              </PopoverTextLink>
            ),
          )
          if (visible.suffix.length > 0) {
            pieces.push(
              <Text key={`d${d.start}-suffix`} backgroundColor={backgroundColor}>
                {visible.suffix}
              </Text>,
            )
          }
          cursor = d.end
        }
        if (cursor < lineEnd) {
          pieces.push(
            <Text key={`tail${cursor}`} backgroundColor={backgroundColor}>
              {line.slice(cursor - lineStart)}
            </Text>,
          )
        }
        return (
          <Text key={lineIdx} color={role === "user" ? "$fg" : color} backgroundColor={backgroundColor} wrap={wrapMode}>
            {pieces}
          </Text>
        )
      })}
    </Prose>
  )
}
