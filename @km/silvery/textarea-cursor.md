---
id: "@km/silvery/textarea-cursor"
aliases:
  - km-silvery.textarea-cursor
  - km-silvery-textarea-cursor
created_by: claude:fed8de9e
created_at: 2026-03-24T06:03:39Z
closed_at: 2026-03-24T14:56:02Z
close_reason: "Fixed: useCursor didn't account for inner border+padding offset.
  Added borderColOffset/borderRowOffset to TextArea.tsx and TextInput.tsx. 4 new
  tests."
---

# [x] TextArea: cursor renders on last character instead of after it @km/silvery #bug #P2

TextArea cursor renders ON the last typed character instead of AFTER it. 

Root cause investigation:
- useCursor sets col: ta.cursorCol, which should be correct (1 after typing 'X')
- useScreenRectCallback adds rect.x offset (border+padding)
- SVG inspection shows cursor rect at same x position as the character, not after it
- cursor row may also be off by one (lands on 'New Note' title row instead of content row)
- User suspects paddingX={1} on parent Box is involved

The TextArea is wrapped in <Box paddingX={1}> inside <Box borderStyle='single'>. The cursor positioning through useScreenRectCallback may not correctly resolve through nested padding/border layers.

Needs: unit test for cursor position with border+padding wrapper, then fix.