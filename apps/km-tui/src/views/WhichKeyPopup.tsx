/**
 * Which-key transient popup — shows available chord suffixes when a chord
 * prefix is pending. Renders immediately when pendingChord is set (the chord
 * state machine ensures fast completions clear it before the next render).
 * Disappears instantly when a suffix or Escape is pressed.
 *
 * Layout: vertical list anchored above the command box. Each entry is one row:
 *   k label
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
  goto_next: "next",
  goto_tag: "tag",
  goto_assignee: "assignee",
  goto_project: "project",
  goto_backlink: "backlink",
  cursor_last: "last",
  zoom_to_root: "root",
  // m-prefix (move)
  enter_move_mode: "move",
  move_to_inbox: "inbox",
  move_to_journal: "journal",
  move_to_home: "home",
  move_to_archive: "archive",
  move_to_project: "project",
  reparent_picker: "reparent",
  // a-prefix (add)
  add_tag: "tag",
  add_assignee: "assignee",
  add_project: "project",
  add_backlink: "backlink",
  add_to_archive: "archive",
  insert_child: "child",
  add_sibling_below: "below",
  insert_at_parent: "parent",
  // c-prefix (capture)
  capture_dialog: "dialog",
  capture_inbox: "inbox",
  capture_home: "home",
  capture_journal: "journal",
  capture_archive: "archive",
  // t-prefix (task properties)
  noop: "...",
  task_dialog: "task",
  clear_task: "clear",
  set_assignee: "assignee",
  set_due_date: "due date",
  set_priority: "priority",
  set_start_date: "start",
  set_label: "label",
  set_recurring: "recurring",
  // v-prefix (view)
  visual_mode_enter: "visual",
  cycle_view_mode: "view",
  toggle_collapse: "collapse",
  toggle_hide_done: "done",
  ignore_node: "ignore",
  filter: "filter",
  clear_filters: "clear",
  // Ctrl+W-prefix (pane operations)
  pane_split_vertical: "vsplit",
  pane_split_horizontal: "hsplit",
  pane_close: "close",
  pane_focus_left: "← focus",
  pane_focus_down: "↓ focus",
  pane_focus_up: "↑ focus",
  pane_focus_right: "→ focus",
  pane_focus_previous: "prev",
  pane_focus_next: "next",
  pane_focus_prev: "prev",
  pane_resize_grow: "wider",
  pane_resize_shrink: "narrower",
  pane_resize_grow_vertical: "taller",
  pane_resize_shrink_vertical: "shorter",
  pane_equalize: "equalize",
  pane_zoom: "zoom",
  pane_only: "only",
  pane_swap_left: "swap ←",
  pane_swap_down: "swap ↓",
  pane_swap_up: "swap ↑",
  pane_swap_right: "swap →",
}

function getLabel(commandId: string): string {
  if (SHORT_LABELS[commandId]) return SHORT_LABELS[commandId]
  const cmd = getCommand(commandId)
  return cmd?.name ?? commandId
}

interface CommandFeedbackProps {
  prefix?: string
  bellState?: string
  status?: { level: string; message: string } | null
  /** Local search state — shows match count or "No matches" */
  localSearch?: { query: string; matchIndex: number; matchCount: number } | null
  termWidth: number
}

const STATUS_COLORS: Record<string, string | undefined> = {
  info: undefined,
  success: "green",
  warning: "yellow",
  error: "red",
}

export function CommandFeedback({ prefix, bellState, status, localSearch, termWidth }: CommandFeedbackProps): React.ReactElement | null {
  // Priority 1: chord hints (existing behavior)
  if (prefix) {
    const suffixes = getChordSuffixes(prefix)
    if (suffixes.length === 0) return null

    const entries = suffixes.map((s) => ({
      key: s.key,
      label: getLabel(s.commandId),
    }))

    const maxEntryWidth = Math.max(...entries.map((e) => 1 + 1 + e.label.length))
    const popupWidth = Math.min(maxEntryWidth + 4, 44, termWidth) // +4 for border+padding, max 40 content

    return (
      <Box
        width={popupWidth}
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingLeft={1}
        paddingRight={1}
      >
        {entries.map((entry) => (
          <Text key={entry.key}>
            <Text color="yellow" bold>
              {entry.key}
            </Text>{" "}
            <Text dimColor>{entry.label}</Text>
          </Text>
        ))}
      </Box>
    )
  }

  // Max content width for single-line feedback (border+padding add 4)
  const maxWidth = Math.min(44, termWidth)

  // Priority 2: bell feedback — white border+text (like selected card); status uses level colors
  if (bellState || status) {
    const message = status?.message ?? bellState ?? ""
    const isBell = !!bellState
    return (
      <Box
        width={Math.min(message.length + 4, maxWidth)}
        borderStyle="round"
        borderColor={isBell ? "white" : "gray"}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text color={isBell ? "white" : STATUS_COLORS[status!.level]} bold={isBell}>{message}</Text>
      </Box>
    )
  }

  // Priority 3: local search match feedback
  if (localSearch && localSearch.query.length > 0) {
    const noMatches = localSearch.matchCount === 0
    const text = noMatches ? "No matches" : `${localSearch.matchIndex + 1} of ${localSearch.matchCount}`
    return (
      <Box
        width={Math.min(text.length + 4, maxWidth)}
        borderStyle="round"
        borderColor="gray"
        paddingLeft={1}
        paddingRight={1}
      >
        <Text color={noMatches ? "red" : "yellow"}>{text}</Text>
      </Box>
    )
  }

  return null
}
