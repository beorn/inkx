---
id: "@km/silvercode/chat-component-hierarchy"
aliases:
  - km-silvercode.chat-component-hierarchy
  - km-silvercode-chat-component-hierarchy
created_at: 2026-05-01T18:16:00.000Z
type: feature
priority: P0
---

# Design Chat component hierarchy for turn envelopes

## Problem

Silvercode's transcript rendering has grown around implementation artifacts: `SessionUpdateList`, `ExchangeItem`, `TurnActivitySummary`, `SessionEntry`, ambient rows, metadata rows, and composer code all encode adjacent pieces of the chat UI. This makes it hard to reason about progressive disclosure, because the code mixes three separate concerns:

- Layout lanes (`Content.*`): prose/wide/asides/gutters.
- Chat semantics: prompt, assistant narration, activity, summary, notifications, metadata, composer.
- Tool rendering leaves: command/edit/read/test rows and raw/debug affordances.

The current tool-density rule (`toolCount >= 8`) is also doing too much. It is useful for the collapsed turn summary, but it should not rewrite the expanded turn structure. Expanded turns should preserve the original sequence: narration, related activity, narration, related activity, conclusion.

## Goal

Introduce a holistic `Chat.*` component family, with turn-owned components nested under `Chat.Turn.*`, so transcript rendering expresses chat semantics directly while continuing to use `Content.*` for lane geometry.

## Proposed Hierarchy

```tsx
<Chat.Root>
  <Chat.Transcript>
    <Chat.Metadata />

    <Chat.Turn.Root>
      <Chat.Turn.Prompt />

      <Chat.Turn.Segment>
        <Chat.Turn.Narration />
        <Chat.Turn.Activity />
      </Chat.Turn.Segment>

      <Chat.Turn.Summary />
    </Chat.Turn.Root>

    <Chat.Notification />
  </Chat.Transcript>

  <Chat.Composer />
</Chat.Root>
```

Top-level chat surface:

- `Chat.Root` — overall chat surface; owns transcript plus active composer placement.
- `Chat.Transcript` — scrollback/list surface; owns `Content.Layout`, vertical rhythm, and list integration.
- `Chat.Metadata` — started/resumed/session lifecycle rows, outside any turn.
- `Chat.Notification` — ambient rows such as tribe, CI, filewatch, recall, background task observations. Outside a turn by default.
- `Chat.Composer` — active command/input surface. Replaces/wraps `SessionPromptComposer`; not part of scrollback.

Turn-owned surface:

- `Chat.Turn.Root` — one prompt/response unit; owns turn-level disclosure and stats.
- `Chat.Turn.Prompt` — user prompt bubble; right timestamp aside.
- `Chat.Turn.Segment` — one assistant narration/action unit.
- `Chat.Turn.Narration` — assistant prose/status text for a segment.
- `Chat.Turn.Activity` — one or more related tool/thinking operations following that narration; separately collapsible.
- `Chat.Turn.ToolGroup` — optional grouping inside activity: commands, edits, reads, tests, searches, agents.
- `Chat.Turn.Summary` — final conclusion/result for the turn.
- `Chat.Turn.Stats` — compact footer: elapsed time, command count, changed files, tokens/cost when available.

Existing generic leaves:

- `Content.*` remains the layout substrate and should not gain chat semantics.
- `ToolCall` remains the reusable tool-rendering leaf.
- `MarkdownView` remains prose/code/table rendering.
- `RawInspector` remains debug/per-item hover affordance, not a primary top-level mode.

## Turn Model

Build an explicit turn model before rendering:

```ts
type ChatTurn = {
  id: string
  prompt?: ChatPrompt
  segments: ChatTurnSegment[]
  summary?: ChatTurnSummary
  stats: ChatTurnStats
}

type ChatTurnSegment = {
  narration?: ChatNarration
  activities: ChatActivitySegment[]
}

type ChatActivitySegment = {
  summary: ChatActivitySummary
  groups: ChatToolGroup[]
  items: ChatActivityItem[]
}
```

Interpretation:

- A `Turn` begins with the user prompt when available.
- A `Segment` pairs assistant narration with the activity that follows it.
- Tools before any narration go into a segment with no narration, labelled as work only if a label is needed.
- The last assistant narration after the final activity is a `Summary` when it reads like a conclusion/result/verification.
- If the last narration is ordinary status text, it remains a normal segment narration.

## Disclosure Behavior

Collapsed turn:

```text
▸ fix command padding… · edited 4 files (+29 -30) · ran 14 commands · tests passed
```

Expanded turn:

```text
Prompt
  fix command padding and Xtra row

• I’ll add focused regression tests first.
  ▸ Ran 3 tests · edited 2 test files

• The assertions point to SidePanel and SessionPromptComposer.
  ▸ Edited 2 source files · ran queue visual test

• The focused assertions now pass.
  ▸ Ran typecheck

Summary
  Fixed command padding and Xtra visibility. Full visual suite still has console-guard noise.
  4m 12s · 14 commands · 4 files (+29 -30) · 12k tokens
```

Activity expanded:

```text
  ▾ Ran 3 tests · edited 2 test files
    $ vitest queue-ux "command box padding"  failed
    $ vitest boundary-fakes "Xtra"           failed
    Edited queue-ux.test.tsx
    Edited boundary-fakes.test.tsx
```

Rules:

- `toolCount >= 8` may aggregate all tool calls for the collapsed `Chat.Turn.Root` summary.
- `toolCount >= 8` must not rewrite the expanded sequence.
- In `Chat.Turn.Segment`, activity remains attached to the preceding narration by stream order.
- Each `Chat.Turn.Activity` can have its own density policy and disclosure state.
- Expanded turn means "structured outline", not raw transcript.
- Raw/debug remains per item via `RawInspector` or hover/popover.

## Migration Plan

1. Introduce `src/components/Chat.tsx` with the namespaced component family.
2. Add Storybook coverage for `Chat.Root`, `Chat.Transcript`, `Chat.Turn.Root`, dense activity, sequential narration/activity, metadata, notifications, and composer placement.
3. Extract model-building helpers from `SessionUpdateList`:
   - current `splitAssistantToolActivity`
   - activity summary item derivation
   - prompt/assistant turn association
   - conclusion detection
   - stats extraction
4. Render existing transcript through `Chat.Turn.*` without changing behavior.
5. Change dense-turn behavior so collapsed summary may aggregate, while expanded details preserve narration/activity order.
6. Move user prompt bubble rendering into `Chat.Turn.Prompt`.
7. Move `TurnActivitySummary` behavior into `Chat.Turn.Activity` / `Chat.Turn.ToolGroup`.
8. Move metadata and ambient rows to `Chat.Metadata` and `Chat.Notification`.
9. Wrap `SessionPromptComposer` as `Chat.Composer` or rename it when safe.
10. Leave `Content.*` as the layout layer only.

## Acceptance Criteria

- [ ] `Chat.*` component family exists and is used by Silvercode transcript rendering.
- [ ] `Chat.Turn.*` owns prompt, segment, narration, activity, tool group, summary, and stats rendering.
- [ ] Collapsed turn summary can aggregate dense tool work across the turn.
- [ ] Expanded turn details preserve original stream order across narration/activity/narration/activity.
- [ ] Activity segments remain individually collapsible inside expanded turns.
- [ ] User prompt rendering is implemented by `Chat.Turn.Prompt`.
- [ ] Active composer is represented by `Chat.Composer` and is not placed inside transcript scrollback.
- [ ] Metadata and notifications are expressed as `Chat.Metadata` and `Chat.Notification`.
- [ ] `Content.*` remains generic layout only; chat semantics do not leak into it.
- [ ] Storybook includes examples for collapsed turn, expanded turn, dense activity, nested activity expansion, prompt-only, summary-only, metadata, notification, and composer.
- [ ] Tests cover a turn with `narration + tools + narration + tools + summary`.
- [ ] Tests cover `toolCount >= 8`: collapsed turn aggregates, expanded turn preserves sequence.
- [ ] Tests cover activity-level expansion inside an expanded turn.
- [ ] Existing hover timestamp/asides behavior is preserved.
- [ ] Existing raw/debug inspector remains available per row/item.

## Notes

This bead is intentionally architectural and P0 because it should stop the recurring layout/progressive-disclosure churn in `SessionUpdateList`. The expected end state is a thinner `SessionUpdateList` that builds a chat model and maps it to `Chat.*`, rather than hand-authoring transcript semantics inline.
