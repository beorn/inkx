/**
 * View Settings Dialog
 *
 * V / v, opens the view settings panel in the top-right corner.
 * Shows view mode, icon style, and property-based filters.
 * Navigate with j/k, select with Space/Enter, X clears filters.
 *
 * Purely presentational — all state is in UIState, all key handling
 * goes through the command system (keybindings layer "filter-dialog").
 */
import React from "react"
import { Text, ModalDialog, Muted, Strong } from "@silvery/ag-react"
import type { FilterProperties, IconStyle, ViewDialogRow } from "../state/ui-reducer.ts"
import { VIEW_DIALOG_ROWS } from "../state/ui-reducer.ts"
import type { ViewMode } from "../board/board-types.ts"

interface FilterDialogProps {
  filterProperties: FilterProperties
  filterText: string
  viewMode: ViewMode
  iconStyle: IconStyle
  cursorRow: number
  cursorVal: number
  width: number
}

export function FilterDialog({
  filterProperties,
  filterText,
  viewMode,
  iconStyle,
  cursorRow,
  cursorVal,
  width,
}: FilterDialogProps): React.ReactElement {
  // Determine where the blank separator goes (between filters and radios)
  const firstRadioIdx = VIEW_DIALOG_ROWS.findIndex((r) => r.kind === "radio")

  return (
    <ModalDialog
      title="View Settings"
      titleAlign="flex-start"
      width={width}
      footer="j/k row  h/l value  spc select  X clear  esc close"
    >
      {/* Rows — single-line: label + values */}
      {VIEW_DIALOG_ROWS.map((row, ri) => {
        const isActiveRow = ri === cursorRow

        // Blank line separator before radio section
        const showSeparator = ri === firstRadioIdx && firstRadioIdx > 0

        const { hasActive, valueParts } = buildValueParts(
          row,
          isActiveRow,
          cursorVal,
          filterProperties,
          viewMode,
          iconStyle,
        )

        return (
          <React.Fragment key={row.kind === "filter" ? row.category : row.key}>
            {showSeparator && <Text> </Text>}
            <Text wrap="truncate">
              {/* Row label */}
              <Text
                color={isActiveRow ? "$primary" : hasActive ? "$fg" : "$muted"}
                bold={isActiveRow || hasActive}
                inverse={isActiveRow}
              >
                {` ${row.label} `}
              </Text>
              <Text> </Text>
              {/* Values inline */}
              {valueParts.map((vp, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <Text> </Text>}
                  <Text
                    color={vp.isActive ? "$primary" : vp.isCursor ? "$fg" : "$muted"}
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
            <Muted>{"  text: "}</Muted>
            <Strong color="$primary">{filterText}</Strong>
          </Text>
        </>
      )}
    </ModalDialog>
  )
}

function buildValueParts(
  row: ViewDialogRow,
  isActiveRow: boolean,
  cursorVal: number,
  filterProperties: FilterProperties,
  viewMode: ViewMode,
  iconStyle: IconStyle,
): { hasActive: boolean; valueParts: Array<{ text: string; isActive: boolean; isCursor: boolean }> } {
  if (row.kind === "filter") {
    const active = filterProperties[row.category]
    const hasActive = active.size > 0
    const valueParts = row.values.map((v, vi) => {
      const isActive = active.has(v.value)
      const isCursor = isActiveRow && vi === cursorVal
      const check = isActive ? "\u2713" : "\u25A1"
      return { text: `${check} ${v.label}`, isActive, isCursor }
    })
    return { hasActive, valueParts }
  }

  // Radio row
  const currentValue = row.key === "viewMode" ? viewMode : iconStyle
  const valueParts = row.values.map((v, vi) => {
    const isActive = v.value === currentValue
    const isCursor = isActiveRow && vi === cursorVal
    const bullet = isActive ? "\u25CF" : "\u25CB"
    return { text: `${bullet} ${v.label}`, isActive, isCursor }
  })
  return { hasActive: true, valueParts }
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
