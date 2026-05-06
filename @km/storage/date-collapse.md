---
mentions:
  - km
  - claude
id: "@km/storage/date-collapse"
aliases:
  - km-storage.date-collapse
  - km-storage-date-collapse
created_by: claude:73c2828f
created_at: 2026-02-15T13:14:29Z
closed_at: 2026-02-18T08:05:58Z
owner: bjorn@stabell.org
assignee: claude:34ba82b6
---

# [x] Collapse due_date/time/tz and scheduled_date/time/tz into due_at and start_at @km/storage #task #P3 @claude:34ba82b6

Consolidate the split date fields in KNode into single ISO 8601 timestamps.

## Current (6 fields)

- `due_date: string` (YYYY-MM-DD)
- `due_time?: string` (HH:MM, in data blob)
- `due_tz?: string` (IANA timezone, in data blob)
- `scheduled_date?: string` (YYYY-MM-DD)
- `scheduled_time?: string` (HH:MM, in data blob)
- `scheduled_tz?: string` (IANA timezone, in data blob)

## Target (2 fields)

- `due_at?: string` — ISO 8601 timestamp with timezone (e.g., "2026-02-20T14:00:00-08:00")
- `start_at?: string` — ISO 8601 timestamp with timezone

Date-only values store as "2026-02-20" (no time component). When time is specified, full ISO 8601.

## Packages affected

- **@km/_orphan/core/types.ts** — KNode type definition
- **@km/markdown/parser.ts** — Parse date properties from markdown
- **@km/markdown/ast2nodes.ts** — AST to KNode conversion
- **@km/markdown/nodes2md.ts** — KNode to markdown serialization
- **@km/storage/** — DB schema, queries, events
- **@km/tui/** — Date display, color logic (date-range-color, cursor-colors)
- **Tests** — All files referencing due_date/scheduled_date

## Migration

- Markdown format: Decide on syntax. Currently `📅 2026-02-20` for due, `⏳ 2026-02-20` for scheduled.
  Time could be inline: `📅 2026-02-20 14:00 PST` or `📅 2026-02-20T14:00:00-08:00`
- Storage: DB migration to merge columns
- Backward compat: Read old format, write new format

## Naming rationale

- `due_at` / `start_at` — short, pairs naturally, `_at` suffix = timestamp (not just date)
- Aligns with bd's `due_at` / `defer_until` naming convention

