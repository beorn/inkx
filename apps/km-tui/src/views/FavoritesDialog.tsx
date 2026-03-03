/**
 * Favorites Dialog
 *
 * M opens the favorites dialog showing all key→board mappings.
 * Press any key to assign the current board to that key.
 * x/X to clear the selected favorite, Escape to close.
 *
 * Purely presentational — all state is in UIState, all key handling
 * goes through the command system (keybindings layer "favorites-dialog").
 */
import React from "react"
import { Box, Text, ModalDialog } from "inkx"
import { getAllFavorites } from "@km/commands"

interface FavoritesDialogProps {
  cursor: number
  width: number
  /** Name/path of the board that will be assigned when pressing a key */
  boardName: string | null
}

export function FavoritesDialog({ cursor, width, boardName }: FavoritesDialogProps): React.ReactElement {
  const entries = Array.from(getAllFavorites().entries()).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <ModalDialog
      title="Favorites"
      titleAlign="flex-start"
      width={width}
      footer="press key to assign  x clear  esc close"
    >
      <Box flexDirection="column" gap={1}>
        {/* Current board — what will be assigned */}
        <Box flexDirection="row" gap={1}>
          <Text dimColor>Assign:</Text>
          <Text bold>{boardName ?? "(no board)"}</Text>
        </Box>
        {/* Existing favorites */}
        <Box flexDirection="column">
          {entries.length === 0 ? (
            <Text dimColor>No favorites yet</Text>
          ) : (
            entries.map(([key, boardId], i) => {
              const isActive = i === cursor
              return (
                <Box key={key} flexDirection="row" gap={1}>
                  <Text inverse={isActive} bold={isActive}>
                    {` ${key} `}
                  </Text>
                  <Text inverse={isActive} dimColor={!isActive}>
                    {boardId}
                  </Text>
                </Box>
              )
            })
          )}
        </Box>
      </Box>
    </ModalDialog>
  )
}
