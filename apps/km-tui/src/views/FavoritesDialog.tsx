/**
 * Favorites Dialog
 *
 * M opens the favorites dialog showing all key→board mappings.
 * Navigate with j/k, press any key to assign current board,
 * x/X to clear, Escape to close.
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
}

export function FavoritesDialog({ cursor, width }: FavoritesDialogProps): React.ReactElement {
  const entries = Array.from(getAllFavorites().entries()).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <ModalDialog
      title="Favorites"
      titleAlign="flex-start"
      width={width}
      footer="key assign  x clear  esc close"
    >
      {entries.length === 0 ? (
        <Text dimColor>No favorites assigned</Text>
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
    </ModalDialog>
  )
}
