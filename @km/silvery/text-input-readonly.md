---
id: "@km/silvery/text-input-readonly"
aliases:
  - km-silvery.text-input-readonly
  - km-silvery-text-input-readonly
created_by: Bjørn Stabell
created_at: 2026-04-19T06:52:51Z
---

# [ ] Add readonly/visual-only mode to TextInput so previews can show the cursor without capturing input @km/silvery #task #P4

blocks:: [[@km/silvery]]

silvery's TextInput ties cursor visibility to isActive (which ALSO controls keyboard capture). Storybook needs 'show the cursor visually but don't steal j/k' — currently requires a custom replica of the render path (FakeTextInput-style). Options: (a) add readOnly prop that forces isActive=false for input but cursor visible; (b) split showCursor from isActive; (c) document focusScope-based isolation as the canonical pattern. Preview consumers: storybook TextInputPreview, any docs renderer that wants to show TextInput in a focused visual state.