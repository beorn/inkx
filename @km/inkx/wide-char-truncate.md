---
mentions:
  - km
  - claude
id: "@km/inkx/wide-char-truncate"
aliases:
  - km-inkx.wide-char-truncate
  - km-inkx-wide-char-truncate
created_at: 2026-02-04T11:23:56Z
closed_at: 2026-02-04T12:57:46Z
assignee: claude:27f1a547
---

# [x] renderStatic truncates text after wide characters (⚠ ☑) @km/inkx #bug #P2 @claude:27f1a547

In renderStatic, certain wide characters (displayLength=2) cause text after spaces to be truncated.

## Reproduction

```tsx
import { renderStatic, Text } from 'inkx'

// These work (displayLength=1):
await renderStatic(<Text>☐ Task 1</Text>)  // ☐ Task 1
await renderStatic(<Text>☒ Task 1</Text>)  // ☒ Task 1

// These break (displayLength=2):
await renderStatic(<Text>⚠ Task 1</Text>)  // ⚠ Task (missing ' 1')
await renderStatic(<Text>☑ Task 1</Text>)  // ☑ Task (missing ' 1')

// But this also has displayLength=2 and WORKS:
await renderStatic(<Text>📁 Task 1</Text>)  // 📁 Task 1
```

## Analysis

- ⚠ (U+26A0) and ☑ (U+2611) have displayLength=2 per tui-measure
- Text after the first space gets truncated
- Other wide chars like 📁 work fine, so not all displayLength=2 chars affected
- May be related to specific Unicode ranges or East Asian width calculations

## Workaround

Use status icons with displayLength=1 (☐, ☒) instead of ⚠ (no-status icon)

