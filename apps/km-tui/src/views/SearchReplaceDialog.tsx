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
import type { SearchReplaceState } from "../ui-reducer.ts"
import { ModalDialog } from "./shared-components.tsx"

interface SearchReplaceDialogProps {
  state: SearchReplaceState
  width: number
  onSearchChange: (query: string) => void
  onReplaceChange: (query: string) => void
}

/**
 * Text input for search or replace field.
 * Active: shows cursor via useEditContext. Inactive: plain dimmed text.
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

  return (
    <ModalDialog title="Find & Replace" hotkey="F" titleRight={matchRight} width={width}>
      {/* Search field */}
      <Box flexDirection="row">
        <Text color={focusedField === "search" ? "$text" : "$text3"}>Find: </Text>
        <DialogInput value={searchQuery} onChange={onSearchChange} isActive={focusedField === "search"} />
      </Box>

      <Text>{" "}</Text>

      {/* Replace field */}
      <Box flexDirection="row">
        <Text color={focusedField === "replace" ? "$text" : "$text3"}>Repl: </Text>
        <DialogInput value={replaceQuery} onChange={onReplaceChange} isActive={focusedField === "replace"} />
      </Box>

      <Text>{" "}</Text>

      {/* Bottom bar: toggles + hints */}
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row" gap={1}>
          <Text color={useRegex ? "$success" : "$text3"}>{useRegex ? "\u2713" : "\u25A1"} regex</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text dimColor>Tab:field</Text>
          <Text dimColor>^R:repl</Text>
          <Text dimColor>^⇧R:all</Text>
          <Text dimColor>^X:regex</Text>
        </Box>
      </Box>
    </ModalDialog>
  )
}
