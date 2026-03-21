/**
 * Favorites Dialog
 *
 * M opens the favorites dialog showing all locations organized by type:
 * - System locations (h,i,j,a,p,g,G) — read-only navigation targets
 * - Picker locations (#,@,+,[) — read-only picker triggers
 * - Digit favorites (0-9) — always shown, assignable, "(empty)" when unset
 * - Custom favorites — any other user-assigned letter keys
 *
 * "Key first, then action" flow:
 * 1. List view: press any key to select it
 * 2. Detail view: shows current assignment + what Enter would assign
 *    - Enter to assign cursor node, Delete/Backspace to clear, Escape back to list
 *
 * Purely presentational — all state is in UIState, all key handling
 * goes through the command system (keybindings layer "favorites-dialog").
 */
import React from "react"
import { Box, Text, ModalDialog, H1, H2, Muted, Small, Strong } from "@silvery/react"
import { getAllFavorites, getFavorite, SYSTEM_LOCS, PICKER_LOCS, DIGIT_KEYS } from "@km/commands"
import { useRepo } from "../repo-context.tsx"
import { NodeLine } from "./shared-components.tsx"

interface FavoritesDialogProps {
  /** The key selected for detail view, or null for list view */
  selectedKey: string | null
  width: number
  /** The node ID that would be assigned on Enter */
  assignNodeId: string | null
}

/** Section header with dimmed label */
function SectionHeader({ label }: { label: string }): React.ReactElement {
  return (
    <Box height={1}>
      <H2>{label}</H2>
    </Box>
  )
}

/** A single key→label/node row */
function KeyRow({
  keyChar,
  label,
  nodeId,
  dimLabel,
}: {
  keyChar: string
  label?: string
  nodeId?: string | null
  dimLabel?: boolean
}): React.ReactElement {
  const repo = useRepo()
  const node = nodeId ? repo.getNode(nodeId) : null
  const title = node?.title ?? node?.name ?? nodeId

  return (
    <Box flexDirection="row" height={1}>
      <H1>{` ${keyChar} `}</H1>
      {node && title ? (
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <NodeLine node={node} title={title} />
        </Box>
      ) : label ? (
        dimLabel ? (
          <Muted>{label}</Muted>
        ) : (
          <Text>{label}</Text>
        )
      ) : (
        <Muted>{"(empty)"}</Muted>
      )}
    </Box>
  )
}

export function FavoritesDialog({ selectedKey, width, assignNodeId }: FavoritesDialogProps): React.ReactElement {
  const repo = useRepo()

  // Detail view: show selected key with current + pending assignment
  if (selectedKey !== null) {
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
            <Small>{"Current  "}</Small>
            {currentNode ? (
              <Box flexGrow={1} flexShrink={1} overflow="hidden">
                <NodeLine node={currentNode} title={currentNode.title ?? currentNode.name ?? currentNodeId ?? ""} />
              </Box>
            ) : (
              <Muted>{currentNodeId ?? "(unassigned)"}</Muted>
            )}
          </Box>
          <Box flexDirection="row" height={1}>
            <Strong>{"Assign \u2192 "}</Strong>
            {assignNode ? (
              <Box flexGrow={1} flexShrink={1} overflow="hidden">
                <NodeLine node={assignNode} title={assignTitle ?? ""} />
              </Box>
            ) : (
              <Muted>{assignNodeId ?? "(no node selected)"}</Muted>
            )}
          </Box>
        </Box>
      </ModalDialog>
    )
  }

  // List view: show all locations organized by type
  const allFavorites = getAllFavorites()

  // Collect custom favorites (non-digit, non-reserved keys)
  const digitKeySet = new Set<string>(DIGIT_KEYS)
  const systemKeySet = new Set(Object.keys(SYSTEM_LOCS))
  const pickerKeySet = new Set(Object.keys(PICKER_LOCS))
  const customEntries: Array<[string, string]> = []
  for (const [key, nodeId] of allFavorites) {
    if (!digitKeySet.has(key) && !systemKeySet.has(key) && !pickerKeySet.has(key)) {
      customEntries.push([key, nodeId])
    }
  }
  customEntries.sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <ModalDialog title="Locations" titleAlign="flex-start" width={width} footer="press a key to assign  esc close">
      <Box flexDirection="row" gap={2}>
        {/* Left column: System + Picker locations */}
        <Box flexDirection="column" flexGrow={1} flexBasis={0}>
          <SectionHeader label="System" />
          {Object.entries(SYSTEM_LOCS).map(([key, loc]) => (
            <KeyRow key={key} keyChar={key} label={loc.label} />
          ))}
          <Box height={1} />
          <SectionHeader label="Pickers" />
          {Object.entries(PICKER_LOCS).map(([key, loc]) => (
            <KeyRow key={key} keyChar={key} label={loc.label} />
          ))}
        </Box>

        {/* Right column: Digit favorites + Custom favorites */}
        <Box flexDirection="column" flexGrow={1} flexBasis={0}>
          <SectionHeader label="Favorites" />
          {DIGIT_KEYS.map((key) => (
            <KeyRow key={key} keyChar={key} nodeId={allFavorites.get(key)} />
          ))}
          {customEntries.length > 0 && (
            <>
              <Box height={1} />
              <SectionHeader label="Custom" />
              {customEntries.map(([key, nodeId]) => (
                <KeyRow key={key} keyChar={key} nodeId={nodeId} />
              ))}
            </>
          )}
        </Box>
      </Box>
    </ModalDialog>
  )
}
