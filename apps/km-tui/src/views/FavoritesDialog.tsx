/**
 * Favorites Dialog
 *
 * M opens the favorites dialog showing all key→node mappings.
 * "Key first, then action" flow:
 * 1. List view: press any key to select it
 * 2. Detail view: shows current assignment + what Enter would assign
 *    - Enter to assign cursor node, Delete/Backspace to clear, Escape back to list
 *
 * Purely presentational — all state is in UIState, all key handling
 * goes through the command system (keybindings layer "favorites-dialog").
 */
import React from "react"
import { Box, Text, ModalDialog } from "inkx"
import { getAllFavorites, getFavorite } from "@km/commands"
import { useRepo } from "../repo-context.tsx"
import { NodeLine } from "./shared-components.tsx"

interface FavoritesDialogProps {
  /** The key selected for detail view, or null for list view */
  selectedKey: string | null
  width: number
  /** The node ID that would be assigned on Enter */
  assignNodeId: string | null
}

export function FavoritesDialog({ selectedKey, width, assignNodeId }: FavoritesDialogProps): React.ReactElement {
  const repo = useRepo()

  // Detail view: show selected key with current + pending assignment
  if (selectedKey != null) {
    const currentNodeId = getFavorite(selectedKey)
    const currentNode = currentNodeId ? repo.getNode(currentNodeId) : null
    const assignNode = assignNodeId ? repo.getNode(assignNodeId) : null
    const assignTitle = assignNode?.title ?? assignNode?.name ?? assignNodeId

    return (
      <ModalDialog
        title={`Favorite: ${selectedKey}`}
        titleAlign="flex-start"
        width={width}
        footer="enter assign  del clear  esc back"
      >
        <Box flexDirection="column">
          <Box flexDirection="row" height={1}>
            <Text dimColor>{"Current  "}</Text>
            {currentNode ? (
              <Box flexGrow={1} flexShrink={1} overflow="hidden">
                <NodeLine node={currentNode} title={currentNode.title ?? currentNode.name ?? currentNodeId!} />
              </Box>
            ) : (
              <Text dimColor>{currentNodeId ?? "(unassigned)"}</Text>
            )}
          </Box>
          <Box flexDirection="row" height={1}>
            <Text bold>{"Assign → "}</Text>
            {assignNode ? (
              <Box flexGrow={1} flexShrink={1} overflow="hidden">
                <NodeLine node={assignNode} title={assignTitle!} />
              </Box>
            ) : (
              <Text dimColor>{assignNodeId ?? "(no node selected)"}</Text>
            )}
          </Box>
        </Box>
      </ModalDialog>
    )
  }

  // List view: show all favorites, press any key to select
  const entries = Array.from(getAllFavorites().entries()).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <ModalDialog
      title="Favorites"
      titleAlign="flex-start"
      width={width}
      footer="press a key to edit  esc close"
    >
      <Box flexDirection="column">
        {entries.length === 0 ? (
          <Text dimColor>No favorites — press any key to assign</Text>
        ) : (
          entries.map(([key, nodeId]) => {
            const node = repo.getNode(nodeId)
            const title = node?.title ?? node?.name ?? nodeId
            return (
              <Box key={key} flexDirection="row" height={1}>
                <Text bold>{` ${key} `}</Text>
                <Box flexGrow={1} flexShrink={1} overflow="hidden">
                  {node ? (
                    <NodeLine node={node} title={title} />
                  ) : (
                    <Text dimColor>{nodeId}</Text>
                  )}
                </Box>
              </Box>
            )
          })
        )}
      </Box>
    </ModalDialog>
  )
}
