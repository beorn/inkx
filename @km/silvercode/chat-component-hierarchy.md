---
mentions:
  - km
id: "@km/silvercode/chat-component-hierarchy"
aliases:
  - km-silvercode.chat-component-hierarchy
  - km-silvercode-chat-component-hierarchy
created_at: 2026-05-01T18:16:00.000Z
type: feature
priority: P0
closeReason: "Completed: Chat.tsx defines
  Chat.Root/Transcript/Metadata/Notification/Composer/Body and
  Chat.Turn.Root/Prompt/Segment/Narration/Activity/ToolGroup/Summary/Stats;
  SessionUpdateList and pane/composer paths now render through those primitives.
  Verification: bun vitest run apps/silvercode/tests/content-layout.test.tsx
  apps/silvercode/tests/message-list-scroll.test.tsx
  apps/silvercode/tests/codex-resume.test.ts
  apps/silvercode/tests/turn-activity-summary.test.tsx
  apps/silvercode/tests/tool-call-rendering-v2.test.tsx
  apps/silvercode/tests/tool-call.test.tsx
  apps/silvercode/tests/visual/markdown.test.tsx
  apps/silvercode/tests/notification-event-row.test.tsx
  apps/silvercode/tests/session-end-error-paths.test.tsx
  apps/silvercode/tests/controller-closeall.test.ts
  apps/silvercode/tests/resume-blank-screen.test.ts
  apps/silvercode/tests/cli-smoke.test.ts passed: 12 files, 187 tests. Latest
  gutter polish in f33ab87c5."
---

# [x] Design `Chat.Turn.*` component hierarchy for turn envelopes @km/silvercode #feature #P0

## Problem

Silvercode's transcript rendering has grown around implementation artifacts: `SessionUpdateList`, `ExchangeItem`, `TurnActivitySummary`, `SessionEntry`, notification rows, metadata rows, and composer code all encode adjacent pieces of the chat UI. This makes it hard to reason about progressive disclosure, because the code mixes three separate concerns:

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
- `Chat.Notification` — notification rows such as tribe, CI, filewatch, recall, background task observations. Outside a turn by default.
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
20. Render existing transcript through `Chat.Turn.*` without changing behavior.
21. Change dense-turn behavior so collapsed summary may aggregate, while expanded details preserve narration/activity order.
22. Move user prompt bubble rendering into `Chat.Turn.Prompt`.
23. Move `TurnActivitySummary` behavior into `Chat.Turn.Activity` / `Chat.Turn.ToolGroup`.
24. Move metadata and notification rows to `Chat.Metadata` and `Chat.Notification`.
25. Wrap `SessionPromptComposer` as `Chat.Composer` or rename it when safe.
26. Leave `Content.*` as the layout layer only.

## Acceptance Criteria

- [x] `Chat.*` component family exists and is used by Silvercode transcript rendering.
- [x] `Chat.Turn.*` owns prompt, segment, narration, activity, tool group, summary, and stats rendering.
- [x] Collapsed turn summary can aggregate dense tool work across the turn.
- [x] Expanded turn details preserve original stream order across narration/activity/narration/activity.
- [x] Activity segments remain individually collapsible inside expanded turns.
- [x] User prompt rendering is implemented by `Chat.Turn.Prompt`.
- [x] Active composer is represented by `Chat.Composer` and is not placed inside transcript scrollback.
- [x] Metadata and notifications are expressed as `Chat.Metadata` and `Chat.Notification`.
- [x] `Content.*` remains generic layout only; chat semantics do not leak into it.
- [x] Storybook includes examples for collapsed turn, expanded turn, dense activity, nested activity expansion, prompt-only, summary-only, metadata, notification, and composer.
- [x] Tests cover a turn with `narration + tools + narration + tools + summary`.
- [x] Tests cover `toolCount >= 8`: collapsed turn aggregates, expanded turn preserves sequence.
- [x] Tests cover activity-level expansion inside an expanded turn.
- [x] Existing hover timestamp/asides behavior is preserved.
- [x] Existing raw/debug inspector remains available per row/item.

## Notes

This bead is intentionally architectural and P0 because it should stop the recurring layout/progressive-disclosure churn in `SessionUpdateList`. The expected end state is a thinner `SessionUpdateList` that builds a chat model and maps it to `Chat.*`, rather than hand-authoring transcript semantics inline.

## Progress 2026-05-03

- Added `apps/silvercode/src/components/Chat.tsx` with `Chat.Root`, `Chat.Transcript`, `Chat.Metadata`, `Chat.Notification`, `Chat.Composer`, `Chat.Body`, and `Chat.Turn.*`.
- Added `apps/silvercode/src/chat-model.ts` with explicit `ChatTurn`, `ChatTurnSegment`, `ChatActivitySegment`, and assistant op segmentation.
- Migrated user prompt, assistant narration, thinking text, activity summary, segment, summary, and stats rendering in `SessionUpdateList` onto `Chat.Turn.*` primitives.
- Routed production session metadata, notification rows, and active composer placement through `Chat.Metadata`, `Chat.Notification`, and `Chat.Composer`.
- Changed dense interleaved assistant turns to preserve narration/activity/narration/activity order. The old `toolCount >= 8` path no longer flattens all tools into one activity row across intervening narration.
- Added `Chat/*` storybook stories and updated `All/together` to expose the new component hierarchy while production transcript examples continue through the real `SessionUpdateList` path.
- Added `apps/silvercode/tests/chat-model.test.ts` and updated turn-activity assertions for the new preserved-order contract.

Verification in current working tree:

- `bun vitest run apps/silvercode/tests/chat-model.test.ts apps/silvercode/tests/turn-activity-summary.test.tsx apps/silvercode/tests/content-layout.test.tsx apps/silvercode/tests/message-list-scroll.test.tsx` — 50 tests passed.
- `bun vitest run apps/silvercode/storybook/tests/stories.test.tsx apps/silvercode/storybook/tests/registry.test.ts` — 40 tests passed.
- `bun vitest run --dir vendor/silvery tests/features/listview-overscroll-bump.test.tsx tests/ui/list-view-visible-content-anchoring.test.tsx tests/features/height-model.test.ts` — 31 tests passed.

Remaining before close:

- `SessionUpdateList` is thinner but still owns item interleaving, metadata injection, grouping, and low-level render dispatch. A final cleanup pass should move more of that into the chat model/renderer boundary before this bead closes.
- The command box is represented by `Chat.Composer`, but the app still threads the active composer as `composerSlot`; renaming/wrapping `SessionPromptComposer` itself can happen once the active input surface is ready for a public `Chat.Composer` API.
- User confirmation from real `silvercode --resume ...` screenshots is still required for the broader layout plateau.

## Progress 2026-05-04

- Tightened the first-pass `Chat.*` migration with root fixes found by the full suite:
  - `MarkdownView` now participates in shrink/wrap as a bounded flex child, so plain markdown wraps at the ChatBlock boundary.
  - `SyntaxHighlighter` now uses the agreed code-block inner margins: two columns left/right and hover language label inset from the right edge.
  - `ChatPane` owns a full-width pane contract and the zoomed `PaneGrid` path preserves the focus marker.
  - ACP process cleanup no longer assumes a `.once()` listener on test seams when `.on()` is the available child-process surface.
  - Silvery `ListView` anchoring now yields to explicit declarative `scrollTo` targets, fixing the shared km-tui column overflow indicator regression without a km-tui workaround.

Verification:

- `bun vitest run apps/silvercode/tests/chat-model.test.ts apps/silvercode/tests/turn-activity-summary.test.tsx apps/silvercode/tests/content-layout.test.tsx apps/silvercode/tests/notification-welcome-artifact.test.tsx apps/silvercode/tests/wrap-regression.test.tsx apps/silvercode/tests/visual/markdown.test.tsx apps/silvercode/tests/visual/pane-2d-layout.test.tsx apps/silvercode/packages/agent-harness/tests/registry-adapters.test.ts apps/silvercode/packages/agent-harness/tests/notification-wire-bytes.test.ts` — 82 tests passed.
- `bun vitest run apps/silvercode/storybook/tests/stories.test.tsx apps/silvercode/storybook/tests/registry.test.ts` — 40 tests passed.
- `bun vitest run --dir vendor/silvery tests/features/listview-overscroll-bump.test.tsx tests/ui/list-view-visible-content-anchoring.test.tsx tests/features/height-model.test.ts` — 31 tests passed.
- `bun vitest run apps/km-tui/tests/column-rendering.test.ts --testNamePattern "▲ shows"` — 1 test passed.
- `bun run test:fast` — typecheck baseline passed and 9288/9289 tests passed; the only remaining failure is `apps/km-cli/tests/bd-move-alias.test.ts`, which reproduces independently and is outside the silvercode/chat/silvery layout surface.

## Progress 2026-05-04 Late

- Moved transcript assistant slicing into `apps/silvercode/src/chat-model.ts` so `SessionUpdateList` no longer owns the narration/activity splitting policy.
- Changed transcript activity disclosure so a single tool/activity renders inline; activity summaries are reserved for cases where they reduce visible noise.
- Kept high-content tool grouping disabled for one-tool runs, while preserving multi-tool/dense collapsed summaries and expanded sequential narration/activity behavior.
- Updated transcript tests for inline single-command, inline `apply_patch` diff, inline `view_image`, and stable command-row expansion.

Verification:

- `bun vitest run apps/silvercode/tests/chat-model.test.ts apps/silvercode/tests/turn-activity-summary.test.tsx` — 28 tests passed.
- `bun vitest run apps/silvercode/tests/chat-model.test.ts apps/silvercode/tests/turn-activity-summary.test.tsx apps/silvercode/tests/content-layout.test.tsx apps/silvercode/tests/notification-welcome-artifact.test.tsx apps/silvercode/tests/wrap-regression.test.tsx apps/silvercode/tests/visual/markdown.test.tsx apps/silvercode/tests/visual/pane-2d-layout.test.tsx apps/silvercode/packages/agent-harness/tests/registry-adapters.test.ts apps/silvercode/packages/agent-harness/tests/notification-wire-bytes.test.ts` — 90 tests passed.
- `bun vitest run apps/silvercode/storybook/tests/stories.test.tsx apps/silvercode/storybook/tests/registry.test.ts` — 41 tests passed.
- `bun run typecheck` is not a useful clean signal in this sandbox/worktree: it cannot write `packages/km-infra/typescript/.tsbuildinfo` from the `apps/silvercode` writable root, and the repo-wide pass also reports pre-existing km-cli/vendor/silvery type errors. A narrower `apps/silvercode/tsconfig.json` pass avoids the write location with `/tmp/silvercode-tsconfig.tsbuildinfo`, but still fails in vendor `silvery`/`termless` type declarations outside this change.

## Completed 2026-05-04

- Moved command-session normalization (`exec_command` plus `write_stdin` polling) into `apps/silvercode/src/chat-model.ts`, and made both transcript slicing and turn stats use normalized ops before deciding whether an activity summary saves space.
- Fixed the real `silvercode --resume codex:019ddfc8-0749-7da1-b892-b2e1c6bc389f` regression where one normalized command still displayed as `Ran 1 command`; the transcript now renders the command row inline.
- Routed transcript layout through `Chat.Transcript` from production `ChatPane` and `SessionUpdateList` fallback paths, leaving `Content.Layout` as the generic substrate under `Chat.Transcript`.
- Routed inline tool runs through `Chat.Turn.ToolGroup`; dense/high-content runs still use `Chat.Turn.Activity`.
- Added regression coverage for one interleaved command, one normalized `exec_command`/`write_stdin` command, normalized turn stats, and the real resumed Codex transcript.

Final verification in this worktree:

- `bun vitest run apps/silvercode/tests/chat-model.test.ts apps/silvercode/tests/turn-activity-summary.test.tsx apps/silvercode/tests/render-resumed-session-helper.test.tsx apps/silvercode/tests/content-layout.test.tsx apps/silvercode/tests/notification-welcome-artifact.test.tsx apps/silvercode/tests/wrap-regression.test.tsx apps/silvercode/tests/visual/markdown.test.tsx apps/silvercode/tests/visual/pane-2d-layout.test.tsx apps/silvercode/packages/agent-harness/tests/registry-adapters.test.ts apps/silvercode/packages/agent-harness/tests/notification-wire-bytes.test.ts` — 95 tests passed.
- `bun vitest run apps/silvercode/storybook/tests/stories.test.tsx apps/silvercode/storybook/tests/registry.test.ts` — 41 tests passed.
- Typecheck caveat remains the same as above: repo-wide and narrow app typecheck are currently blocked by sandbox `.tsbuildinfo` write constraints and pre-existing vendor/repo type errors outside this component refactor.

## Related

- [[@km/silvercode/chat-layout-quality-plateau]]
- [[@km/silvercode/runtime-error-tracking-plateau]]
