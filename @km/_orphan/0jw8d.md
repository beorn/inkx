---
id: "@km/_orphan/0jw8d"
aliases:
  - km-0jw8d
created_by: claude:b92140a2
created_at: 2026-03-17T07:28:28Z
closed_at: 2026-03-17T20:28:01Z
close_reason: "6 fuzz tests covering index file chaos: random child ops,
  priority cascade, body preservation, concurrent edits, same-name convention,
  deep nesting."
---

# [x] Index-file-aware chaos/fuzz tests @km/_orphan #task #P4

The sync chaos suite (chaos-fuzz, lifecycle-fuzz, content-roundtrip) operates on flat file structures and never exercises index file scenarios. Gap: no chaos coverage for folder+index file creation, ![[./child]] content generation, handleFolderIndexUpdate under concurrent conditions, index file priority cascade with dropped/reordered events, or heartbeat/reconciliation with missing index file watcher events. Requires: new event picker for folder structures, folderIndex config enabled, transformers for index file write failures, verifier checks for index file consistency.