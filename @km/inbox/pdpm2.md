---
id: "@km/inbox/pdpm2"
aliases:
  - km-pdpm2
  - "@km/_orphan/pdpm2"
created_by: claude:f53c94c1
created_at: 2026-03-28T06:36:50Z
closed_at: 2026-03-28T15:09:13Z
close_reason: "Two fixes: (1) vault rule changed from ./inbox/** to ./inbox/**
  type:file — sections no longer matched. Removed 30 stale \\![[source-text]]
  and 4 \\![[ai-summary]] embeds from @next.md. (2) buildEmbedChild no longer
  copies source content — embed nodes stay empty so display resolves target's
  current content dynamically. state.db deleted for rebuild."
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] Rule-created embed nodes should not copy target content @km/_orphan #bug #P2 @claude:f8196c1c

## Bug
Path-based km.add:: rules like `./inbox/**` match ALL descendant nodes — including section headings inside files — because sections inherit their parent file's effective_path via the path CTE. This creates unwanted embed cards for internal sections (e.g., 'Source Text', 'AI Summary' from capdoc files).

## Fix
`type:file` filter already exists in the query engine. Change vault rules from `km.add:: ./inbox/**` to `km.add:: ./inbox/** type:file` to match only file-level nodes.

Also: clean up stale `![[source-text]]` embeds from @next.md that were created before the fix.

## Secondary issue (original description)
evaluateAddRule also sets content=match.content on rule-created embed nodes. Content should be null/empty — display text derives from embed_source at render time via getDisplayContent().