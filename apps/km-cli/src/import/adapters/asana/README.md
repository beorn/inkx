# Asana Import Adapter

Converts Asana workspaces into km markdown files with full task hierarchy,
metadata, comments, attachments, and cross-project references.

## Asana Data Model

```
Workspace
  Teams
    Projects
      Sections
        Tasks (with subtasks, comments, attachments)
  Users (each has a "My Tasks" project)
  Tags (cross-project labels)
```

## Output Directory Structure

When workspace metadata is available (`_workspace.json`), files are organized
hierarchically:

```
{workspace}/
  {team}/
    {project}.md          # Regular projects
  users/
    @{user}.md            # Other users' My Tasks
  tags/
    #{tag}.md             # Tag aggregate files (2+ tasks)
@{importing-user}.md      # Importing user's My Tasks (top level)
```

Without workspace metadata, files are flat: `{project-slug}.md`.

## Entity Reference Conventions

- `@user-slug` -- User references (assignees, comment authors, project owners)
- `#tag-slug` -- Tag references (inline on task headings)
- `+project-slug` -- Cross-project membership (when a task belongs to multiple projects)
- `[[^GID]]` -- Block references to other tasks (converted from Asana URLs)

## Naming Policy

**Unicode-preserving slugify**: Letters from any script are preserved (e.g.,
`Bjorn Stabell` stays as `bjørn-stabell`, not `bj-rn-stabell`). Only
non-letter/non-number characters are replaced with hyphens.

**Collision handling**: When multiple entities produce the same slug within their
scope (e.g., two projects named "[Fam] Estate" in the same team), the source GID
is appended to disambiguate: `fam-estate-123456`.

## Commands

```bash
# First-time setup + fetch
bun km import asana

# Fetch from API (saves JSON to .km/imports/)
bun km import asana --fetch

# Convert saved JSON to markdown
bun km import asana --import

# From a specific download directory
bun km import asana --from .km/imports/asana-stabell-2026-02-17T15-09-50/

# Preview without writing
bun km import asana --dry-run
```

## Asana → kmast Field Mapping

| Asana API Field             | ImportItem Field | KNode (kmast) Field      | Notes                                             |
| --------------------------- | ---------------- | ------------------------ | ------------------------------------------------- |
| `name`                      | `title`          | node title               | `→ ^GID` suffix stripped (recurring instance ref) |
| `completed`                 | `status`         | `task_marker`            | `true` → "done", `false` → "todo"                 |
| `due_on` / `due_at`         | `dueAt`          | `due_at`                 | Date portion only (YYYY-MM-DD)                    |
| `start_on`                  | `startAt`        | `start_at`               | Date portion only (YYYY-MM-DD)                    |
| `assignee.name`             | `assignee`       | `assigned_to`            | Slugified: `@bjorn-stabell`                       |
| `tags[].name`               | `tags`           | inline `#tag` on heading | Multiple tags space-separated                     |
| `custom_fields["Priority"]` | `priority`       | `priority`               | Number 1-4, clamped                               |
| `resource_subtype`          | `milestone`      | stored in `data`         | `"milestone"` subtype detected                    |
| `permalink_url`             | `permalink`      | `data.source_url`        | Asana web link                                    |
| `html_notes` / `notes`      | `body`           | node body (markdown)     | HTML converted via `html-to-md.ts`                |
| `memberships[].project`     | `projects`       | `+project-slug` refs     | Cross-project membership                          |
| `memberships[].section`     | `section`        | parent heading           | Section → H2 heading in output                    |
| `parent.gid`                | `parentId`       | tree structure           | Subtask nesting                                   |
| `num_subtasks`              | —                | —                        | Used to decide whether to fetch subtasks          |
| `completed_at`              | `completedAt`    | `completed_at`           | ISO timestamp                                     |
| `created_at`                | `createdAt`      | `created_at`             | ISO timestamp                                     |
| `recurrence`                | `rrule`          | `rrule`                  | Asana JSON → RRULE + FROM (see below)             |

### Partially Mapped (in metadata)

| Asana Feature                | Storage                                            | Notes                                                                   |
| ---------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| Dependencies / dependents    | `metadata.dependencies[]`, `nodeData.dependencies` | Fetched, stored as `{gid, name}` arrays                                 |
| Custom fields (non-Priority) | `metadata.customFields`                            | All types: text, number, enum, multi-enum, display_value                |
| `completed_by`               | `metadata.completedBy`                             | Slugified name of who completed the task                                |
| `actual_time_minutes`        | `metadata.actualTimeMinutes`                       | Asana time tracking total                                               |
| `approval_status`            | `metadata.approvalStatus`                          | For approval-subtype tasks: pending/approved/rejected/changes_requested |

### Not Mapped

| Asana Feature     | Reason                           |
| ----------------- | -------------------------------- |
| Followers         | Low value for personal import    |
| `liked` / `likes` | Low priority — task hearts/likes |

### Undocumented Fields

The `recurrence` field is **not in Asana's official OpenAPI spec** but is
accessible via `opt_fields=recurrence` (discovered Oct 2024 via forum posts).
No other undocumented fields are currently known. The OpenAPI spec at
[Asana/developer-docs](https://github.com/Asana/developer-docs/blob/master/defs/asana_oas.yaml)
is the authoritative reference for documented fields.

### Recurrence

Asana uses an undocumented JSON `recurrence` object (accessible via
`opt_fields=recurrence` since ~Oct 2024). The importer converts this to
km's RRULE format with `FROM` parameter.

#### Asana Recurrence Object

```json
{"type": "weekly",       "data": {"days_of_week": [1, 3, 5], "frequency": 2}}
{"type": "monthly",      "data": {"date": 15, "frequency": 1}}
{"type": "daily",        "data": {"frequency": 3}}
{"type": "yearly",       "data": {"frequency": 1}}
{"type": "periodically", "data": {"frequency": 14}}
```

#### Asana → km RRULE Mapping

Asana's fixed-schedule types anchor to due date (`FROM=DUE`). The
`periodically` type anchors to completion date (km's default, no `FROM`
needed).

| Asana Type     | `data` Fields                 | km RRULE                                         |
| -------------- | ----------------------------- | ------------------------------------------------ |
| `daily`        | `frequency`                   | `FREQ=DAILY;INTERVAL=N;FROM=DUE`                 |
| `weekly`       | `days_of_week[]`, `frequency` | `FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=N;FROM=DUE` |
| `monthly`      | `date`, `frequency`           | `FREQ=MONTHLY;BYMONTHDAY=N;INTERVAL=N;FROM=DUE`  |
| `yearly`       | `frequency`                   | `FREQ=YEARLY;INTERVAL=N;FROM=DUE`                |
| `periodically` | `frequency`                   | `FREQ=DAILY;INTERVAL=N`                          |

Day-of-week mapping: Asana 1=Mon → `MO`, 2=Tue → `TU`, ..., 7=Sun → `SU`.

The `periodically` type is Asana's "repeat after completion" — the next task
is created N days after the previous one is completed (max 30 days in Asana).
This maps to km's default anchoring (`FROM=COMPLETED`, omitted).

#### Recurring Task Instances

Asana represents recurring tasks as a template task plus individual instances.
Each instance has `→ ^{templateGID}` appended to its name. The importer:

1. **Strips** the `→ ^GID` suffix from the instance title
2. **Stores** the template GID in `metadata.parentTaskGid`
3. **Creates** an `embed_of` link on the node pointing to the template
4. **Maps** the `recurrence` field to an RRULE string on the kmast node

See [docs/design/recurrence.md](/docs/design/recurrence.md) for the full
recurrence design, cross-system comparison, and RRULE format reference.

## Files

| File                 | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `asana-api.ts`       | Asana REST API client, fetch orchestration, workspace resolution |
| `asana-client.ts`    | Low-level HTTP client with rate limiting and retries             |
| `asana-types.ts`     | Asana API type definitions                                       |
| `asana-file.ts`      | Parser for Asana's "Export to JSON" file format                  |
| `asana-adapter.ts`   | ImportAdapter interface implementation                           |
| `asana-discovery.ts` | Workspace/project listing for discovery mode                     |
| `task-transform.ts`  | Asana API task to ImportItem conversion                          |
| `comment-filter.ts`  | Filters system/audit-log comments from real user comments        |
