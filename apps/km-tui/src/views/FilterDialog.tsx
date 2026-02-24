/**
 * Filter Dialog Component
 *
 * Property-based filter panel positioned in the top-right corner.
 * Ctrl+G / Cmd+G toggles the panel. Navigate with j/k, toggle with Space/Enter.
 * Escape closes. Shift+X clears all filters.
 *
 * Purely presentational — all state is in UIState, all key handling
 * goes through the command system (keybindings layer "filter-dialog").
 *
 * Filter categories:
 * - Task status (todo, wip, blocked, done, dropped)
 * - Priority (P1-P4)
 * - Due date (overdue, today, this-week, no-date)
 */
import React from "react"
import { Box, Text } from "inkx"
import type { FilterProperties } from "../ui-reducer.ts"
import { FILTER_ROWS } from "../ui-reducer.ts"

interface FilterDialogProps {
  filterProperties: FilterProperties
  filterText: string
  cursorRow: number
  cursorVal: number
  width: number
}

export function FilterDialog({
  filterProperties,
  filterText,
  cursorRow,
  cursorVal,
  width,
}: FilterDialogProps): React.ReactElement {
  const innerWidth = Math.max(0, width - 6) // account for border (2) + paddingX (2*2)
  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor="cyan"
      backgroundColor="black"
      paddingX={2}
      paddingY={1}
    >
      {/* Title bar */}
      <Box justifyContent="space-between">
        <Text color="cyan" bold>
          {"Filter"}
        </Text>
        <Text dimColor>{"esc close"}</Text>
      </Box>

      <Text dimColor>{"─".repeat(innerWidth)}</Text>

      {/* Filter rows */}
      {FILTER_ROWS.map((row, ri) => {
        const isActiveRow = ri === cursorRow
        const prefix = isActiveRow ? "> " : "  "
        const hasActive = filterProperties[row.category].size > 0

        // Build values inline
        const valueParts = row.values.map((v, vi) => {
          const isActive = filterProperties[row.category].has(v.value)
          const isCursor = isActiveRow && vi === cursorVal
          const check = isActive ? "[x]" : "[ ]"
          return { text: `${check}${v.label}`, isActive, isCursor }
        })

        return (
          <React.Fragment key={row.category}>
            {/* Blank line between categories (not before first) */}
            {ri > 0 && <Text> </Text>}
            {/* Category label */}
            <Text wrap="truncate">
              <Text color={isActiveRow ? "cyan" : hasActive ? "white" : "gray"} bold={isActiveRow || hasActive}>
                {`${prefix}${row.label}`}
              </Text>
            </Text>
            {/* Values row — indented under the label */}
            <Text wrap="truncate">
              <Text>{"    "}</Text>
              {valueParts.map((vp, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <Text> </Text>}
                  <Text
                    color={vp.isActive ? "cyan" : vp.isCursor ? "white" : "gray"}
                    bold={vp.isActive}
                    inverse={vp.isCursor}
                  >
                    {vp.text}
                  </Text>
                </React.Fragment>
              ))}
            </Text>
          </React.Fragment>
        )
      })}

      {/* Active filter text indicator */}
      {filterText && (
        <>
          <Text> </Text>
          <Text wrap="truncate">
            <Text color="gray">{"  text: "}</Text>
            <Text color="cyan" bold>
              {filterText}
            </Text>
          </Text>
        </>
      )}

      {/* Hint footer */}
      <Text dimColor>{"─".repeat(innerWidth)}</Text>
      <Text dimColor wrap="truncate">
        {"j/k:row  h/l:value  spc:toggle  X:clear"}
      </Text>
    </Box>
  )
}

/**
 * Format active filters for compact display in the top bar.
 * Returns null if no filters are active.
 */
export function formatFilterIndicator(filterProperties: FilterProperties, filterText: string): string | null {
  const parts: string[] = []

  if (filterProperties.taskStatus.size > 0) {
    parts.push([...filterProperties.taskStatus].join(","))
  }
  if (filterProperties.priority.size > 0) {
    parts.push([...filterProperties.priority].map((p) => `P${p}`).join(","))
  }
  if (filterProperties.dueDate.size > 0) {
    parts.push([...filterProperties.dueDate].join(","))
  }
  if (filterProperties.assignedTo.size > 0) {
    parts.push("@" + [...filterProperties.assignedTo].join(","))
  }
  if (filterProperties.nodeType.size > 0) {
    parts.push([...filterProperties.nodeType].join(","))
  }
  if (filterText) {
    parts.push(`"${filterText}"`)
  }

  return parts.length > 0 ? parts.join(" | ") : null
}
