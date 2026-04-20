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
import { Box, Text, Small, Strong, Muted, CursorLine, Toggle, ModalDialog, useEditContext } from "@silvery/ag-react"
import type { SearchReplaceState } from "../state/ui-reducer.ts"

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

  return (
    <Box flexGrow={1} overflow="hidden">
      <CursorLine beforeCursor={beforeCursor} afterCursor={afterCursor} />
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
      matchRight = <Text color="$fg-error">No matches</Text>
    } else {
      matchRight = <Text color="$fg-warning">{`${matchIndex + 1} of ${matchCount}`}</Text>
    }
  }

  return (
    <ModalDialog title="Find & Replace" hotkey="F" titleRight={matchRight} width={width} focusScope={true}>
      {/* Search field */}
      <Box flexDirection="row" testID="search-field">
        {focusedField === "search" ? <Strong>Find: </Strong> : <Muted>Find: </Muted>}
        <DialogInput value={searchQuery} onChange={onSearchChange} isActive={focusedField === "search"} />
      </Box>

      <Text> </Text>

      {/* Replace field */}
      <Box flexDirection="row" testID="replace-field">
        {focusedField === "replace" ? <Strong>Repl: </Strong> : <Muted>Repl: </Muted>}
        <DialogInput value={replaceQuery} onChange={onReplaceChange} isActive={focusedField === "replace"} />
      </Box>

      <Text> </Text>

      {/* Bottom bar: toggles + hints */}
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row" gap={1}>
          <Toggle value={useRegex} onChange={() => {}} label="regex" isActive={false} testID="regex-toggle" />
        </Box>
        <Box flexDirection="row" gap={1}>
          <Small>Tab:field</Small>
          <Small>^R:repl</Small>
          <Small>^⇧R:all</Small>
          <Small>^X:regex</Small>
        </Box>
      </Box>
    </ModalDialog>
  )
}
