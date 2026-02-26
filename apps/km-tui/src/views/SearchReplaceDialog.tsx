/**
 * SearchReplaceDialog — floating search & replace dialog.
 *
 * Shows two input fields (Find/Replace), match count, regex toggle, and action buttons.
 * Uses useEditContext for the active input field, toggled by Tab.
 *
 * Keyboard:
 *   Tab          — switch between search and replace fields
 *   Enter        — find next match
 *   Shift+Enter  — find previous match
 *   Ctrl+R       — replace current match
 *   Ctrl+Shift+R — replace all matches
 *   Ctrl+X       — toggle regex mode
 *   Escape       — close dialog
 */

import React from "react"
import { Box, Text, useEditContext } from "inkx"
import { km } from "../theme.ts"
import type { SearchReplaceState } from "../ui-reducer.ts"
import { formatTitleWithHotkey } from "./shared-components.tsx"

interface SearchReplaceDialogProps {
  state: SearchReplaceState
  width: number
  onSearchChange: (query: string) => void
  onReplaceChange: (query: string) => void
}

/**
 * Text input for search or replace field.
 * Uses useEditContext to register as the active edit target.
 */
function DialogInput({
  value,
  onChange,
  isActive,
}: {
  value: string
  onChange: (value: string) => void
  isActive: boolean
}): React.ReactElement {
  if (!isActive) {
    // Inactive field: just show text, no edit context
    return (
      <Box flexGrow={1} overflow="hidden">
        <Text dimColor>{value || " "}</Text>
      </Box>
    )
  }

  return <ActiveInput value={value} onChange={onChange} />
}

function ActiveInput({ value, onChange }: { value: string; onChange: (value: string) => void }): React.ReactElement {
  const { beforeCursor, afterCursor } = useEditContext({
    initialValue: value,
    onConfirm: () => {
      // Handled by SEARCH_REPLACE_NEXT action
    },
    onCancel: () => {
      // Handled by SEARCH_REPLACE_CLOSE action
    },
    onSave: (v: string) => {
      onChange(v)
    },
    onChange: (v: string) => {
      onChange(v)
    },
  })

  const cursorChar = afterCursor.length > 0 ? afterCursor[0] : " "
  const restAfterCursor = afterCursor.length > 1 ? afterCursor.slice(1) : ""

  return (
    <Box flexGrow={1} overflow="hidden">
      <Text>
        {beforeCursor}
        <Text inverse>{cursorChar}</Text>
        {restAfterCursor}
      </Text>
    </Box>
  )
}

export function SearchReplaceDialog({
  state,
  width,
  onSearchChange,
  onReplaceChange,
}: SearchReplaceDialogProps): React.ReactElement {
  const { searchQuery, replaceQuery, useRegex, matchIndex, matchCount, focusedField } = state

  // Match indicator
  let matchRight: React.ReactNode = null
  if (searchQuery.length > 0) {
    if (matchCount === 0) {
      matchRight = <Text color="$error">No matches</Text>
    } else {
      matchRight = <Text color="$warning">{`${matchIndex + 1} of ${matchCount}`}</Text>
    }
  }

  const innerWidth = Math.max(20, width - 4) // Account for border padding

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor="cyan"
      backgroundColor="black"
      paddingX={1}
      data-dialog="search-replace"
    >
      {/* Title bar */}
      <Box flexDirection="row" justifyContent="space-between">
        {formatTitleWithHotkey("Find & Replace", "F", "cyan")}
        {matchRight}
      </Box>

      {/* Search field */}
      <Box flexDirection="row" width={innerWidth}>
        <Text color={focusedField === "search" ? km.dialogBody : "$muted"}>
          {focusedField === "search" ? "> " : "  "}
          Find:{" "}
        </Text>
        <DialogInput value={searchQuery} onChange={onSearchChange} isActive={focusedField === "search"} />
      </Box>

      {/* Replace field */}
      <Box flexDirection="row" width={innerWidth}>
        <Text color={focusedField === "replace" ? km.dialogBody : "$muted"}>
          {focusedField === "replace" ? "> " : "  "}
          Repl:{" "}
        </Text>
        <DialogInput value={replaceQuery} onChange={onReplaceChange} isActive={focusedField === "replace"} />
      </Box>

      {/* Bottom bar: toggles + hints */}
      <Box flexDirection="row" justifyContent="space-between" width={innerWidth}>
        <Box flexDirection="row" gap={1}>
          <Text color={useRegex ? "$success" : "$muted"}>{useRegex ? "\u2713" : "\u25A1"} regex</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text dimColor>Tab:field</Text>
          <Text dimColor>^R:repl</Text>
          <Text dimColor>^⇧R:all</Text>
          <Text dimColor>^X:regex</Text>
        </Box>
      </Box>
    </Box>
  )
}
