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
