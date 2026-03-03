/**
 * Favorites Dialog
 *
 * M opens the favorites dialog showing all key→node mappings.
 * Press 'a' to add: shows an input row capturing the next key press.
 * x/X to clear the selected favorite, Escape to close.
 *
 * Each favorite row shows the key badge + NodeLine (icon + title).
 * Purely presentational — all state is in UIState, all key handling
 * goes through the command system (keybindings layer "favorites-dialog").
 */
import React from "react"
import { Box, Text, ModalDialog } from "inkx"
import { getAllFavorites } from "@km/commands"
import { useRepo } from "../repo-context.tsx"
import { NodeLine } from "./shared-components.tsx"

interface FavoritesDialogProps {
  cursor: number
  width: number
  /** Whether we're in "add" mode (capturing a key press) */
  addMode: boolean
  /** Name of the node that will be assigned in add mode */
  assignNodeName: string | null
}

export function FavoritesDialog({ cursor, width, addMode, assignNodeName }: FavoritesDialogProps): React.ReactElement {
  const repo = useRepo()
  const entries = Array.from(getAllFavorites().entries()).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <ModalDialog
      title="Favorites"
      titleAlign="flex-start"
      width={width}
      footer={addMode ? "press a key to assign  esc cancel" : "a add  x clear  esc close"}
    >
      <Box flexDirection="column">
        {entries.length === 0 && !addMode ? (
          <Text dimColor>No favorites — press 'a' to add</Text>
        ) : (
          entries.map(([key, nodeId], i) => {
            const isActive = i === cursor && !addMode
            const node = repo.getNode(nodeId)
            const title = node?.title ?? node?.name ?? nodeId
            return (
              <Box key={key} flexDirection="row" height={1}>
                <Text inverse={isActive} bold={isActive}>
                  {` ${key} `}
                </Text>
                <Box flexGrow={1} flexShrink={1} overflow="hidden">
                  {node ? (
                    <NodeLine node={node} title={title} isSelected={isActive} />
                  ) : (
                    <Text dimColor>{nodeId}</Text>
                  )}
                </Box>
              </Box>
            )
          })
        )}
        {/* Add mode: input row at the bottom */}
        {addMode && (
          <Box flexDirection="row" height={1}>
            <Text inverse bold>
              {" _ "}
            </Text>
            <Text> {assignNodeName ?? "(no node selected)"}</Text>
          </Box>
        )}
      </Box>
    </ModalDialog>
  )
}
