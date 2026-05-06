---
mentions:
  - km
id: "@km/silvery/examples-components"
aliases:
  - km-silvery.examples-components
  - km-silvery-examples-components
created_by: claude:73d7a332
created_at: 2026-03-12T16:20:40Z
owner: bjorn@stabell.org
---

# [ ] Example: components showcase (all UI elements, focus ring, Storybook-style) @km/silvery #task #P1

Example: components — All UI elements, typography, focus ring, modal

## What It Demonstrates

- All silvery UI components in one showcase
- Realistic typography (H1, H2, H3, blockquote, paragraph — NOT dummy content)
- Input components (TextInput, TextArea, SelectList, Toggle, Checkbox)
- Focus ring and tab navigation between components
- Modal dialog triggered by a button
- ProgressBar, Spinner, Badge components

## Status: NEW

## Design Direction (from user)

- Show realistic text content — H1, H2, H3, blockquote, paragraph
- NOT dummy lorem ipsum (looks too busy)
- Include a button that triggers a modal
- Can be split into sub-categories as tabs
- Focus and modals should be demonstrated here

## Tabs

1. Typography — H1/H2/H3, Strong, Muted, blockquote, paragraph, lists, code blocks. Content should read like real documentation (e.g., a silvery getting started guide).
2. Inputs — TextInput, TextArea, SelectList, Toggle, Checkbox. All with focus ring. Tab to cycle between them.
3. Display — ProgressBar, Spinner, Badge, Separator, Box with various border styles. Include a button that opens a ModalDialog.

## Key Components

- Typography: H1, H2, H3, Blockquote, Strong, Muted, Code, Paragraph (from silvery typography presets)
- Input: TextInput, TextArea, SelectList, Toggle
- Display: ProgressBar, Spinner, Badge, ModalDialog, Box borderStyle variants
- Layout: Box flexDirection/gap/padding, Spacer, Fill

## Implementation Notes

- ExampleMeta: name="Components", description="UI component gallery with typography, inputs, and dialogs"
- features: ["Typography", "TextInput", "SelectList", "ModalDialog", "ProgressBar", "focus ring"]
- File: examples/interactive/components.tsx
- Typography content: use a real getting-started guide or changelog as content
- Modal: triggered by Enter on a highlighted button, shows ModalDialog with sample content
- Focus: Tab cycles through interactive elements, focus ring visible
- The Tab key switches between tabs (1/2/3 also work)

