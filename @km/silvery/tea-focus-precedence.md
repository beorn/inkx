---
id: "@km/silvery/tea-focus-precedence"
aliases:
  - km-silvery.tea-focus-precedence
  - km-silvery-tea-focus-precedence
created_by: claude:8b5b9e1c
created_at: 2026-04-21T06:12:45Z
---

# [ ] withFocus precedence contract for ambiguous keys (Enter/Escape/Tab) @km/silvery #task #P2

blocks:: [[@km/silvery/tea]]

Pro review 2026-04-21 Trap C: withFocus consuming Enter before withCommands silently drops dialog.confirm commands. Fix: withFocus MUST call prev(op) first for semantically-ambiguous keys; only default focus nav if prev returned false. Inverts naïve 'later = outer, sees first' for Enter/Escape/Tab. Document as contract not implementation accident. Context: hub/silvery/tea-review-responses.md §6.