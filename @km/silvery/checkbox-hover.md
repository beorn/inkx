---
id: "@km/silvery/checkbox-hover"
aliases:
  - km-silvery.checkbox-hover
  - km-silvery-checkbox-hover
created_by: Bjørn Stabell
created_at: 2026-04-03T07:18:55Z
closed_at: 2026-04-03T07:44:23Z
close_reason: Implemented CheckboxIcon with arm-on-hover (inverse+bold), pointer
  cursor, click toggles todo<->done. Integrated in TreeNode.tsx. 6 tests.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Checkboxes: arm on hover, click to toggle — everywhere they appear @km/silvery #feature #P2 @Bjørn Stabell

Checkboxes should be interactive on hover — armed state (visual feedback) and clickable to toggle, matching Link's arm-on-hover pattern.

## Behavior

- Hover over checkbox → armed state (highlight/cursor change)
- Click armed checkbox → toggle checked/unchecked
- Works everywhere checkboxes appear (task lists, filter toggles, settings, forms)
- No modifier key required (unlike Link's arm-on-cmd-hover default)

## Implementation

- Use useMouseCursor("pointer") on hover (like Link)
- Visual armed state: highlight or inverse the checkbox character
- onClick handler toggles state
- Emit a "checkbox:toggle" event or call onChange prop
- Should work in both altInline and altScreen modes (anywhere mouse is active)

## Precedent

Follows the same pattern as Link's arm-on-hover variant — hover gives visual feedback, click activates. Checkboxes are inherently interactive, so no modifier key needed (unlike URLs where accidental clicks are costly).

## km usage

- Task checkboxes in card body ([ ] / [x] in markdown)
- Filter toggles in board view
- Settings/preferences in any dialog
- Bulk selection checkboxes

## Done when
- Hovering any checkbox shows armed state (cursor + visual)
- Clicking toggles the checkbox
- Works in all contexts where checkboxes appear