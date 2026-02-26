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

| Asana API Field | ImportItem Field | KNode (kmast) Field | Notes |
|-----------------|-----------------|---------------------|-------|
| `name` | `title` | node title | `→ ^GID` suffix stripped (recurring instance ref) |
| `completed` | `status` | `task_marker` | `true` → "done", `false` → "todo" |
| `due_on` / `due_at` | `dueAt` | `due_at` | Date portion only (YYYY-MM-DD) |
| `start_on` | `startAt` | `start_at` | Date portion only (YYYY-MM-DD) |
| `assignee.name` | `assignee` | `assigned_to` | Slugified: `@bjorn-stabell` |
| `tags[].name` | `tags` | inline `#tag` on heading | Multiple tags space-separated |
| `custom_fields["Priority"]` | `priority` | `priority` | Number 1-4, clamped |
| `resource_subtype` | `milestone` | stored in `data` | `"milestone"` subtype detected |
| `permalink_url` | `permalink` | `data.source_url` | Asana web link |
| `html_notes` / `notes` | `body` | node body (markdown) | HTML converted via `html-to-md.ts` |
| `memberships[].project` | `projects` | `+project-slug` refs | Cross-project membership |
| `memberships[].section` | `section` | parent heading | Section → H2 heading in output |
| `parent.gid` | `parentId` | tree structure | Subtask nesting |
| `num_subtasks` | — | — | Used to decide whether to fetch subtasks |
| `completed_at` | `completedAt` | `completed_at` | ISO timestamp |
| `created_at` | `createdAt` | `created_at` | ISO timestamp |

### Not Mapped

| Asana Feature | Reason | Workaround |
|---------------|--------|------------|
| Recurrence rules | Asana API does not expose RRULE | `→ ^GID` suffix creates `embed_source` link to template task. See bead `km-tui.asana-recurrence` for planned RRULE synthesis. |
| Dependencies | Fetched but not yet converted | `dependencies`/`dependents` fields available in API response |
| Custom fields (non-Priority) | Varied schemas | Could map to kmast metadata with custom field names |
| Followers | Not imported | Low value for personal import |

### Recurring Tasks

Asana represents recurring tasks as a template task plus individual instances.
Each instance has `→ ^{templateGID}` appended to its name. The importer:

1. **Strips** the `→ ^GID` suffix from the instance title
2. **Stores** the template GID in `metadata.parentTaskGid`
3. **Creates** an `embed_source` link on the node pointing to the template

No `recurrence` RRULE is set — the kmast `recurrence` field (iCal RRULE format
like `FREQ=WEEKLY;BYDAY=MO`) is not populated during Asana import. Planned
improvement: infer RRULE from instance time deltas (see `km-tui.asana-recurrence`).

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
