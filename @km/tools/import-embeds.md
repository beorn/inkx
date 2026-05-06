---
mentions:
  - km
projects:
  - link
id: "@km/tools/import-embeds"
aliases:
  - km-tools.import-embeds
  - km-tools-import-embeds
created_by: claude:5f0aee02
created_at: 2026-02-18T10:01:06Z
closed_at: 2026-02-19T21:30:07Z
owner: bjorn@stabell.org
---

# [x] Use embeds (\![[^id]]) instead of title+link for cross-project task refs @km/tools #feature #P3

In convert.ts, cross-project task references currently render as 'Title (Status) → [[^sourceId]]'. This duplicates the title and shows a raw reference. Instead, use '\![[^sourceId]]' (embed/transclusion) which would render the actual node content inline. The parser and storage already support embeds via link_to reconciliation. Change: convert.ts:427 content from '${item.title} → [[\^id]]' to '\![[\^id]]'.

