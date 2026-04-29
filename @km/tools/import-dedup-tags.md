---
id: "@km/tools/import-dedup-tags"
aliases:
  - km-tools.import-dedup-tags
  - km-tools-import-dedup-tags
created_by: claude:8f007ba9
created_at: 2026-02-20T09:42:58Z
closed_at: 2026-02-20T09:45:44Z
owner: bjorn@stabell.org
---

# [x] Deduplicate tag output: remove tag-GID files, keep #slug aggregation @km/tools #task #P2

Converter generates both tag-GID-slug.md (from fetched tag JSON) AND #slug.md (from aggregation). Remove the tag-GID variant — #slug.md is the better format. Change buildPrimaryMap() to skip tag-prefixed sourceIds, or merge them into the #slug output.