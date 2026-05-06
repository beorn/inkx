---
mentions:
  - km
id: "@km/inbox/8uji"
aliases:
  - km-8uji
  - "@km/_orphan/8uji"
created_at: 2026-01-19T11:03:30Z
closed_at: 2026-01-19T11:10:44Z
---

# [x] Unify overflow indicators across all views @km/_orphan #task #P2

Overflow indicators are inconsistent across views:

- Cards view has a different style
- Columns/lists/tabs have different text and horizontal indentation

Solution: Create one unified OverflowIndicator component that:

1. Uses the cards view style (centered, clean)
2. Shows 'X more' text indicating count
3. Is used by all views consistently

Acceptance criteria:

- Single OverflowIndicator component used by all views
- Consistent visual appearance (arrow + count)
- Good test coverage

