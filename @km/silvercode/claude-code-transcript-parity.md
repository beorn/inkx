---
id: "@km/silvercode/claude-code-transcript-parity"
aliases:
  - km-silvercode.claude-code-transcript-parity
  - km-silvercode-claude-code-transcript-parity
created_at: 2026-05-06T18:36:50.952Z
---

# [ ] [epic] Silvercode transcript/tool output parity with Claude Code #epic #P1 ^claude-code-transcript-parity

Make Silvercode's transcript, tool output, and debug/event treatment reach same-or-better usability versus Claude Code, using the May 6 side-by-side screenshots as the baseline.

## Problem

Silvercode should be a strict superset of Claude Code for transcript review: easier to scan, at least as faithful chronologically, and better at exposing raw detail on demand. The May 6 side-by-side screenshots show that Silvercode currently has more debug/event noise and weaker expanded tool rendering, especially for edits and command output.

The target is not pixel cloning. It is same-or-better task reconstruction: a reviewer should be able to read a session transcript, understand what the agent did, inspect every meaningful detail, and ignore internal machinery unless Debug is enabled.

## Baseline Evidence

- `/Users/beorn/Desktop/claude-code-parity.png`
- Session examples referenced during triage:
  - `019dfaa0-5e7c-7770-8c19-7871be863f5b`
  - `019ddfc8-0749-7da1-b892-b2e1c6`
  - `f9eb64dc-d982-4a46-9a8e-da5fd882ac5f`

## Observed Gaps

| Area                      | Current Silvercode behavior                                                                                                                        | Same-or-better target                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Debug/internal events     | Title, queue, task reminder, permission mode, hook info, file snapshots, and similar blocks appear as transcript content or near-transcript noise. | Internal events are hidden by default or grouped as subtle Debug blocks. Debug mode exposes all raw events and context.                                                                                                                           |
| User/assistant separation | Some assistant narration or internal records can visually resemble user prompt content.                                                            | User prompts, assistant narration, status, tool work, and debug events have distinct primitives. Nothing raw/internal is styled as user input.                                                                                                    |
| Edit output               | Expanded edit summaries are flatter text dumps, often repeating paths and showing local hunk counters.                                             | Render one polished operation block per edit/file, e.g. Update(path), with added/removed counts and useful summary.                                                                                                                               |
| Diff display              | Diff details are less readable: limited syntax highlighting, saturated red/green text, repeated file names, weak line-number context.              | Syntax-highlighted diff/code view with real source line numbers, muted unchanged context, changed-line backgrounds, and wrapped long lines.                                                                                                       |
| Command output            | Ran N commands can expand to little/no useful detail or raw output that is hard to scan.                                                           | Compact command summary by default; expand/cmd-hover reveals command, cwd, exit status, stdout, stderr, timing, and raw event payload. (NOTE: Claude code seems to expand file edits by default while collapsing shell commands - probably good.) |
| Search/read output        | Aggregated activity summaries are useful but can lose chronological context.                                                                       | Preserve compact summaries such as Read 4 files, Edited 2 files, Ran 3 commands, while making per-operation detail available in context.                                                                                                          |
| Commit/push status        | Commit and push events can be indistinct from general prose or debug blocks.                                                                       | First-class muted status blocks for commits, pushes, and other important lifecycle events.                                                                                                                                                        |
| Tables/prose              | Markdown/table rendering can be visually heavier than Claude Code and must never truncate important cell content.                                  | Neutral tables, wrapping cells, consistent linkification, and no clipped content in normal transcript width.                                                                                                                                      |
| Raw details               | Raw inspectors are valuable but can occlude the wrong material or fail to show enough.                                                             | Every nontrivial block is expandable or supports cmd-hover raw detail. Inspectors are contextual, complete, and avoid covering the content being inspected when possible.                                                                         |

## Target Model

The feature is **Chat Transcript Tree**.

Canonical flow:

```text
AgentEvent -> normalizeAgentEvent(...) -> ChatEvent -> apply(ChatEvent) -> ChatState
                                                               |
                                                               v
                                                  projectChatTranscript(...)
                                                               |
                                                               v
                                                       ChatSession.tree
```

`AgentEvent` is the adapter/runtime boundary. `apply(...)` should see canonical `ChatEvent`s, not provider-native records or app queue internals.

Use these terms consistently:

- `AgentEvent`: adapter/runtime event from Claude, Codex, ACP, local hooks, queue machinery, replay, or restore. This is outside the core reducer.
- `ChatEvent`: normalized chronological fact in a Silvercode chat session. This is what `apply(...)` accepts.
- `ChatState`: accumulated canonical state after applying ChatEvents.
- `ChatSession`: projected chat session view, including the transcript tree, channels, and UI state.
- `ChatNode`: any node in the projected transcript tree.
- `ChatElement`: ChatNode with `children`; examples: root, turn, message, work, subtask.
- `ChatLeaf`: ChatNode without `children`; a renderable transcript leaf.
- `ChatChannel`: filter/routing metadata on leaves, not tree structure.
- `ChatMessage`: role-bearing user/assistant/system content.
- `ChatMessagePart`: typed content inside a ChatMessage.
- `ChatNodeState`: UI state keyed by node id, such as disclosure, selection, hover/raw detail.
- `projectChatTranscript(...)`: the central projection/transformation. Do not introduce a separate policy abstraction.

`ChatBlock` may remain a React component family name for rendering a ChatLeaf. It is not the data model.

## Vocabulary Migration

Migrate Silvercode transcript work to the target vocabulary above before implementing new renderer behavior.

Known vocabulary issues:

- The current `AgentEvent` type in `packages/agent-harness/src/events.ts` is a legacy adapter boundary. The core chat reducer should receive `ChatEvent`.
- ACP `SessionUpdate` is an adapter input shape. Do not let ACP naming leak into ChatState or ChatSession tree types.
- Current `MessageEntry`, `MessageOp`, activity segment, and transcript-slice types predate the ChatNode model. Rename or isolate them during the vocabulary phase.
- `Chat.Turn.*` is UI component vocabulary only. New canonical model fields should not depend on provider `turnId`.
- Historical `entry`, `row`, `item`, `card`, and data-model `block` language remains in components/tests/beads. Migrate docs, tests, stories, fixtures, and touched source before implementing the new transcript tree.

Refactoring rules for this epic:

- Vocabulary migration is Phase 1, not a cleanup task. New renderers and projection behavior should not start until the vocabulary gate passes.
- Keep mechanical rename work separate from behavior changes.
- Sweep the seven rename layers from the refactor workflow: data/fixtures, types, functions, files, comments, docs, and tests.
- Do not leave soft-migration aliases or old-name wrappers as the long-term path. If a legacy boundary must remain for a phase, list it explicitly and create the cleanup bead before closing that phase.
- `/complete` criteria must include exact grep commands and actual counts, not only passing tests.

## Target `types.ts`

Phase 1 should add a type-only substrate at `apps/silvercode/src/chat/types.ts`. The first implementation should be close to this shape:

```ts
export type Brand<T, Name extends string> = T & { readonly __brand: Name }

export type AgentEventId = Brand<string, "AgentEventId">
export type ChatEventId = Brand<string, "ChatEventId">
export type ChatSessionId = Brand<string, "ChatSessionId">
export type ChatNodeId = Brand<string, "ChatNodeId">
export type ChatMessageId = Brand<string, "ChatMessageId">
export type ChatMessagePartId = Brand<string, "ChatMessagePartId">
export type ChatToolId = Brand<string, "ChatToolId">
export type ChatChannelId = Brand<string, "ChatChannelId">

export type ChatRole = "user" | "assistant" | "system"
export type ChatSeverity = "info" | "warning" | "error"
export type ChatStatus = "pending" | "running" | "done" | "failed" | "cancelled"
export type ChatDisclosure = "expanded" | "collapsed" | "adaptive"
export type ChatWidth = "prose" | "wide" | "full"

export type ChatEvent = {
  id: ChatEventId
  type: ChatEventType
  ts: number
  sessionId: ChatSessionId
  agentEventId?: AgentEventId
  payload: ChatEventPayload
  rawRefs: readonly ChatRawRef[]
}

export type ChatEventType =
  | "message.started"
  | "message.part.added"
  | "message.completed"
  | "tool.started"
  | "tool.updated"
  | "tool.completed"
  | "permission.requested"
  | "permission.resolved"
  | "plan.updated"
  | "queue.updated"
  | "session.updated"
  | "status.updated"
  | "error.raised"
  | "debug.recorded"

export type ChatEventPayload = Record<string, unknown>

export type ChatRawRef = {
  id: string
  source: "agent" | "adapter" | "local" | "replay" | "restore"
  label?: string
}

export type ChatMessage = {
  id: ChatMessageId
  role: ChatRole
  partIds: readonly ChatMessagePartId[]
  eventIds: readonly ChatEventId[]
}

export type ChatMessagePart =
  | { id: ChatMessagePartId; type: "text"; text: string; eventIds: readonly ChatEventId[] }
  | { id: ChatMessagePartId; type: "reasoning"; text: string; eventIds: readonly ChatEventId[] }
  | { id: ChatMessagePartId; type: "attachment"; attachment: ChatAttachment; eventIds: readonly ChatEventId[] }
  | { id: ChatMessagePartId; type: "tool-ref"; toolId: ChatToolId; eventIds: readonly ChatEventId[] }

export type ChatAttachment = {
  kind: "file" | "image" | "url" | "resource"
  label: string
  uri?: string
  mimeType?: string
}

export type ChatElementType = "root" | "turn" | "message" | "work" | "subtask"

export type ChatLeafType =
  | "user-text"
  | "assistant-text"
  | "reasoning"
  | "attachment"
  | "recap"
  | "read"
  | "search"
  | "patch"
  | "command"
  | "tool"
  | "permission"
  | "plan-update"
  | "queue"
  | "session-status"
  | "file-snapshot"
  | "hook"
  | "mcp"
  | "usage"
  | "error"
  | "unknown"

export type ChatNode = ChatElement | ChatLeaf

export type ChatElement = {
  id: ChatNodeId
  type: ChatElementType
  children: readonly ChatNodeId[]
  eventIds: readonly ChatEventId[]
  summary?: string
}

export type ChatLeaf = {
  id: ChatNodeId
  type: ChatLeafType
  channel: ChatChannelId
  eventIds: readonly ChatEventId[]
  messageIds?: readonly ChatMessageId[]
  partIds?: readonly ChatMessagePartId[]
  toolIds?: readonly ChatToolId[]
  summary?: string
  status?: ChatStatus
  severity?: ChatSeverity
  width: ChatWidth
  defaultDisclosure: ChatDisclosure
  detailAccess: readonly ChatDetailAccess[]
  rawRefs: readonly ChatRawRef[]
  props: ChatLeafProps
}

export type ChatDetailAccess = "expand" | "cmd-hover" | "side-panel"
export type ChatLeafProps = Record<string, unknown>

export type ChatChannelState = {
  id: ChatChannelId
  label: string
  visible: boolean
  muted: boolean
}

export type ChatTranscriptTree = {
  rootId: ChatNodeId
  nodesById: Readonly<Record<ChatNodeId, ChatNode>>
}

export type ChatNodeState = {
  disclosureByNodeId: Readonly<Record<ChatNodeId, ChatDisclosure>>
  selectedNodeId?: ChatNodeId
  rawInspector?: { nodeId: ChatNodeId; rawRefId: string }
}

export type ChatSession = {
  id: ChatSessionId
  events: readonly ChatEvent[]
  messagesById: Readonly<Record<ChatMessageId, ChatMessage>>
  messagePartsById: Readonly<Record<ChatMessagePartId, ChatMessagePart>>
  tree: ChatTranscriptTree
  channels: Readonly<Record<ChatChannelId, ChatChannelState>>
  nodeState: ChatNodeState
}
```

Design notes:

- `type` is the discriminator for both elements and leaves. The structural difference is whether `children` exists.
- Channels are filters and routing metadata. They do not shape the tree.
- Debug records are not grouped by default. They are chronological ChatLeaf nodes with `channel = debug`.
- Work grouping is represented by `ChatElement` nodes only when grouping improves the primary transcript, such as compact read/edit/run summaries.
- `alien-projections` can help maintain flat keyed views such as visible leaves, pending permissions, running tools, or channel-filtered lists.
- `alien-trees` is appropriate if the ChatSession tree needs stable per-node subscriptions or descendant aggregates. The domain owner is still `projectChatTranscript(...)`, not the alien primitive.

Example tree:

```text
root
  turn:t1
    message:m1
      user-text:u1          channel=transcript
      attachment:att1       channel=transcript
    message:m2
      assistant-text:a1     channel=transcript
    work:w1                 summary="Read 4 files"
      read:r1               channel=activity
      search:s1             channel=activity
    file-snapshot:f1        channel=debug
    work:w2                 summary="Edited 2 files"
      patch:p1              channel=activity
      patch:p2              channel=activity
    error:e1                channel=error
```

## Projection Rules

`projectChatTranscript(...)` is the central transformation. It owns:

- event classification into ChatNode types
- turn/message/work tree grouping
- channel assignment
- summary text such as `Read 4 files`, `Edited 2 files`, `Ran 3 commands`
- default disclosure and width
- raw/detail access
- chronological placement

Default rules:

- User prompts and assistant narration are expanded prose leaves by default.
- Recaps are visible as `RECAP &middot; ...`; long recaps collapse with full detail available.
- Patch/edit leaves are expanded in detail when small, but bounded/collapsed when huge.
- Shell command output is collapsed by default. Failures show concise inline error text while preserving full stdout/stderr on expand.
- Read/search/fetch work can be grouped under a `work` element with a compact summary.
- Permission requests are expanded while actionable and collapsed after resolution.
- Plan, title, mode, usage, and queue updates update their UI state first; transcript leaves are created only when user-relevant, failed, or Debug-visible.
- Debug records are hidden or muted by channel state, but remain chronological leaves when Debug is visible.
- Unknown records become Debug leaves with complete raw payload. They must not masquerade as prompt/prose.
- Grouping must not cross user prompts unless the tree explicitly represents the interleaving.
- Every nontrivial leaf must be expandable or cmd-hover inspectable, even if hidden behind Debug by default.

## Implementation Plan

1. **Vocabulary and types cutover.** Rebase related beads/docs, audit current naming across the seven rename layers, add `apps/silvercode/src/chat/types.ts`, migrate docs/stories/fixtures/tests/touched source to the ChatEvent/ChatNode/ChatElement/ChatLeaf vocabulary, and add grep checks for rejected design terms.
2. **Fixture and inventory.** Build a replay fixture from the May 6 parity sessions and screenshots, covering user/assistant text, recaps, patch/edit output, shell output, read/search activity, queue events, title/config updates, task reminders, file snapshots, hooks, MCP/skill diagnostics, and unknown raw events.
3. **ChatEvent normalization substrate.** Add adapter-owned normalization from AgentEvent/ACP/Codex records into ChatEvents. `apply(...)` sees only ChatEvents.
4. **Transcript projection.** Implement `projectChatTranscript(...)` and the ChatSession tree projection with snapshot tests. Avoid a separate policy abstraction.
5. **State-first routing and channels.** Route title/mode/usage/queue/plan/liveness to UI state first, assign leaf channels, and make channel visibility/muting drive filtering.
6. **Core leaf renderers.** Implement renderers for user/assistant text, recap, patch, command, read/search, permission, plan-update, debug leaves, and errors before polishing rarer leaf types.
7. **Raw detail contract.** Ensure every nontrivial leaf has click expansion or cmd-hover raw detail, with complete raw refs and contextual placement that does not hide the inspected leaf.
8. **Visual parity review.** Run replay/termless snapshots and screenshot comparison against Claude Code for scanability, chronology, density, detail availability, and debug noise. Silvercode should be same-or-better, not a pixel clone.

## Refactor Phase Plan

Use the `/refactor` workflow for this epic. Each phase is sequential and independently shippable. Phase beads should repeat the mandatory first step: read `docs/lessons/refactoring.md` in full before editing.

**Phase 1: Vocabulary cutover**

Rebase related beads/docs and complete the mechanical vocabulary migration before presentation behavior changes.

Delete or isolate:

- Stale transcript vocabulary in docs, beads, tests, stories, fixtures, snapshots, comments, and touched Silvercode source.
- New ChatBlock-area references to legacy implementation names unless they live in a documented source boundary with a cleanup bead.

New tests:

- `apps/silvercode/tests/chat-block-vocabulary.test.ts`
- `apps/silvercode/tests/chat-block-vocabulary.reject.txt`

Definition of done:

- Standard vocabulary is used across new docs/tests/stories/fixtures and touched source.
- Every allowed legacy boundary is listed in one source-boundary doc with owner, reason, and cleanup bead id.
- No renderer, policy, or state-routing behavior changes are included except what is required to keep the rename compiling.

`/complete`:

- `rg -n -f apps/silvercode/tests/chat-block-vocabulary.reject.txt @km/silvercode apps/silvercode/docs apps/silvercode/storybook apps/silvercode/tests apps/silvercode/src` -> 0 stale-vocabulary hits outside explicitly allowed boundary docs.
- `bun vitest run apps/silvercode/tests/chat-block-vocabulary.test.ts`
- `npx tsc --noEmit`

**Phase 2: Replay fixture and event inventory**

Create the May 6 replay fixture and inventory all observed source forms before building renderers.

Delete or isolate:

- Ad hoc screenshot-only classification notes that are not represented in fixture data or inventory tests.

New tests:

- Replay/inventory fixture tests covering the May 6 sessions and screenshots.

Definition of done:

- Fixture includes text, recaps, edits, commands, read/search activity, queue/title/config updates, task reminders, file snapshots, hooks, MCP/skill diagnostics, and unknown raw events.
- Inventory maps every observed source form to `SessionEvent`, state-only, Debug-only, or intentionally ignored.

`/complete`:

- `bun vitest run apps/silvercode/tests/chat-block-replay-fixture.test.ts`
- `rg -n "TODO.*fixture|TODO.*inventory" apps/silvercode/tests apps/silvercode/docs @km/silvercode` -> 0 untracked fixture gaps.

**Phase 3: SessionEvent and ChatBlock substrate**

Add target type surfaces and projector inputs after Phase 1 passes.

Delete or isolate:

- Direct ChatBlock/projector dependence on legacy stream names.
- Duplicate local block/message unions that bypass the target substrate.

New tests:

- Type/projector tests proving representative source forms produce `SessionEvent` and `ChatBlock` shapes without renderer-specific summaries.

Definition of done:

- `SessionEvent` and `ChatBlock` are the names used by the new projection surface.
- Any retained legacy stream boundary has a cleanup bead created before this phase closes.

`/complete`:

- `rg -n "AgentEvent|SessionUpdate|MessageEntry|MessageOp" apps/silvercode/src/chat-block* apps/silvercode/src/components/ChatBlock* apps/silvercode/tests/chat-block* --glob '!**/*source-boundary*'` -> 0 hits.
- Projector/type tests pass.
- `npx tsc --noEmit`

**Phase 4: Presentation policy**

Centralize visibility, grouping, summaries, disclosure, width, and raw-detail rules.

Delete or isolate:

- Scattered summary/disclosure decisions in parser labels, activity summaries, tool-call rendering, and raw/detail components when they duplicate policy decisions.

New tests:

- Policy matrix snapshot tests for every ChatBlock class in `apps/silvercode/docs/chat-block-taxonomy.md`.

Definition of done:

- New event classifications fail tests until assigned visible block, grouped block, state-only, Debug-only, or ignored behavior.
- Summary text such as `Read N files`, `Edited N files`, and `Ran N commands` is owned by policy tests.

`/complete`:

- `bun vitest run apps/silvercode/tests/chat-block-presentation-policy.test.ts`
- `rg -n "Read [0-9]+ files|Edited [0-9]+ files|Ran [0-9]+ commands|Activity" apps/silvercode/src --glob '!**/chat-block-presentation-policy*' --glob '!**/*test*'` -> 0 policy-owned summary literals outside the policy surface.
- `npx tsc --noEmit`

**Phase 5: State-first routing and Debug channel**

Route title, mode, usage, queue, plan, liveness, hooks, MCP/skills, and file snapshots to state surfaces or Debug blocks.

Delete or isolate:

- Rendering of handled state/control updates as normal user/assistant transcript content.

New tests:

- Debug toggle tests and state-surface routing tests.

Definition of done:

- Queue events never render as user prompts.
- Task/plan reminders update plan UI when handled.
- Debug mode exposes complete raw detail for hidden/grouped diagnostics.

`/complete`:

- `bun vitest run apps/silvercode/tests/chat-block-state-routing.test.ts apps/silvercode/tests/chat-block-debug-channel.test.ts`
- Replay fixture proves handled state/control updates are absent from normal transcript output and present in Debug/detail output.

**Phase 6: Core smart blocks and raw detail**

Implement same-or-better renderers for patches, commands, reads/searches, recaps, errors, and unknown debug payloads.

Delete or isolate:

- Raw text dumps where a specialized ChatBlock exists.
- Wide-width summaries that should use prose width.

New tests:

- Render tests for `PatchBlock`, `CommandBlock`, `ReadSearchFetchBlock`, `RecapBlock`, `ErrorWarningBlock`, Debug expansion, table wrapping, and cmd-hover/raw detail.

Definition of done:

- Every nontrivial block is expandable or cmd-hover inspectable.
- Expanded command/edit/read output contains complete detail and wraps long lines.

`/complete`:

- `bun vitest run apps/silvercode/tests/chat-block-rendering.test.ts`
- Visual replay comparison checklist passes against the Claude Code baseline.

## Acceptance Criteria

1. A synthetic visual fixture or replay fixture exists for the May 6 comparison scenario, including user prompts, assistant narration, edit output, shell output, queue/title/config updates, debug metadata, task reminders, file snapshots, hooks/MCP/skills, and recap/summary events.
2. Expanded edit results render as operation blocks with:
- one clear header per operation/file, e.g. `Update(apps/km-cli/src/commands/bd.ts)`
- added/removed counts
- real source line numbers
- syntax-highlighted code/diff content
- no repeated path boilerplate inside the block body
- wrapped long lines without layout breakage
11. Command, search, and read blocks render compact summaries by default and expand to complete details: command/query/path, cwd where relevant, exit status, stdout, stderr, timing, and raw payload.
12. Debug/internal metadata blocks are not shown as normal transcript content. They are either handled as application state, grouped under Debug blocks, or hidden unless Debug is enabled.
13. All visible transcript content is a `ChatBlock` or state surface:
- user text block
- assistant text block
- polished work/status block
- actionable application state update
- Debug block with complete raw detail
22. `away_summary` renders as a recap block, using the agreed text shape: `RECAP &middot; summary text`.
23. `custom-title` is preferred over agent name when both exist. The active session name is visible near the top of the UI and can expose secondary title/name metadata on expansion.
24. Queue events are separated from user prompts and reconciled with Silvercode's own queue state. The UI must make lifecycle/state ownership clear enough to debug queued prompts.
25. Tables and prose in transcript content wrap instead of clipping, including links and long paths in table cells.
26. Visual review against Claude Code screenshots passes a checklist for scanability, chronology, useful density, detail availability, and debug noise. Silvercode should be same-or-better, not merely different.
27. Termless/render tests cover patch blocks, table wrapping/linkification, debug toggle behavior, recap rendering, and raw cmd-hover expansion.
28. `apps/silvercode/docs/chat-block-taxonomy.md` remains the source of truth for ChatBlock taxonomy and disclosure rules. Any transcript presentation change updates the doc when it changes classification, summary, visibility, grouping, expansion, width, or raw-detail behavior.
29. Summarization/disclosure decisions are centralized in a test-covered `ChatBlockPresentationPolicy` surface rather than split across parser labels, activity summaries, tool blocks, and raw-block components.
30. Current legacy `AgentEvent` and ACP `SessionUpdate` streams both route through the same block-presentation policy or a documented, cleanup-tracked source boundary, so provider-specific adapters do not own UI summarization rules.
31. Standard vocabulary is documented and enforced in this epic plus `apps/silvercode/docs/chat-block-taxonomy.md`; new docs/tests in this area use `SourceEvent`, `SessionEvent`, `ChatMessage`, `MessagePart`, `ChatBlock`, `ChatBlockPresentationPolicy`, and `StateSurface`.
32. The vocabulary migration phase completes before renderer/policy behavior work starts, with grep proof across docs, beads, tests, stories, fixtures, and touched source. Any allowed legacy boundary is listed in one source-boundary section with an open cleanup bead.
33. Every implementation phase has `/complete` criteria with exact grep commands, expected counts, tests, and docs updates. No phase can close on "mostly done" naming cleanup.

## Likely Implementation Areas

- `apps/silvercode/src/components/ToolCall.tsx`
- `apps/silvercode/src/components/ToolCallStatusTitle.tsx`
- `apps/silvercode/src/components/TurnActivitySummary.tsx`
- `apps/silvercode/src/components/SessionUpdateList.tsx`
- `apps/silvercode/src/components/AmbientEventRow.tsx`
- `apps/silvercode/src/components/Content.tsx`
- `apps/silvercode/src/components/MarkdownView.tsx`
- `apps/silvercode/packages/agent-harness/src/parse.ts`

Likely new/extracted components:

- `PatchBlock` or `DiffView` for edit/update operations.
- `DebugNotificationGroup` for internal event clusters.
- `RecapRow` for `away_summary`.
- Event inventory doc/test fixture under `apps/silvercode/tests` or an adjacent docs path.
- `SessionEvent` types for provider-neutral normalized events, plus a documented cleanup plan for any retained legacy `AgentEvent` / ACP `SessionUpdate` source boundary.
- `ChatBlock` types for UI-ready transcript blocks.
- `ChatBlockPresentationPolicy` for block creation, grouping, summary, expansion, width, and raw-detail rules.
- `ChatBlock` component dispatcher for custom/smart transcript blocks.

## Related Beads

- `@km/silvercode/acp-tool-call-sweep`
- `@km/silvercode/opencode-parity`
- `@km/silvercode/raw-entry-inspector`
- `@km/silvercode/chat-prose-width-layout`
- `@km/silvery/diff-code-accordion`
- `@km/silvery/comp-code`

## Follow-up Sub-beads To Split

- Migrate standard vocabulary across docs, beads, tests, stories, fixtures, and touched source; add grep gates.
- Build May 6 replay fixture and visual comparison checklist.
- Add `SessionEvent` and `ChatBlock` substrate, with explicit cleanup bead for any retained legacy boundary.
- Add `ChatBlockPresentationPolicy` and policy snapshot tests.
- Route title/mode/usage/queue/plan/liveness as state-first updates.
- Implement Debug channel grouping and debug toggle behavior.
- Implement `PatchBlock` / diff parity.
- Implement `CommandBlock` expanded output parity.
- Implement `ReadSearchFetchBlock` compact summaries and details.
- Implement `RecapBlock` and session-title/header treatment.
- Harden raw-detail expansion/cmd-hover for every nontrivial block.
- Run same-or-better visual parity review against Claude Code.
