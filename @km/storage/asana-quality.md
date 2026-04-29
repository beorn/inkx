---
id: "@km/storage/asana-quality"
aliases:
  - km-storage.asana-quality
  - km-storage-asana-quality
created_by: claude:8f007ba9
created_at: 2026-02-20T21:34:07Z
closed_at: 2026-02-20T22:31:12Z
owner: bjorn@stabell.org
---

# [x] Asana import quality: 12K issues across 60K nodes (20.3% rate) @km/storage #task #P2

Systematic comparison of 60,137 imported Asana nodes. All actionable items resolved.

## DONE
- ~~**Escaped underscores in URLs** (1,460→0 in URLs, 243 legitimate prose escapes)~~
- ~~**HTML entities** (2→0): &amp;, &gt; decoded at fetch+convert stages~~
- ~~**HTML tags in body** (14→0): remnant <br>, <em> stripped, autolinks preserved~~
- ~~**Excessive whitespace** (179→14): 3+ blank lines collapsed~~
- ~~**Embed-only titles** (5,304→0): show actual task title alongside ![[^GID]]~~
- ~~**URL-only titles** (350→0): prettified (strip protocol/www, truncate)~~
- ~~**Section separators** (162): tasks titled "-" rendered as HR nodes~~
- ~~**YouTube asset wrappers** (57→0): [real-url](asset-proxy) → real URL~~
- ~~**Comment URL conversion** (538): Asana URLs in comments now converted to [[^GID]]~~

## REMAINING (not actionable in converter)
- **Asana asset URLs** (16): genuine Asana-hosted files needing auth to download
- **Orphan block refs** (~5K): mostly from comment URL conversion — referenced tasks not in import data (other workspaces, deleted, or non-imported projects)
- **Bare GIDs in body** (173): ALL false positives (phone numbers, tracking numbers, IDs)
- **Filenames with GIDs** (3): disambiguation needed — two "fam-estate" projects + one untitled

## NOT BUGS (data characteristics)
- Long lines (1,352): mostly URLs
- Duplicate sibling titles (4,236): normal Asana recurring tasks
- Body is just a URL (147): user-authored content
- Files with only completed tasks (8): valid data
- Empty sections (4): valid data