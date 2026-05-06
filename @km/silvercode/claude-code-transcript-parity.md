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

## ChatBlock Taxonomy And Feature Name

The feature is **Chat Blocks**.

Raw source events should flow through:

`SourceEvent -> SessionEvent -> ChatBlock`

Use these terms consistently:

- `SourceEvent`: raw input from any source, such as a Claude JSONL row, Codex rollout event, ACP session update, OpenAI response item, Silvercode queue event, local hook event, or restored transcript record.
- `SessionEvent`: normalized chronological fact in a Silvercode session. Some SessionEvents are message events; others are tool, permission, plan, queue, session, lifecycle, or debug events.
- `ChatMessage`: accumulated role-bearing user/assistant/system message state. Messages are narrower than blocks.
- `ChatBlock`: the UI-ready transcript block and rendered visual unit. A ChatBlock owns its kind, content, status, summary, disclosure policy, raw refs, and rendering behavior.
- `ChatBlockPresentationPolicy`: the centralized policy matrix that decides whether a SessionEvent creates a block, joins a grouped block, updates state only, stays Debug-only, or is hidden.

The living design doc is `apps/silvercode/docs/chat-block-taxonomy.md`. Future changes to transcript grouping, summarization, default expansion, or Debug visibility should update that doc and the policy tests in the same patch.

## Vocabulary Migration

Migrate Silvercode transcript work to one vocabulary:

- `SourceEvent`: raw source-native input.
- `SessionEvent`: normalized chronological session fact.
- `ChatMessage`: accumulated user/assistant/system message state.
- `MessagePart`: typed content inside a ChatMessage.
- `ChatBlock`: UI-ready transcript block and rendered visual unit.
- `ChatBlockPresentationPolicy`: the central rules matrix for creation, grouping, summaries, disclosure, width, and raw/debug access.
- `StateSurface`: stateful destination such as header, side panel, plan drawer, queue indicator, permission inbox, usage/status surface.

Known vocabulary issues:

- `AgentEvent` is current legacy code vocabulary in `packages/agent-harness/src/events.ts`. Treat it as an implementation surface to rename or isolate behind a tracked source boundary, not the target concept.
- ACP `SessionUpdate` is a source/update surface. Do not conflate it with Silvercode `SessionEvent`.
- `MessageEntry` and `MessageOp` are current implementation names; new transcript presentation should migrate toward `ChatMessage`, `MessagePart`, and `ChatBlock`.
- `Chat.Turn.*` is UI grouping vocabulary only. New canonical model fields should not depend on provider `turnId`.
- Historical `entry`, `row`, `item`, and `card` language remains in components/tests/beads. Migrate docs, tests, stories, fixtures, and touched source before implementing new ChatBlock behavior.

Refactoring rules for this epic:

- Vocabulary migration is Phase 1, not a cleanup task. New renderers and presentation policy work should not start until the vocabulary gate passes.
- Keep mechanical rename work separate from behavior changes.
- Sweep the seven rename layers from the refactor workflow: data/fixtures, types, functions, files, comments, docs, and tests.
- Do not leave soft-migration aliases or old-name wrappers as the long-term path. If a legacy boundary must remain for a phase, list it explicitly and create the cleanup bead before closing that phase.
- `/complete` criteria must include exact grep commands and actual counts, not only passing tests.

## ChatBlock Taxonomy

Message blocks:

- `UserTextBlock`: actual user-authored text and explicit attachments only. Never mix queue records, prompt snapshots, reminders, or metadata into this visual primitive.
- `AssistantTextBlock`: assistant prose. This is the primary readable transcript surface and should stand out more than debug/internal machinery.
- `ReasoningBlock`: thinking/reasoning deltas. Render muted or collapsed unless currently active or explicitly expanded.
- `RecapBlock`: `away_summary`, compact summaries, Codex compaction/context summaries, response `summary` items. Render as `RECAP &middot; summary text`, with full recap/raw on expand or cmd-hover.

Work blocks needing specialized renderers:

- `PatchBlock`: `Edit`, `MultiEdit`, `Write`, `apply_patch`, `patch_apply_*`, `turn_diff`, `edited_text_file`, ghost snapshots/commits. Needs path, operation, added/removed counts, real line numbers, syntax-highlighted diff, and no repeated path boilerplate.
- `CommandBlock`: `Bash`, `exec_command_*`, `execution`, terminal interaction, ACP execute tools. Needs command, cwd, exit status, duration, stdout, stderr, and raw payload.
- `ReadSearchFetchBlock`: `Read`, `Grep`, `Glob`, `LS`, web fetch/search, `tool_search_output`. Needs compact activity summaries plus detail blocks.
- `ToolBlock`: tools without a richer mapping. Needs a generic block that still preserves input/output/raw detail.
- `MediaBlock`: image generation, image viewing, and media/resource outputs. Needs artifact metadata and preview when available.
- `SubAgentBlock`: Claude `Task`, Codex collaboration/task events, background agent work. Needs status, child stream, result, and raw detail.
- `CommitLifecycleBlock`: git commit/push outcomes. Needs compact muted lifecycle/status blocks with hash/remote data when available.

State/control blocks:

- `SessionIdentityBlock`: session init/meta, `agent-name`, `custom-title`, `ai-title`, thread-name/session-info updates. Update header/sidebar state; prefer `custom-title` over agent name; show secondary metadata on expansion/debug.
- `ModeConfigBlock`: permission mode, auto mode, config/mode/model updates. Update status/header/sidebar; do not show as normal transcript.
- `UsageCostBlock`: token/cost/context updates. Update side panel/status detail; Debug raw available.
- `QueueBlock`: `queue-operation`, `queued_command`, `last-prompt`, `turn_context`, and Silvercode queue state. Update queue UI/debug lifecycle; never render as a user prompt.
- `PermissionBlock`: permission requests/decisions, exec/apply-patch approval, elicitation, command permissions. Render actionable permission UI while pending; collapse resolved detail.
- `PlanTodoBlock`: plan updates, TodoWrite snapshots, task status/reminders, request-user-input. Update plan/task UI first; hide transcript blocks when the visual state already reflects the change.

Debug/diagnostic blocks:

- `HookDebugBlock`: hook started/completed/success/context. Debug notification group; visible errors only.
- `McpSkillDebugBlock`: MCP startup/tools, skill listings, invoked skills, deferred tools, MCP instruction deltas. Debug notification group.
- `FileSnapshotDebugBlock`: file history snapshots and compact file references. Debug notification group with file count/list.
- `ModelGuardDebugBlock`: model verification/reroute, guardian assessment, deprecation notices. Debug by default; warnings/errors visible.
- `UnknownDebugBlock`: unclassified provider payloads. Debug-only raw block, never user/assistant prose.

Lifecycle blocks:

- `TurnLifecycleBlock`: turn start/end/abort and stream chunk boundaries. Mostly hidden grouping metadata; aborts visible.
- `SessionLifecycleBlock`: session end, shutdown, undo, rollback, review-mode transitions. Muted lifecycle/status blocks only when user-relevant.
- `LivenessBlock`: liveness checks, generic status, background events. State/status surface first; Debug detail.
- `ErrorWarningBlock`: errors, warnings, stream errors, parse/tool failures. Visible error/warning block with raw detail.

## Centralized Summarization And Disclosure Policy

The scattered logic for labels, activity counts, body truncation, prose/wide width, raw inspectors, and default expansion should converge into `ChatBlockPresentationPolicy`. Every policy entry should define:

- event source or `SessionEvent` kind
- block kind, grouped block target, `state-only`, `debug-only`, or `hidden`
- summary text: e.g. `Read 4 files`, `Edited 2 files +10 -3`, `Ran 3 commands`
- grouping key and grouping boundaries
- default disclosure: `expanded`, `collapsed`, `adaptive`, or `state-only`
- detail access: click expansion, cmd-hover raw inspector, side-panel detail, or all of these
- width policy: prose for summary blocks; wide/auto only for expanded bodies that need it
- debug/raw fields to preserve

Default rules:

- User prompts and assistant narration are expanded prose by default.
- Recaps are visible as `RECAP &middot; ...`; long recaps collapse with full detail available.
- Patch/edit details are preferred expanded in detail view when small, but bounded/collapsed when huge. Activity summaries can still say `Edited N files`.
- Shell command output is collapsed by default. Failures show concise inline error text while preserving full stdout/stderr on expand.
- Read/search/fetch results are summarized by count and collapsed by default.
- Permission requests are expanded while actionable and collapsed after resolution.
- Plan/todo, title, mode, usage, and queue updates are state-first; transcript blocks are hidden when the state surface already reflects them.
- Hook/MCP/skill/file-snapshot diagnostics are grouped as Debug blocks and hidden unless Debug is enabled, except warnings/errors.
- Unknown events are Debug-only with complete raw payload. They should create pressure to classify them, but they must not masquerade as prompt/prose.
- Grouping must not cross user prompts. Expanded detail must restore original chronology.
- Every nontrivial block must be expandable or cmd-hover inspectable, even if hidden behind Debug by default.

## Implementation Plan

1. **Vocabulary migration.** Rebase related beads/docs, audit current naming across the seven rename layers, migrate docs/stories/fixtures/tests/touched source to `SourceEvent`, `SessionEvent`, `ChatMessage`, `MessagePart`, `ChatBlock`, `ChatBlockPresentationPolicy`, and `StateSurface`, and add grep checks for rejected design terms.
2. **Fixture and inventory.** Build a replay fixture from the May 6 parity sessions and screenshots, covering user/assistant text, recaps, patch/edit output, shell output, read/search activity, queue events, title/config updates, task reminders, file snapshots, hooks, MCP/skill diagnostics, and unknown raw events.
3. **SessionEvent and ChatBlock substrate.** Add target type surfaces and projection inputs after the vocabulary gate. Any retained legacy boundary such as `AgentEvent` or ACP `SessionUpdate` must be listed explicitly with an open cleanup bead before this phase closes.
4. **Policy scaffold.** Add `ChatBlockPresentationPolicy` with snapshot tests. All visibility, summary, grouping, width, and disclosure decisions should live in one matrix.
5. **State-first routing.** Route session identity, mode/config, usage/cost, queue, plan/todo, and liveness updates to their state surfaces first. Only create transcript blocks for user-relevant, actionable, failed, or Debug-enabled cases.
6. **Core block renderers.** Implement `PatchBlock`, `CommandBlock`, `ReadSearchFetchBlock`, `RecapBlock`, `DebugBlock`, and `ErrorWarningBlock` before polishing rarer block types. These cover the screenshots' highest-noise/highest-value gaps.
7. **Raw detail contract.** Ensure every nontrivial block has click expansion or cmd-hover raw detail, with complete raw refs and contextual placement that does not hide the inspected block.
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

