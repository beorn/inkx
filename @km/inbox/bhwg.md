---
id: "@km/inbox/bhwg"
aliases:
  - km-bhwg
  - "@km/_orphan/bhwg"
created_at: 2026-01-22T00:11:26Z
closed_at: 2026-01-22T00:15:35Z
---

# [x] km view / km view @issue.md shows 'No board found' @km/_orphan #bug #P0


## Description
Running 'km view' or 'km view @issue.md' shows 'No board found' error.

## Analysis
- Database has 4299 nodes but NONE have parent_id = NULL
- Root directory files (@issue.md, @inbox.md, CHANGELOG.md) are not in the database
- Database contains mostly nodes from subdirectories (node_modules, etc.)
- This appears to be database corruption or incomplete initial sync

## To reproduce
1. cd /Users/beorn/Code/pim/km
2. bun km view
3. See 'No board found' error

## Investigation needed
- Why are root files missing from database?
- Why do no nodes have parent_id = null?
- May need database rebuild mechanism
