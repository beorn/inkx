/**
 * FindBar — inline search bar displayed at the bottom of the board.
 *
 * Shows "Find: [query] (N of M)" with a text input for the search query.
 * Uses useEditContext for text input when isInputActive is true.
 * When isInputActive is false, just shows the current match position.
 */

import React from "react"
import { Box, Text, CursorLine, useEditContext } from "@silvery/ag-react"
import type { LocalSearchState } from "../state/ui-reducer.ts"

interface FindBarProps {
  localSearch: LocalSearchState
  width: number
  onQueryChange: (query: string) => void
}

/**
 * Text input for the find bar query.
 * Uses useEditContext to register as the active edit target,
 * so the command system routes text keys here.
 */
function FindBarInput({
  query,
  onQueryChange,
}: {
  query: string
  onQueryChange: (query: string) => void
}): React.ReactElement {
  const { beforeCursor, afterCursor } = useEditContext({
    initialValue: query,
    onConfirm: () => {
      // Handled by LOCAL_FIND_CONFIRM action
    },
    onCancel: () => {
      // Handled by LOCAL_FIND_CLOSE action
    },
    onSave: (value: string) => {
      onQueryChange(value)
    },
    onChange: (value: string) => {
      onQueryChange(value)
    },
  })

  return <CursorLine beforeCursor={beforeCursor} afterCursor={afterCursor} />
}

export function FindBar({ localSearch, width, onQueryChange }: FindBarProps): React.ReactElement {
  const { query, isInputActive, matchIndex, matchCount } = localSearch

  // Match indicator: "(1 of 5)" or "No matches" or empty when no query
  let matchIndicator = ""
  if (query.length > 0) {
    if (matchCount === 0) {
      matchIndicator = " No matches"
    } else {
      matchIndicator = ` (${matchIndex + 1} of ${matchCount})`
    }
  }

  return (
    <Box
      id="find-bar"
      testID="find-bar"
      data-query={query}
      data-match-count={matchCount}
      data-match-index={matchIndex}
      data-input-active={isInputActive || undefined}
      flexShrink={0}
      width={width}
      height={1}
      flexDirection="row"
      backgroundColor={"$fg-muted"}
      userSelect="none"
    >
      <Text color={"$fg"} backgroundColor={"$fg-muted"}>
        {" / "}
      </Text>
      <Box flexGrow={1} overflow="hidden">
        {isInputActive ? (
          <FindBarInput query={query} onQueryChange={onQueryChange} />
        ) : (
          <Text color={"$fg"} backgroundColor={"$fg-muted"}>
            {query}
          </Text>
        )}
      </Box>
      <Box flexShrink={0}>
        <Text color={matchCount === 0 && query.length > 0 ? "$fg-error" : "$fg-warning"} backgroundColor={"$fg-muted"}>
          {matchIndicator}
          {"  "}
        </Text>
      </Box>
    </Box>
  )
}
