---
id: "@km/tui/backlog-view"
aliases:
  - km-tui.backlog-view
  - km-tui-backlog-view
created_by: claude:18c72b43
created_at: 2026-04-20T17:33:15Z
---

# [ ] km-tui backlog view: ordered tree render with prominent short IDs @km/tui #feature #P3

blocks:: [[@km/tui]]

A silvery view type for rendering any node's ordered children as a backlog / ranked-list UI.

## What it is

Alongside card view, column view, outline view, tab view — a new 'backlog view' that renders the current node's children as:

- Ordered vertical list (positional order = rank; top = next)
- Short ID prominently displayed (e.g., 'TUI-47 · Omnibox v1 finish')
- Status badge, priority hint, assignee
- Drag-to-reorder (writes back to the file / markdown positional order)
- Sections if children have header nodes (Now / Queued / Parallel / Later)
- Consistent with the existing @km/tui view-type switching

## Why a view, not a bd feature

A backlog is just 'a node whose ordered children represent a ranked queue.' Any KNode can be viewed as a backlog. Meta-backlogs (like current docs/backlog.md) compose via wikilinks. No backlog-specific data model needed — just a rendering mode.

## Inputs from other beads

- @km/infra/namespaces (P3, deferred): provides namespace-scoped short IDs (TUI-47, #silvery^47) that this view surfaces prominently.
- @km/infra/bd-v1-compat: when bead nodes have persistent status/priority, this view displays them in the right-hand badges.

## Scope

- New view type 'backlog' in silvery / @km/tui view selector
- Render ordered children with short-ID-forward styling
- Drag-to-reorder (ListView-based, uses existing multi-select infra)
- Keyboard nav: open item with Enter, status/priority shortcuts
- Section headers detected from child markdown headings

## Relationship to current docs/backlog.md

Current backlog.md is a meta-backlog (curated pull from area backlogs via workstream bullets). This view renders such files nicely, plus area-specific backlog files (once they exist, e.g., packages/@km/tui/backlog.md as the tui area backlog).

## Deferrable

Low priority; current ordered list in markdown is already readable. Ship when user-facing short IDs (@km/infra/namespaces) land AND the first area backlog is created OR a tribe-matrix room view demands it.