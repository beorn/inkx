---
id: "@km/rev-0129/3-convert-toastqueue-parsepool-patternmatcher-to-fac"
aliases:
  - km-rev-0129.3
  - km-rev-0129-3
  - "@km/rev-0129/3"
created_at: 2026-01-29T16:36:05Z
closed_at: 2026-01-29T18:09:24Z
assignee: claude:298008b9
---

# [x] Convert ToastQueue, ParsePool, PatternMatcher to factories @km/rev-0129 #task #P3 @claude:298008b9

Classes that should be factory functions per project style:
- packages/@km/_orphan/core/src/toast.ts:56 - ToastQueue class
- packages/@km/storage/src/parse-pool.ts:48 - ParsePool class  
- packages/@km/storage/src/ignore.ts:301 - PatternMatcher class

Convert to createX() pattern with XOptions. Check for shared patterns that can be extracted.