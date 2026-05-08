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

8. Check silvercode local components:

- `src/components/Content.tsx`: `Content.Layout`, `Content.Row`,
  `Content.Left`, `Content.Body`, `Content.Prose`, `Content.Wide`,
  `Content.Full`, `Content.Auto`, `Content.Table`, `Content.Right`,
  `Content.Aside`.
- `src/components/SessionEntry.tsx`: transcript entry marker/content layout.
- `src/components/ToolCall.tsx`, `MarkdownView.tsx`,
  `ChatMessageSummary.tsx`, `NotificationEventRow.tsx`.

17. Check Storybook for examples before inventing a new pattern:

- `storybook/registry.ts`
- `storybook/stories/*.story.tsx`

If an existing primitive is close but not quite right, prefer extending or
composing it over duplicating its layout math in silvercode.

## Bead ops and slot boards

This file is usually read while the shell is inside `apps/silvercode`. Before
running `km bd`, `km sync`, `$claim`, or `$do`, switch to the monorepo root:

```bash
cd "$(git rev-parse --show-toplevel)"
```

The root is where `@km/`, `@agent.md`, and `@agent/` live. Running those commands
from `apps/silvercode` gives a partial vault view and can make slot queues look
empty or stale.

Use ordinary bd commands for the slot-board model:

```bash
km bd query @agent/3                    # queue membership for hat 3
km bd list --status wip --assignee me   # claimed beads and hats
```

`@agent/0..9` are hats: any agent can claim `@agent/N`, and that claim also
owns worktree `wtN`. `km bd query @agent/N` is the source of truth. A persisted `@agent/N.md` queue
requires a rule, usually `# @agent/N km.add:: . km.default:: true` on the hat
H1; backlinks alone do not write embeds into the hat file.

The `km bd agent ...` subgroup is older persisted-agent plumbing; don't use it
to inspect `@agent/N` slot boards.
