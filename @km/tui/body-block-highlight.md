---
id: "@km/tui/body-block-highlight"
aliases:
  - km-tui.body-block-highlight
  - km-tui-body-block-highlight
created_by: Bjørn Stabell
created_at: 2026-04-15T06:11:06Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.body-block-highlight
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-14T23:11:06Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Body block highlighting: unify sibling + cursor into one enclosing region @km/tui #bug #P3

blocks:: [[@km/tui]]

Screenshot: ~/Desktop/Screenshot 2026-04-14 at 23.06.22.png

Current rendering (observed on a sub-section card in cards view, cursor on a body list item): the cursor's sibling rows get a muted brown per-row background and the cursor row gets a full-width amber row background. Four issues:

1. **Bleed past the card's content rect.** Both the brown sibling highlight and the amber cursor row extend past the card's left content edge into the gutter area, so the highlights read as a floating panel rather than being contained by the card.

2. **Gap between sibling highlight and cursor highlight.** The brown block (Some description, Bullets, Bolded) and the amber row (bullet) render as two disconnected panels, even though they're all siblings under the same section. Reads as two separate selections.

3. **Indent drift inside the highlighted block.** Mixed row kinds (narrative text, bulleted items, bold headings) have different leading-column positions. The dim-foreground rendering in unselected cards hides this, but the sibling-highlight rectangles in the selected card draw attention to it.

4. **Brown saturation too close to the card background.** Muted brown reads as 'dirty' not 'selected-sibling'. Needs either more saturation or a different treatment entirely (e.g. left-edge accent bar instead of full row background).

**Proposed redesign (needs visual verification before implementing):**

Treat the cursor's containing body block as ONE enclosing highlighted region, not per-row highlights. Draw a single rounded-corner background spanning all body rows under the cursor's section (cursor row + all its siblings in the same section). Inside that block, differentiate the cursor row by either (a) changing only the cursor row's foreground color, or (b) adding a left-edge marker / subtle inset on the cursor row. Constrain the background to the card's inner content rect (no bleed into gutter).

This kills issues (1), (2), and makes (3) easier to tolerate because there's one enclosing shape instead of N per-row shapes drawing attention to each row's start column.

**Acceptance:**
1. User approves the visual design BEFORE implementation (mockup or live preview in km view).
2. Highlight stays within the card's content rect on all sides.
3. Cursor + siblings render as one continuous region (no vertical gap).
4. No regression in sibling-less cases (cursor on a row with no siblings still renders correctly).

**Held pending visual verification.** Before coding, produce a mockup — either an ASCII sketch in the bead, a standalone storybook/showcase story, or a live A/B comparison in km view against a known vault. User reviews and approves the design. Then implement.