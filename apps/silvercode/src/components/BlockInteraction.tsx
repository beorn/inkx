import React from "react"
import { Box, Small, type PopoverContent } from "silvery"
import { EntryDisclosure, type EntryDisclosureState } from "./EntryDisclosure.tsx"
import { SyntaxHighlighter } from "./SyntaxHighlighter.tsx"

export type BlockDetailLanguage = "json" | "yaml"

export interface BlockInteractionState extends EntryDisclosureState {
  inspectable: boolean
  detailCode: string | null
}

export interface UseBlockInspectionOptions {
  raw?: unknown
  detail?: string | null
  language?: BlockDetailLanguage
  maxLines?: number
  maxWidth?: number
}

export interface BlockInteractionProps extends UseBlockInspectionOptions {
  children: React.ReactNode | ((state: BlockInteractionState) => React.ReactNode)
  expandedContent?: React.ReactNode | ((state: BlockInteractionState) => React.ReactNode)
  popover?: PopoverContent | null
  canExpand?: boolean
  interactive?: boolean
  defaultExpanded?: boolean
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  hoverBackground?: boolean
}

export function safeJson(value: unknown): string {
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

/**
 * Shared raw/detail popover trait for chat blocks. It keeps formatting,
 * truncation, placement, and inspectability rules in one place.
 */
export function useBlockInspection({
  raw,
  detail,
  language = "yaml",
  maxLines = 60,
  maxWidth = 80,
}: UseBlockInspectionOptions): {
  inspectable: boolean
  detailCode: string | null
  popover: PopoverContent | null
} {
  const compactPayload = React.useMemo(() => (detail === undefined ? compactBlockPayload(raw) : null), [detail, raw])
  const detailCode = React.useMemo(() => {
    if (detail !== undefined) return detail && detail.length > 0 ? detail : null
    if (compactPayload === null) return null
    return language === "json" ? safeJson(compactPayload) : prettyYamlForDebug(compactPayload)
  }, [compactPayload, detail, language])
  const popover = React.useMemo(() => {
    if (detailCode === null) return null
    const allLines = detailCode.split("\n")
    const displayCode =
      allLines.length > maxLines
        ? [...allLines.slice(0, maxLines), `# ... (${allLines.length - maxLines} more lines)`].join("\n")
        : detailCode
    const timestamp = timestampFromPayload(compactPayload)
    return {
      body: (
        <Box flexDirection="column">
          {timestamp ? (
            <Box flexDirection="row">
              <Box flexGrow={1} />
              <Small>{timestamp}</Small>
            </Box>
          ) : null}
          <SyntaxHighlighter language={language} code={displayCode} bare />
        </Box>
      ),
      maxWidth,
      borderless: true,
      flushTop: true,
      anchorOffsetX: 10,
    }
  }, [compactPayload, detailCode, language, maxLines, maxWidth])
  return { inspectable: detailCode !== null, detailCode, popover }
}

export function BlockInteraction({
  children,
  expandedContent,
  raw,
  detail,
  language,
  maxLines,
  maxWidth,
  popover,
  canExpand = false,
  interactive,
  defaultExpanded,
  expanded,
  onExpandedChange,
  hoverBackground = true,
}: BlockInteractionProps): React.ReactElement {
  const inspection = useBlockInspection({ raw, detail, language, maxLines, maxWidth })
  const effectivePopover = popover === undefined ? inspection.popover : popover
  const effectiveInteractive = interactive ?? (inspection.inspectable || effectivePopover !== null || canExpand)
  return (
    <EntryDisclosure
      popover={effectiveInteractive ? effectivePopover : null}
      canExpand={canExpand}
      interactive={effectiveInteractive}
      defaultExpanded={defaultExpanded}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
    >
      {(state) => {
        const blockState: BlockInteractionState = {
          ...state,
          inspectable: inspection.inspectable,
          detailCode: inspection.detailCode,
        }
        const body =
          typeof children === "function"
            ? (children as (state: BlockInteractionState) => React.ReactNode)(blockState)
            : children
        const expandedBody =
          typeof expandedContent === "function"
            ? (expandedContent as (state: BlockInteractionState) => React.ReactNode)(blockState)
            : expandedContent
        return (
          <Box
            {...state.surfaceProps}
            flexDirection="column"
            minWidth={0}
            backgroundColor={
              hoverBackground && state.isHovered && effectiveInteractive ? "$bg-surface-hover" : undefined
            }
          >
            {body}
            {state.expanded && canExpand ? expandedBody : null}
          </Box>
        )
      }}
    </EntryDisclosure>
  )
}

function prettyYamlForDebug(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent)
  if (value === null || value === undefined) return "null"
  if (typeof value === "boolean") return String(value)
  if (typeof value === "number") return String(value)
  if (typeof value === "string") {
    if (value.includes("\n")) {
      const body = value
        .split("\n")
        .map((l) => "  ".repeat(indent + 1) + l)
        .join("\n")
      return "|\n" + body
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    const childIndent = "  ".repeat(indent + 1)
    return value
      .map((v) => {
        const inner = prettyYamlForDebug(v, indent + 1)
        const lines = inner.split("\n")
        const first = lines[0] ?? ""
        if (first.startsWith(childIndent)) {
          lines[0] = pad + "- " + first.slice(childIndent.length)
        } else {
          lines[0] = pad + "- " + first
        }
        return lines.join("\n")
      })
      .join("\n")
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as object)
    if (entries.length === 0) return "{}"
    return entries
      .map(([k, v]) => {
        const key = /^[A-Za-z_][\w-]*$/.test(k) ? k : JSON.stringify(k)
        const isBlock =
          typeof v === "object" && v !== null && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)
        const inner = prettyYamlForDebug(v, indent + 1)
        return isBlock ? pad + key + ":\n" + inner : pad + key + ": " + inner
      })
      .join("\n")
  }
  return String(value)
}

function compactBlockPayload(value: unknown): unknown | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return value.trim().length > 0 ? value : null
  if (typeof value !== "object") return value
  if (Array.isArray(value)) {
    const items = value.flatMap((item) => {
      const compact = compactBlockPayload(item)
      return compact === null ? [] : [compact]
    })
    return items.length > 0 ? items : null
  }

  const input = value as Record<string, unknown>
  if (
    typeof input.kind === "string" &&
    (input.kind === "text" || input.kind === "thinking") &&
    typeof input.text === "string" &&
    Object.keys(input).every((key) => key === "kind" || key === "text")
  ) {
    return null
  }

  const entries = Object.entries(input).flatMap(([key, entry]) => {
    if (key === "ops") return []
    if (key === "text" && "raw" in input) return []
    const compact = compactBlockPayload(entry)
    return compact === null ? [] : ([[key, compact]] as Array<[string, unknown]>)
  })
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

function timestampFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const ts = (payload as { ts?: unknown }).ts
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, "0")
  const mm = d.getMinutes().toString().padStart(2, "0")
  return `${hh}:${mm}`
}
