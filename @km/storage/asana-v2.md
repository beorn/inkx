---
id: "@km/storage/asana-v2"
aliases:
  - km-storage.asana-v2
  - km-storage-asana-v2
created_by: claude:8f007ba9
created_at: 2026-02-20T22:54:20Z
closed_at: 2026-02-21T08:42:03Z
---

# [x] Asana import v2: markdown quality fixes @km/storage #task #P2 @claude:4c413aae

Second round of Asana import quality issues from user review.

## Completed
- ✅ #1 Tag/user files: embed-only (no baked-in titles)
- ✅ #2 List bullet style: `-` instead of `*`
- ✅ #3 Remove wiki link aliases
- ✅ #4 Headings preserved as markdown headings (not bold)
- ✅ #5 Turndown replaced with mdast pipeline
- ✅ #8 mdast pipeline implemented

## Remaining (from comparison analysis, 71 files)

### Critical
- **#9 Project/view URLs (~940)**: `ASANA_URL_PATTERNS` only matches task URLs. Project URLs like `/0/projectGid/list` left as dead Asana links. Need to convert to project wiki links or strip.
- **#10 Asset proxy URLs (~10)**: `get_asset?asset_id=` URLs in comments are dead outside Asana.
- **#11 Raw checkboxes in comments (~20+)**: `[x]`/`[ ]` in comment text may confuse km parser.

### Important (Turndown legacy in cached JSON)
- **#12 Escaped dashes `\-` (~8,182)**: buildBodyContent doesn't unescape `\-`
- **#13 Escaped brackets `\[` `\]` (~1,987)**: Turndown escaping in body text
- **#14 Escaped underscores (~30+)**: `pg\_dump` etc. in body text (not URLs)
- **#15 Redundant attachment links (~246)**: `[url](url)` where text=href
- **#16 Escaped HRs `\---` (~10)**
- **#17 Comment bullets (3)**: Comment text not processed by buildBodyContent
- **#18 `\*)` patterns (6)**

### Minor
- Empty task titles (~30), H7+ headings (22), bare URLs (~452), 4-space list indent (~17k)

### Tracked separately
- #6 Live Asana comparison (done via agent)
- #7 Attachment dedup (future)