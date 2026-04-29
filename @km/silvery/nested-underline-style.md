---
id: "@km/silvery/nested-underline-style"
aliases:
  - km-silvery.nested-underline-style
  - km-silvery-nested-underline-style
created_by: claude:db326126
created_at: 2026-03-30T16:32:34Z
closed_at: 2026-03-30T19:42:14Z
close_reason: "Fixed in this session: added underlineStyle/underlineColor to
  StyleContext, mergeStyleContext, and styleToAnsi in render-text.ts. Tests in
  vendor/silvery/tests/features/nested-text-styles.test.tsx (9 tests)."
owner: bjorn@stabell.org
---

# [x] underlineStyle lost on nested Text inside wrap=truncate parent @km/silvery #bug #P2

underlineStyle='dotted' (and likely dashed/curly/double) doesn't render when the Text is nested inside a parent Text with wrap='truncate'. Solid underline (underline={true}) works fine. The issue is in the text collection phase — underlineStyle prop isn't tracked through nested spans.

Repro: <Text wrap='truncate'>Normal <Text underlineStyle='dotted'>Dotted</Text></Text>
Expected: dotted underline on 'Dotted'
Actual: no underline