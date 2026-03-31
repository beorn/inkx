# km Roadmap

km is a PIM/PKM engine that turns markdown files into a queryable, navigable semantic tree — rendered as a TUI. Your data stays in plain markdown. km adds structure, navigation, and task management without lock-in. The long-term vision is a full personal information manager: tasks, notes, contacts, calendar, and AI agents — all keyboard-driven, all markdown-native.

## Horizon 1: TUI Polish

Current work. Tracked by the km-tui epic.

The board view is functional but rough. This horizon smooths the edges — every interaction should feel crisp and intentional.

- Bottom bar: move counters right, flash-on-change notifications, log display
- Search UX: goto-result navigation, delay/debounce, truncation fixes, zoom-to-match
- Inline edit improvements: key handling, save-on-navigate, richer editing modes
- Console rework: scrollback, bottom-bar integration, notification count
- View modes: outline depth control, content line preview, auto-layout for different board shapes
- Loading states: skeleton screens, startup progress indicator

## Horizon 2: Multi-Select & Batch Operations

Tracked by km-tui sub-beads.

Single-item operations are limiting. Multi-select unlocks batch workflows: triage, bulk status changes, drag-to-column.

- Horizontal range select: Shift+arrow to select across columns
- Vertical range select: Shift+up/down within a column
- Batch operations: move, set status, set priority, delete — applied to selection
- Visual feedback: highlight color for selected items, count indicator
- Keyboard-driven: toggle select, select-all-in-column, invert selection

## Current State

The core engine is operational: parser, query system, bidirectional sync, SQLite storage, CLI, and a functional TUI with kanban board view. Active development is focused on TUI polish and the rendering engine (Silvery).

What works today:

- Markdown parsing with inline refs, fields, and section trees
- Query system with search, filtering, and date shortcuts
- Kanban board TUI with column display, detail pane, and item picker (project/tag/assignee)
- Bidirectional sync: edits in TUI write back to markdown files
- SQLite storage with event history (disk mode) or ephemeral in-memory (memory mode)
- CLI for quick capture, task management, and GTD bootstrap
- Watch mode for live file sync
- Inline editing of task titles directly on the board
- Command system with configurable keybindings

---

Horizons represent increasing ambition, not strict ordering — they overlap freely. No dates; this is a direction document.

## Horizon 3: Task Management

Asana-grade task management in the terminal.

km currently handles status and priority. This horizon adds the fields and views that make it a real project management tool.

- Assignee management: assign/reassign, multi-assignee, avatar/initials display on cards
- Date fields: due date, start date, scheduled date — with a date picker widget
- Dependencies: blocked-by / blocks relationships, visualized on the board (dimmed/locked cards)
- Custom fields: per-project field schemas beyond the built-in priority and status
- Recurring tasks: daily/weekly/monthly recurrence with auto-create on completion
- Subtask progress: rollup display (3/7 done) on parent cards
- My Tasks view: filter by assignee across all projects in a single board
- Timeline view: Gantt-style column layout showing tasks over time
- Notifications: overdue alerts, assignment notifications, status change feed

## Horizon 4: Links & Navigation

Turn km into a connected knowledge base.

Markdown already supports links; km should make them first-class navigable objects.

- Link viewing: inline preview of link targets in the detail pane
- Link editing: fuzzy-search link insertion (like Obsidian's [[ trigger)
- Link following: Enter on a link navigates to the target node
- Backlink panel: "referenced by" section in the detail pane
- Transclusion: ![[embed]] syntax renders referenced content inline
- Block references: ^block-id for linking to specific paragraphs or list items

## Horizon 5: Editing

From task board to document editor.

Currently km edits task titles inline. This horizon brings rich, markdown-native editing to the detail pane and beyond.

- Undo/redo: integrated across text edits and node mutations via the event log
- Rich text editing (markdown-native):
  - - creates/converts bulleted lists
  - Bold, italic, code, strikethrough via inline markdown syntax
  - Code blocks with syntax highlighting
  - Block quotes, headings, horizontal rules
- Block-level selection: select paragraphs, list items, or sections as units
- Item-level selection: select cards or sections as atomic units for move/copy
- Split/merge: split a node at cursor, merge adjacent nodes

## Horizon 6: Mouse & Direct Manipulation

Keyboard-first doesn't mean keyboard-only.

Mouse support makes km accessible to more people and enables interactions that are awkward with keys alone.

- Mouse infrastructure: hit registry via Silvery layout feedback (position → element mapping)
- Click-to-select: click a card to focus it, click a column header to focus column
- Scroll wheel: vertical scrolling in columns and detail pane
- Double-click: edit a card title, or drill into a node
- Drag area select: rectangle selection across cards
- Drag-and-drop: move cards between columns, reorder within columns
- Click to follow links: clickable links in the detail pane

## Horizon 7: Structured Data

From tasks to any kind of structured information.

Supertags (like Tana) let users define typed nodes with field schemas — turning km into a flexible database.

- Supertags: typed nodes with field schemas (e.g., #meeting has date, attendees, notes)
- Dynamic boards: saved queries with filtering and grouping (e.g., "all meetings this week")
- Computed fields: rollups, formulas, aggregations across linked nodes
- Templates: node templates applied via supertag or command palette
- Custom views per supertag: different board layouts for different content types

## Horizon 8: AI Agents

Designed in docs/future/agents.md.

Agents are AI-powered workers that claim tasks, execute sessions, and produce events — pure functions with full audit trails.

- Agent orchestration: km agent CLI for spawning, running, and managing agents
- Hub TUI: km hub dashboard for multi-agent coordination — see agents, queues, and live events
- Kimmi: built-in assistant for task triage, content generation, and project review
- Harness system: preconfigured tool+connector bundles that equip agents for specific roles
- Beads integration: agents discover, claim, and close issues like human workers

## Horizon 9: Connectors & Services

Designed in docs/future/services.md.

km becomes the hub that connects your information sources.

- CalDAV/CardDAV sync: calendar events and contacts as km nodes
- GitHub integration: issues and PRs imported and synced
- Daily notes / journal: Roam-style daily pages with auto-created date nodes
- Slash commands: quick capture from anywhere (inline /task, /note, /event)
- Webhook receiver: ingest events from external services

## Horizon 10: Real-time Collaboration

km for teams.

Moving from single-user to multi-user requires a sync layer, conflict resolution, and eventually a web frontend.

- Cloud sync service: persistent sync daemon (like Decker's cloudsv)
- CRDT layer: Yjs or similar, replacing or augmenting the SQLite event log for concurrent edits
- Multi-user editing: presence indicators, cursor positions, live updates
- Conflict resolution UI: when CRDTs aren't enough, show conflicts and let users resolve
- Web frontend: share km boards in a browser — read-only initially, then editable

---

## Foundation

Cross-cutting work that supports all horizons. Tracked by dedicated epics.

| Area     | Epic        | Focus                                                                     |
| -------- | ----------- | ------------------------------------------------------------------------- |
| Silvery  | km-silvery  | Terminal rendering engine — performance, correctness, incremental updates |
| flexily  | km-flexily  | Flexbox layout engine for terminal UI                                     |
| vimonkey | km-vimonkey | Test framework, benchmarks, diagnostics                                   |
| Infra    | km-infra    | CI, monorepo packaging, linting, regression suites                        |

