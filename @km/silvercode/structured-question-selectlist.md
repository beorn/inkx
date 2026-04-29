---
id: "@km/silvercode/structured-question-selectlist"
aliases:
  - km-silvercode.structured-question-selectlist
  - km-silvercode-structured-question-selectlist
created_by: claude:2405c72e
created_at: 2026-04-28T22:16:11Z
---

# [ ] StructuredQuestion: extract cursor state, use SelectList canonically @km/silvercode #task #P3 #design

blocks:: [[@km/silvercode]]

UsageMeter.tsx StructuredQuestion (lines 170-198) reimplements a select-list with manual cursor highlighting (highlightedIndex prop, manual mark/space prefix, hand-rolled keybinding hints). The Silvery Way principle 1 says 'Use the Built-in Components' — silvery's SelectList already handles all this. InlineAskUserQuestionPrompt and InlinePermissionPrompt do this correctly (delegate to <SelectList>). StructuredQuestion as it stands is presentational-only (highlightedIndex is owned by caller, no onSelect) and lives next to UsageMeter, but it's used in All.story alongside StructuredAnswer for end-of-turn structured questions. Refactor: replace the manual map+highlightedIndex rendering with <SelectList items={...} highlightedIndex={highlightedIndex} isActive={false} /> wrapped in the bordered card. Keeps API surface but uses the canonical primitive. Discovered during @km/silvercode/design-review walkthrough.