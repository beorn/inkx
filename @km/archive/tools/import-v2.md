---
mentions:
  - km
  - claude
id: "@km/tools/import-v2"
aliases:
  - km-tools.import-v2
  - km-tools-import-v2
created_by: claude:54aefa32
created_at: 2026-02-17T21:30:01Z
closed_at: 2026-02-18T07:50:46Z
owner: bjorn@stabell.org
assignee: claude:54aefa32
---

# [x] Import pipeline v2: metadata, naming, reconciliation, comment filtering @km/tools #task #P2 @claude:54aefa32

## Import Pipeline v2

Second pass improvements after initial Asana full export (62 projects, 52K items, 7K comments, 2K attachments).

### Items

1. **GID+slug file naming** — Use `{gid}-{slug}.json` and `{gid}-{slug}.md` to prevent slug collisions (found: two [Fam] Estate projects both slugifying to fam-estate). Also makes reconciliation trivial.
2. **Empty projects bug** — 6 projects saved with 0 items despite API returning data (Inbox: 28, Fam Life: 92, Digitalzen: 90, NewCo Maybe: 86, NewCo MFP: 92, SLT3103 Smarthome: 100+). Likely caused by slug collision or resume-from-stale-JSON. Re-fetch with GID+slug naming should fix.
3. **Metadata & dates** — Capture all Asana metadata in .md frontmatter and inline:
  - Project: created_at, modified_at, workspace, owner, team
  - Task: created_at, completed_at, modified_at (currently only have created/completed inline)
  - Frontmatter should include workspace info
4. **System comment filtering** — Pre-2020 consolidated comments contain multiple system actions in one comment, separated by `----------------------`. Current regex only matches at comment start. Need to detect 'Name on Date Time:' + action patterns within comment bodies. Actions to filter: marked today, unmarked today, unassigned from you, marked this task complete, changed the due date, changed the name, changed the description, added the description, moved from/into/out of, removed from, added subtask to task.
5. **Tasks without projects** — Some tasks exist only in My Tasks or attached to tags (@PA, @china) but not in any project. Need to fetch these orphan tasks.
6. **Asana link → backlinks** — Convert `https://app.asana.com/0/{project_gid}/task/{task_gid}` and similar URL patterns to `[[slug]]` backlinks where possible.
7. **Reconciliation** — At end of export, verify: task count matches API, no missing projects, attachment success rate. Print summary diff.
8. **Workspace tracking** — Record which workspace each project came from in frontmatter.

