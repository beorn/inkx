#!/usr/bin/env bun
/**
 * Converts board.press("key") → board.command("commandId") in test files.
 *
 * Only converts unambiguous single-key mappings in normal mode.
 * Chord sequences like .press("v").press("c") → .command("toggle_collapse").
 * Leaves text editing, Escape, Enter, and modifier keys as press().
 *
 * Usage: bun scripts/convert-press-to-command.ts [--dry-run] [file...]
 */

import { readFileSync, writeFileSync } from "fs"
import { Glob } from "bun"

// ============================================================================
// Key → Command mappings (normal mode, no modifiers, no when guards)
// ============================================================================

const SIMPLE_KEY_MAP: Record<string, string> = {
  // Navigation
  j: "cursor_down",
  k: "cursor_up",
  h: "cursor_left",
  l: "cursor_right",
  G: "cursor_last",
  J: "block_nav_down",
  K: "block_nav_up",

  // Fold
  H: "fold_more",
  L: "unfold_more",
  "<": "fold_all_more",
  ">": "unfold_all_more",

  // Zoom
  z: "zoom_inwards",
  Z: "zoom_outwards",

  // Edit
  I: "enter_body_edit",
  o: "insert_below",
  O: "insert_above",
  u: "undo",
  U: "redo",
  Tab: "indent_node",

  // Task
  x: "toggle_task_done",
  X: "cycle_task_status",

  // Selection
  " ": "select_toggle",

  // View
  V: "filter",
  "?": "show_help",
  ".": "increase_content_lines",
  ",": "decrease_content_lines",
  "-": "decrease_content_lines",
  "=": "increase_content_lines",
  "/": "local_find",
  ":": "command_palette",
  q: "quit",

  // Detail
  D: "toggle_detail_pane",

  // Other
  T: "task_dialog",
  M: "manage_favorites",
  F: "search_replace",
}

// Chord sequences: [prefix, suffix] → commandId
const CHORD_MAP: [string, string, string][] = [
  // v-prefix
  ["v", "c", "toggle_collapse"],
  ["v", "d", "toggle_hide_done"],
  ["v", "m", "cycle_view_mode"],

  ["v", "v", "visual_mode_enter"],
  ["v", "x", "hide_node"],
  ["v", "X", "toggle_show_hidden"],
  ["v", "-", "clear_filters"],
  ["v", ",", "filter"],
  ["v", "s", "toggle_sticky_fold"],
  ["v", "|", "pane_split_vertical"],
  ["v", "h", "pane_focus_left"],
  ["v", "j", "pane_focus_down"],
  ["v", "k", "pane_focus_up"],
  ["v", "l", "pane_focus_right"],
  ["v", ">", "pane_resize_grow"],
  ["v", "<", "pane_resize_shrink"],
  ["v", "=", "pane_equalize"],
  ["v", "w", "pane_close"],
  ["v", "o", "pane_only"],
  ["v", "z", "pane_zoom"],
  ["v", "n", "pane_focus_next"],
  ["v", "N", "pane_focus_prev"],
  ["v", "p", "pane_focus_previous"],
  // g-prefix
  ["g", "g", "cursor_first"],
  ["g", "G", "cursor_last"],
  ["g", "o", "open_in_system"],
  ["g", "O", "open_in_terminal"],
  // m-prefix
  ["m", "m", "enter_move_mode"],
  ["m", "a", "archive"],
  // t-prefix
  ["t", "t", "task_dialog"],
  ["t", "-", "clear_task"],
  ["t", "o", "set_assignee"],
  ["t", "d", "set_due_date"],
  ["t", "!", "set_priority"],
  ["t", "0", "set_priority_0"],
  ["t", "1", "set_priority_1"],
  ["t", "2", "set_priority_2"],
  ["t", "3", "set_priority_3"],
  ["t", "4", "set_priority_4"],
  ["t", "s", "cycle_task_status"],
  ["t", "r", "set_recurring"],
  ["t", "l", "set_label"],
]

// Keys that should NEVER be converted (context-dependent)
const SKIP_KEYS = new Set([
  "Escape",
  "Enter",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
])

// ============================================================================
// Conversion logic
// ============================================================================

function isTextInputContext(line: string, prevLines: string[]): boolean {
  // Check if we're in an inline editing context by looking at surrounding lines
  const context = [...prevLines.slice(-10), line].join("\n")
  return (
    context.includes("enter_inline_edit") ||
    context.includes("enter_body_edit") ||
    context.includes('command("enter_inline_edit")') ||
    context.includes('command("enter_body_edit")') ||
    context.includes('.press("i")') ||
    context.includes('.press("I")') ||
    context.includes(".type(") ||
    // Check for inline editing markers
    /(?:inline|edit|editing|body edit)/i.test(context)
  )
}

function convertFile(filePath: string, dryRun: boolean): { converted: number; skipped: number } {
  let content = readFileSync(filePath, "utf-8")
  let converted = 0
  let skipped = 0

  // Step 1: Convert chord sequences
  // .press("v").press("c") → .command("toggle_collapse")
  for (const [prefix, suffix, commandId] of CHORD_MAP) {
    const prefixEsc = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const suffixEsc = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const pattern = new RegExp(
      `\\.press\\("${prefixEsc}"\\)\\.press\\("${suffixEsc}"\\)`,
      "g",
    )
    const matches = content.match(pattern)
    if (matches) {
      content = content.replace(pattern, `.command("${commandId}")`)
      converted += matches.length
    }
  }

  // Step 2: Convert simple single-key presses
  // .press("j") → .command("cursor_down")
  // But only when NOT in a text editing context (heuristic: no preceding .press("i") or .press("Enter") in same chain)
  for (const [key, commandId] of Object.entries(SIMPLE_KEY_MAP)) {
    if (SKIP_KEYS.has(key)) continue

    const keyEsc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const pattern = new RegExp(`\\.press\\("${keyEsc}"\\)`, "g")

    // Process line by line for context awareness
    const lines = content.split("\n")
    const newLines: string[] = []
    let inEditBlock = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const match = pattern.exec(line)
      pattern.lastIndex = 0 // Reset regex state

      if (!match) {
        newLines.push(line)
        // Track edit mode
        if (
          line.includes('command("enter_inline_edit")') ||
          line.includes('command("enter_body_edit")') ||
          line.includes(".type(")
        ) {
          inEditBlock = true
        }
        if (
          line.includes('command("text.exit_edit")') ||
          line.includes('press("Escape")') ||
          line.includes("})") ||
          line.trim() === ""
        ) {
          inEditBlock = false
        }
        continue
      }

      // Skip if we think we're in an editing context
      if (inEditBlock) {
        newLines.push(line)
        skipped++
        continue
      }

      // Replace all occurrences on this line
      const newLine = line.replace(pattern, `.command("${commandId}")`)
      if (newLine !== line) {
        const count = (line.match(pattern) || []).length
        converted += count
      }
      newLines.push(newLine)
    }

    content = newLines.join("\n")
  }

  if (!dryRun && converted > 0) {
    writeFileSync(filePath, content)
  }

  return { converted, skipped }
}

// ============================================================================
// Main
// ============================================================================

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const files = args.filter((a) => !a.startsWith("--"))

let targetFiles: string[]
if (files.length > 0) {
  targetFiles = files
} else {
  const glob = new Glob("apps/km-tui/tests/**/*.{test,spec,bench,fuzz}.{ts,tsx}")
  targetFiles = [...glob.scanSync(".")].filter(
    (f) => !f.includes("node_modules") && !f.includes("helpers/"),
  )
}

let totalConverted = 0
let totalSkipped = 0
const changedFiles: string[] = []

for (const file of targetFiles) {
  const { converted, skipped } = convertFile(file, dryRun)
  totalConverted += converted
  totalSkipped += skipped
  if (converted > 0) {
    changedFiles.push(`  ${file} (${converted} converted, ${skipped} skipped)`)
  }
}

console.log(`\n${dryRun ? "[DRY RUN] " : ""}Conversion complete:`)
console.log(`  Total converted: ${totalConverted}`)
console.log(`  Total skipped (edit context): ${totalSkipped}`)
console.log(`  Files changed: ${changedFiles.length}`)
if (changedFiles.length > 0) {
  console.log(`\nChanged files:`)
  for (const f of changedFiles) console.log(f)
}
