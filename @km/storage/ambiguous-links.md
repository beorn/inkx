---
id: "@km/storage/ambiguous-links"
aliases:
  - km-storage.ambiguous-links
  - km-storage-ambiguous-links
created_by: claude:f8196c1c
created_at: 2026-03-28T07:39:33Z
closed_at: 2026-03-28T07:45:20Z
close_reason: Ambiguous links now resolve to first match instead of null.
  Serializer writes qualified paths (file#section). isAmbiguous() available for
  future display differentiation.
---

# [x] Ambiguous embed links resolve to nothing instead of first match @km/storage #bug #P2

When multiple nodes share a name (e.g., 'source-text' sections in capdocs), link resolver sets null (ambiguous). Embeds show raw \![[name]] content instead of resolved target. Fix: resolve to first match, mark as ambiguous for display (e.g., '1 of 15' indicator).