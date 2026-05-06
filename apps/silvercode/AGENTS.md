# Silvercode Agent Instructions

## UI primitive discovery

Before adding custom UI layout or controls, check existing primitives first.
This is an always-on rule for silvercode UI work.

1. Check Silvery exports:
- Source: `../../vendor/silvery/packages/ag-react/src/exports.ts`
- Common primitives: `Box`, `Text`, `Muted`, `Small`, `Prose`, `Divider`,
     `ModalDialog`, `SelectList`, `TextInput`, `TextArea`, `ListView`,
     `Button`, `Toggle`, `Switch`, `Tabs`, `Tooltip`, `InlineAlert`,
     `Banner`, `Alert`, `Table`, `Badge`, `Spinner`, `ProgressBar`.
5. Check silvercode local components:
- `src/components/Content.tsx`: `Content.Layout`, `Content.Row`,
     `Content.Left`, `Content.Body`, `Content.Prose`, `Content.Wide`,
     `Content.Full`, `Content.Auto`, `Content.Table`, `Content.Right`,
     `Content.Aside`.
- `src/components/SessionEntry.tsx`: transcript entry marker/content layout.
- `src/components/ToolCall.tsx`, `MarkdownView.tsx`,
     `TurnActivitySummary.tsx`, `NotificationEventRow.tsx`.
10. Check Storybook for examples before inventing a new pattern:
- `storybook/registry.ts`
- `storybook/stories/*.story.tsx`

If an existing primitive is close but not quite right, prefer extending or
composing it over duplicating its layout math in silvercode.

