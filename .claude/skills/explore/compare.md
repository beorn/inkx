# Asana vs km TUI Comparison (`/explore --compare`)

Systematic side-by-side comparison of Asana (web UI via playwright-cli) and km TUI (via TTY MCP). Goal: identify rendering/data gaps between the source system and km's representation, then fix them.

## Setup

Open both interfaces side by side:

```bash
# Asana browser (READ-ONLY) — persistent Chrome session
bunx @playwright/cli@latest -s=asana open https://app.asana.com --headed --persistent --browser=chrome

# km TUI via TTY MCP
# Use mcp__tty__start with command: ["bun", "km", "view", "--repo", "imports/asana"]
```

**CRITICAL: Asana is READ-ONLY.** Never click "Mark complete", "Add task", "Edit", or any mutation button. Only click task cards to view details and column headers to expand/collapse.

## Workflow

1. **Create session bead**: `bd create --type=task --title "Compare: Asana vs km TUI"` with ID `km-session.MMDDx`
2. **Open both** Asana browser + TTY side by side
3. **Navigate to same board/project** in both
4. **For each column:**
   - Take Asana snapshot: `bunx @playwright/cli@latest -s=asana snapshot`
   - Take TTY screenshot: `mcp__tty__screenshot`
   - Compare: task count, task names, section headers, dates, assignees, subtask counts
5. **For each task with detail:**
   - Click task in Asana (read-only view)
   - Press Space on task in TTY
   - Compare: title, metadata fields, body content, subtasks, attachments
6. **Log discrepancies** in tracking bead notes
7. **Create beads** for each gap (P2 for data, P3 for cosmetic)
8. **Implement fixes** for clear-cut issues via background agents

## Asana Navigation (READ-ONLY)

```bash
# Snapshot current page (returns structured accessibility tree)
bunx @playwright/cli@latest -s=asana snapshot

# Screenshot (saves PNG for visual comparison)
bunx @playwright/cli@latest -s=asana screenshot --filename=/tmp/asana-screenshot.png

# Click to view task details (not edit!)
bunx @playwright/cli@latest -s=asana click <ref>

# Navigate back
bunx @playwright/cli@latest -s=asana go-back

# Close browser when done
bunx @playwright/cli@latest -s=asana close
```

## Comparison Categories

| Category | What to check | Priority |
|----------|--------------|----------|
| Data completeness | Missing fields, unresolved IDs, missing tasks | P2 |
| Field formatting | Date display, assignee format, project names | P2 |
| Card layout | Section headers, subtask counts, comment counts | P3 |
| Detail pane | Body content, subtask list, attachments | P2 |
| Cosmetic | Spacing, alignment, icons | P3 |

### What to compare per column

- **Task count**: Same number of cards in both?
- **Task names**: Exact match? Truncation differences?
- **Section headers**: Present and correctly labeled?
- **Dates**: Due dates shown? Format correct?
- **Assignees**: Shown? Resolved (name vs raw ID)?
- **Subtask counts**: Matching?

### What to compare per task detail

- **Title**: Exact match
- **Metadata fields**: Due date, assignee, project, tags, custom fields
- **Body content**: Markdown rendering, links, formatting
- **Subtasks**: All present? Correct order? Completion status?
- **Attachments**: Listed? Accessible?

## Team Mode

For thorough comparison, spawn three agents:

- **Browser agent**: Navigates Asana, extracts structured data from snapshots
- **TUI agent**: Navigates km TTY, extracts state from screenshots and text
- **Lead**: Compares outputs, creates beads, assigns fixers

The lead coordinates by having each agent dump structured data (task lists, field values) and then diffs the results.

## CRITICAL: Asana is READ-ONLY

- **NEVER** click "Mark complete", "Add task", "Edit", or any mutation button
- **ONLY** click task cards to view details, column headers to expand/collapse
- Close detail panes by clicking elsewhere or pressing Escape
- If you accidentally open an edit mode, press Escape immediately
- The Asana session uses real production data -- mutations affect real work

## Bead Conventions

- Session bead: `km-session.MMDDx` (type=task)
- Data gap beads: P2, type=bug, title like "Compare: missing due date on imported tasks"
- Cosmetic gap beads: P3, type=bug, title like "Compare: subtask count not shown on cards"
- Reference the session bead as parent for all gap beads found during the comparison
