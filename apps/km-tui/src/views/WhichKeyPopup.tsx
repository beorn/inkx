/**
 * Which-key transient popup — shows available chord suffixes when a chord
 * prefix is pending. Renders immediately when pendingChord is set (the chord
 * state machine ensures fast completions clear it before the next render).
 * Disappears instantly when a suffix or Escape is pressed.
 */
import React from "react"
import { Box, Text } from "inkx"
import { getChordSuffixes, getCommand } from "@km/commands"

/** Short display labels for chord commands (falls back to command name) */
const SHORT_LABELS: Record<string, string> = {
  // g-prefix (goto)
  cursor_first: "top",
  open_in_system: "open",
  open_in_terminal: "terminal",
  project_picker: "project",
  new_item: "new",
  toggle_show_ignored: "ignored",
  goto_inbox: "inbox",
  goto_journal: "journal",
  goto_home: "home",
  goto_archive: "archive",
  // m-prefix (move)
  enter_move_mode: "move",
  move_to_inbox: "inbox",
  move_to_journal: "journal",
  move_to_home: "home",
  reparent_picker: "reparent",
  // a-prefix (add)
  add_tag: "tag",
  add_assignee: "assignee",
  add_project: "project",
  add_backlink: "backlink",
  insert_child: "child",
  add_sibling_below: "below",
  insert_at_parent: "parent",
  // t-prefix (task properties)
  noop: "...",
  set_assignee: "assignee",
  set_due_date: "due date",
  set_priority: "priority",
  set_start_date: "start",
  set_label: "label",
}

function getLabel(commandId: string): string {
  if (SHORT_LABELS[commandId]) return SHORT_LABELS[commandId]
  const cmd = getCommand(commandId)
  return cmd?.name ?? commandId
}

interface WhichKeyPopupProps {
  prefix: string
  termWidth: number
}

export function WhichKeyPopup({ prefix, termWidth }: WhichKeyPopupProps): React.ReactElement | null {
  const suffixes = getChordSuffixes(prefix)
  if (suffixes.length === 0) return null

  // Build entries: { key, label }
  const entries = suffixes.map((s) => ({
    key: s.key,
    label: getLabel(s.commandId),
  }))

  // Calculate layout: each entry takes "k label" + spacing
  // Arrange in rows that fit within termWidth (minus border padding)
  const maxContentWidth = termWidth - 4 // 2 for border + 2 for padding
  const ENTRY_GAP = 2
  const rows: { key: string; label: string }[][] = []
  let currentRow: { key: string; label: string }[] = []
  let currentWidth = 0

  for (const entry of entries) {
    // "k label" width = 1 (key) + 1 (space) + label.length
    const entryWidth = 1 + 1 + entry.label.length
    const neededWidth = currentRow.length > 0 ? entryWidth + ENTRY_GAP : entryWidth

    if (currentWidth + neededWidth > maxContentWidth && currentRow.length > 0) {
      rows.push(currentRow)
      currentRow = [entry]
      currentWidth = entryWidth
    } else {
      currentRow.push(entry)
      currentWidth += neededWidth
    }
  }
  if (currentRow.length > 0) rows.push(currentRow)

  // Determine popup width: fit to content
  const contentWidth = Math.max(
    ...rows.map((row) => row.reduce((w, e, i) => w + 1 + 1 + e.label.length + (i > 0 ? ENTRY_GAP : 0), 0)),
  )
  // Add prefix header width
  const headerWidth = prefix.length + 1 // "g:"
  const popupWidth = Math.min(Math.max(contentWidth, headerWidth) + 4, termWidth) // +4 for border+padding

  return (
    <Box
      position="absolute"
      marginLeft={Math.max(0, Math.floor((termWidth - popupWidth) / 2))}
      marginBottom={1}
      width={popupWidth}
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingLeft={1}
      paddingRight={1}
    >
      {rows.map((row, ri) => (
        <Box key={ri} flexDirection="row" gap={ENTRY_GAP}>
          {row.map((entry) => (
            <Text key={entry.key}>
              <Text color="yellow" bold>
                {entry.key}
              </Text>{" "}
              <Text dimColor>{entry.label}</Text>
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}
