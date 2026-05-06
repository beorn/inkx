---
mentions:
  - km
  - claude
id: "@km/cli/comment-parse"
aliases:
  - km-cli.comment-parse
  - km-cli-comment-parse
created_by: claude:28b14b32
created_at: 2026-02-23T16:48:02Z
closed_at: 2026-02-23T16:52:12Z
owner: bjorn@stabell.org
assignee: claude:28b14b32
---

# [x] Asana import: comment parsing issues (dates, names, structure) @km/cli #bug #P2 @claude:28b14b32

Multiple issues with Asana comment import:

1. **Extraneous name**: Comment body includes 'Bjorn Stabell on Friday Mar 03, 2017 06:37 AM:' — redundant since we already have @user and date in the li prefix
2. **Two dates**: The li prefix has '2018-05-29' but the body has 'Friday Mar 03, 2017' — the Asana API returns the story created_at (2018) but the comment text contains the original date (2017). Should use the earlier/original date.
3. **Two comments merged into one**: Two separate Asana comments ('Checked: ...' and 'They should call us soon') are merged into a single li. Each should be its own li.
4. **Comment body indentation**: The content below the li prefix is not indented as continuation of the list item. Sub-lists (- living ok, - kitchen & bedroom) should be nested li items under the comment, not top-level.
5. **Comments should be KMAST items**: Each comment should be parsed into a proper KMAST node (li) so the TUI can render them correctly with folding, navigation, etc.

Example output (current):

```
- 2018-05-29 @bjørn-stabell: ­
Bjorn Stabell on Friday Mar 03, 2017 06:37 AM:
Checked:
- living ok
- kitchen & bedroom - pressure ok, return ok, but floor not warm
- bath - ok, except return warm even when off

Bjorn Stabell on Friday Mar 03, 2017 06:38 AM:
They should call us soon
```

Expected:

```
- 2017-03-03 @bjørn-stabell: Checked:
  - living ok
  - kitchen & bedroom - pressure ok, return ok, but floor not warm
  - bath - ok, except return warm even when off
- 2017-03-03 @bjørn-stabell: They should call us soon
```

Files: apps/@km/_orphan/cli/src/import/adapters/asana/comment-filter.ts, apps/@km/_orphan/cli/src/import/convert.ts

