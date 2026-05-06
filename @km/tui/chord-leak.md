---
mentions:
  - km
  - claude
id: "@km/tui/chord-leak"
aliases:
  - km-tui.chord-leak
  - km-tui-chord-leak
created_by: claude:fcaad2fa
created_at: 2026-02-18T00:23:29Z
closed_at: 2026-02-18T01:14:22Z
owner: bjorn@stabell.org
assignee: claude:fcaad2fa
---

# [x] Chord second key leaks into dialog text input @km/tui #bug #P2 @claude:fcaad2fa

When pressing a chord like 'td' (set due date), the second key 'd' (and sometimes preceding navigation keys) leak into the dialog's text input field.

Reproduction:

1. Navigate to a task card
2. Press 'td' chord to open date dialog
3. Observe: input field contains 'd' (or other leaked chars like 'rnjtd')

Expected: Input field should be empty when dialog opens.

Root cause hypothesis: The chord system processes 't' (starts chord timer), then 'd' completes the chord and opens the dialog. But the 'd' keystroke also gets processed as a text input event because the dialog's useEditContext registers its input handler asynchronously — the 'd' arrives before the dialog's input layer is on top of the stack.

Related: This is an input layer timing issue. The chord handler opens the dialog, but the same keystroke event continues propagating to the newly-mounted dialog's text input.

