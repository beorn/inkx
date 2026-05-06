---
aliases:
  - km-silvercode.sessionupdatelist-prompt-boundary-cleanup
  - km-silvercode-sessionupdatelist-prompt-boundary-cleanup
created_at: 2026-05-06T06:17:58.258Z
---

# SessionUpdateList constructs UI ContentBlocks — refactor through sanitized seam or UI-only type #P3

ea4e93e33 added 5 ContentBlock-shaped constructions in apps/silvercode/src/components/SessionUpdateList.tsx (lines 374, 401, 405, 415, 505) for rendering tool-result content. These match the prompt-boundary regex but are UI-only — they don't get sent to agents. Currently allow-listed in tools/check-prompt-boundary.ts as a temporary exception. Proper fix: either (a) introduce a UI-specific block type (UiContentBlock) so the prompt-assembly type stays prompt-bound only, or (b) route construction through a sanitized seam similar to transcript.ts. Either restores the tight prompt-boundary invariant without the allow-list growing.

