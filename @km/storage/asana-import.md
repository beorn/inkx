---
id: "@km/storage/asana-import"
aliases:
  - km-storage.asana-import
  - km-storage-asana-import
created_by: claude:8f007ba9
created_at: 2026-02-20T13:52:06Z
closed_at: 2026-02-21T08:42:18Z
owner: bjorn@stabell.org
assignee: claude:4c413aae
---

# [x] Asana import: multi-step progress, section preservation, entity display fixes @km/storage #task #P2 @claude:4c413aae

## Asana Import: Full Pipeline Quality

### Completed
- mdast refactor: rehype→hast→mdast pipeline replaces Turndown (html-to-md.ts)
- htmlBody preservation: task-transform.ts saves raw html_notes, convert.ts prefers it
- splitBodyAtHeadings: body headings rebased to proper depth under parent task
- Checkbox normalization: [] → [ ] (standard markdown task list syntax)
- Autolink preservation: <URL> not stripped by HTML tag regex
- Detail pane: completed items folded/dimmed, body content spacing
- Directory hierarchy, entity refs, Unicode slugs, inline date props
- Cross-project dedup, user task lists, attachment relocation

### In Progress
- **Refetch needed**: cached JSON has flat Turndown markdown without htmlBody. Claude Code SIGTERM kills long processes. Run manually in terminal:
  bun km import asana --workspace Stabell --fetch --fetch-restart
  bun km import asana --workspace Stabell --import --force
- **TUI [x] rendering bug**: Launch Academy cards show [x] without titles. DB has correct titles. Investigating.
- **Inline AST**: Replace regex text pipeline with AST→JSX rendering (@km/tui/inline-ast)

### Related
- @km/session/0220b: session tracking
- @km/tui/inline-ast: inline AST rendering pipeline