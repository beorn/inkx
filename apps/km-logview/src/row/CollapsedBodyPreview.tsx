/** Inline body preview shown in the collapsed state: first N lines + a hover-brightened "+K more (click to expand)" tail. */
import React, { useCallback, useState } from "react"
import { Box, Text } from "silvery"
import { colorize } from "../colorize.tsx"
import { BODY_INDENT } from "./constants.ts"
import { highlightQuery } from "./highlight.tsx"

/** Inline component: collapsed multi-line body preview. Lines wrap
 * naturally; a "+N more (click to expand)" tail indicates hidden content.
 *
 * Hover: entering anywhere on the preview brightens ONLY the "+more"
 * indicator (bright fg + bold) — body lines stay subdued so the call to
 * action stands out without visually drowning the content. */
export function CollapsedBodyPreview({
  lines,
  remainder,
  bodyColor,
  searchQuery,
}: {
  lines: string[]
  remainder: number
  bodyColor: string
  searchQuery: string
}) {
  const [hovered, setHovered] = useState(false)
  const onMouseEnter = useCallback(() => setHovered(true), [])
  const onMouseLeave = useCallback(() => setHovered(false), [])
  return (
    <Box flexDirection="column" paddingLeft={BODY_INDENT} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {lines.map((line, i) => {
        const showHighlight = searchQuery !== "" && line.toLowerCase().includes(searchQuery.toLowerCase())
        return (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: line order is stable within a row
            key={`c${i}`}
            color={bodyColor}
            wrap="wrap"
          >
            {showHighlight ? highlightQuery(line, searchQuery) : colorize(line)}
          </Text>
        )
      })}
      {remainder > 0 && (
        // Only the "+N more" indicator brightens on hover — body lines stay
        // subdued so the call-to-action stands out. Bright default fg + bold
        // on hover; no underline (per user spec).
        <Text color={hovered ? "$fg" : "$fg-muted"} bold={hovered || undefined}>
          {`⋯ +${remainder} more (click to expand)`}
        </Text>
      )}
    </Box>
  )
}
