---
mentions:
  - km
id: "@km/silvercode/chat-layout-quality-plateau"
aliases:
  - km-silvercode.chat-layout-quality-plateau
  - km-silvercode-chat-layout-quality-plateau
created_at: 2026-05-01T04:38:32.671Z
type: bug
priority: P0
closeReason: "Completed after current screenshot-driven review and user request
  to complete. The remaining live regression found during closure was the
  resumed-session divider right gutter; fixed in f33ab87c5. Verification:
  Silvercode transcript/layout slice passed 12 files, 187 tests, including
  content-layout, message-list-scroll, codex-resume, turn-activity-summary,
  tool-call, markdown, ambient rows, session-end, closeAll, resume blank-screen,
  and CLI smoke."
---

# [x] [bug] Silvercode chat layout quality plateau @km/silvercode #bug #P0

blocks:: [[@km/silvercode]]

## Problem

Silvercode's central chat/session pane has accumulated several related layout, scrolling, selection, and disclosure regressions. Fixing these one at a time has not reached the expected quality bar; this bead tracks the whole plateau as one P0 until the user and implementer confirm the complete behavior in the real app.

Do not close this bead, and do not mark acceptance items done, until both:

- The implementer has verified the behavior with focused tests and a real `silvercode` run.
- The user has confirmed the behavior from screenshots or hands-on use.

## Acceptance Criteria

Keep these unchecked until jointly confirmed.

- [ ] Welcome screen does not refresh after 3-5 seconds. If a refresh/re-render is unavoidable, the input field keeps cursor position and edit state.
- [ ] `Resumed session ...` renders as its own session metadata row with exactly one blank line of breathing room around it, without double-spacing when adjacent sections also have spacing.
- [ ] User prompts are flush with the right edge of the prose column. Regular `SessionEntry` content uses a narrower left lane, around 90% of prose width, leaving right-side breathing room so the transcript reads like chat.
- [ ] Collapsed and expanded content tries to fit in the prose lane first. It uses `wide` or `full` only when the actual content needs it. Expanded activity-summary command rows should truncate/compact in prose; raw/wide output should only widen when that individual item is truly expanded.
- [ ] Clicking a line to expand/collapse preserves that clicked line's screen position. A second click at the same coordinates should collapse/expand the same row, not miss because the view jumped.
- [ ] Text selection scopes to the smallest selectable entry/bubble where possible, instead of always selecting the entire content pane. Cross-entry selection should escalate to the content pane.
- [ ] User prompt background is owned by the prompt bubble box/surface, not painted only behind text glyphs.
- [ ] Scrollbar hover and drag states work: hover shows an armed effect, active drag shows a clicked/armed effect, and dragging does not lose grip after a short movement.
- [ ] Scrollbar drag/release state is robust with trackpad input. It must not stay visually armed after the click/press is released, including when the release happens away from the one-column thumb/track.
- [ ] Scrollbar interaction is smooth enough for real use. Dragging and trackpad scrolling should not feel janky from redundant renders, stale timers, missing global capture, or event-state churn.
- [ ] Top/bottom overflow or edge-bump indicators remain visible when the scrollbar is hovered, armed, or actively dragged. The armed scrollbar chrome must not suppress the boundary cue.
- [ ] Scrollbar/content geometry reaches the top and bottom of the screen where possible. The command box should not force the visible scroll track to stop awkwardly above it; consider bottom padding inside content plus bottom-aligned/floating composer or another coherent layout.
- [ ] Claude Code session `6c17eef9-b26e-422d-bd1a-fe0017acaad2` does not get stuck or appear stuck in the transcript UI; any truly active or blocked state is surfaced explicitly.
- [ ] Markdown-rich assistant content in that Claude Code session has coherent block layout. Bullets, nested text, and adjacent paragraph blocks align to the same prose system instead of drifting left/right independently.
- [ ] Blockquotes render without a visible border. Their `plain` label is absolutely positioned in the top-right, with one space of inner padding around the quoted content.
- [ ] Ghostty should show the graphic Silver Code logo on the welcome/loading screen when terminal capabilities support it, instead of falling back to ASCII art.
- [ ] The graphic Silver Code logo must not leave orphaned Kitty/Ghostty bitmap placements. In particular, no logo fragment or other image artifact may appear at the top-left after the welcome screen repaints, after the banner unmounts, or after entering the chat session screen.
- [ ] Thinking text/words render through the same session-entry/content-lane system as assistant prose, not flush-left or outside the prose lane.
- [ ] Rendering assistant content must never blank the screen. The transcript should retain visible prior content while streamed/async content such as syntax-highlighted code upgrades.
- [ ] Markdown code blocks fit the prose lane by default, with no stray marker dot in the left gutter. The block has a 2-column outside margin on both sides, one-line top/bottom inner padding, and the top-right language label respects the same inner horizontal padding.
- [ ] Timestamps render as margin asides. Assistant timestamps appear in the left gutter, user prompt timestamps appear in the right gutter, both only on Cmd-hover, and user timestamps align with the prompt text baseline without changing layout.
- [ ] Assistant text ops that contain paragraph breaks are treated as standalone prose when adjacent to other ops in the same assistant turn: one collapsed separator around the standalone block, no doubled blank lines next to session metadata or user bubbles.

## Current Status Notes

Do not mark acceptance criteria done yet; these are implementation notes only.

- 2026-05-01: The flexily overlap root cause was traced to core layout, not silvercode component placement. `layout-zero.ts` now gates flex-grow main-axis constraint on a definite parent main-axis budget. Flexily, silvery contract, and focused silvercode content-layout tests passed in the working tree, but user confirmation and integration cleanup are still pending.
- 2026-05-01: Timestamp gutter alignment and standalone prose spacing have focused strict tests passing in `apps/silvercode/tests/content-layout.test.tsx`. Keep criteria unchecked until the user confirms in the real app screenshots.
- 2026-05-01: New blocker: after the welcome screen repaints after a few seconds, a visual fragment appears at the top-left and persists into the chat session. Follow-up inspection showed at least one reported top-left artifact was ambient Tribe/broadcast text, not a Kitty bitmap fragment. The normal `SessionCard` path is now covered by `apps/silvercode/tests/ambient-welcome-artifact.test.tsx`: ambient entries before transcript content do not render on the Welcome screen, and ambient entries after transcript content stay inside the content lane. If the top-left artifact persists, investigate the separate surface or stale external process output instead of carrying the obsolete image-only hypothesis.
- 2026-05-01: Process cleanup gap: stale `bun -e ... renderScenario` probes and orphaned `@zed-industries/codex-acp` daemons were observed after earlier runs. The ACP client spawn path now uses `detached: true` plus `gracefulKillTree()` for both `close()` and scope disposal, and focused strict tests prove scope disposal signals the process group. Keep monitoring real Ctrl-C and resume-session exits for orphaned grandchildren.
- 2026-05-01: `km bd show @km/silvercode/chat-layout-quality-plateau` is currently blocked by km-storage v7→v8 duplicate-name migration errors. This bead was updated directly as markdown; do not treat the failed CLI read as normal.
- 2026-05-06: Screenshot showed text selection painting empty structural gutters and user-prompt bubble padding, plus cmd-hover popovers surfacing duplicate `ops` payloads for visible prompt/narration content. Root cause was in silvery semantic selection: `userSelect="text"` did not work as a selectable island inside `userSelect="none"` chrome, and selection paint still needed to respect selectable/content cells. Fixed in `vendor/silvery/packages/ag-term/src/mouse-events.ts`, `vendor/silvery/packages/ag-term/src/selection-renderer.ts`, and silvercode's prompt bubble semantics in `apps/silvercode/src/components/Chat.tsx`. Follow-up after live testing: production `silvercode` uses Silvery's fullscreen defaults again; the Silvery Term/emulator `run(<App />, term)` overload now defaults mouse/selection on in fullscreen too, with regression coverage. User prompt prose uses normal `userSelect="text"` semantics so a drag that starts inside a prompt can auto-expand into adjacent transcript entries; selection paint clips each row to its actual rendered content bounds, so it does not fill prompt padding or the empty cells outside the body column. `SessionEntry` marks gutter chrome nonselectable while keeping entry bodies selectable. Cmd-hover is now disabled while selection is active, no longer uses stale global modifier fallback, hides right-side user prompt timestamps, and skips raw inspectors when they add only duplicate/empty visible payload. Regression coverage: `vendor/silvery/tests/selection.test.ts`, `vendor/silvery/tests/features/selection-shrink-visual.test.tsx`, `vendor/silvery/tests/features/selection-e2e.test.tsx`, `vendor/silvery/tests/features/popover-cmd-hover.test.tsx`, and `apps/silvercode/tests/content-layout.test.tsx`.

## Implementation Organization

Work through these tracks in order. Each track should end with focused tests at the owning layer and a real silvercode visual check before moving on.

### Track A — Rendering Artifacts And Graphics Lifecycle

Goal: terminal bitmap/image output is owned by silvery and cannot outlive the React node or its screen rect.

- Reproduce the top-left artifact with the real welcome repaint path in Ghostty or a capture harness.
- Distinguish terminal bitmap artifacts from ambient/log text artifacts. Ambient rows must only render through the transcript/content lane; stale external process output must be treated as a lifecycle leak, not a layout row.
- Add a silvery-level regression around `<Image>` placement lifecycle:
  - initial placement is not emitted at `(0,0)` before layout coordinates are known;
  - movement updates replace/delete the previous placement;
  - unmount emits a delete for the placement/image as appropriate;
  - switching from image banner to text/chat content leaves no placement behind.
- Audit `Image.tsx`, `image-placement.ts`, and any `writeAfterFrame`/post-frame escape path for lifecycle ownership. The output-phase text buffer cannot be the only source of truth for out-of-band graphics.
- Decide whether silvery needs a general post-frame resource registry for out-of-band terminal resources (Kitty images, overlays, future sprites), so stale resources are cleaned by diffing desired resources against previous resources.
- Verify the welcome screen still shows the graphic logo in Ghostty when supported.

### Track B — Content Layout Contract

Goal: every transcript row expresses lane intent once, through shared primitives.

- Keep `Content.Layout`, `Content.Row`, `Content.Body`, `Content.Prose`, `Content.Wide`, `Content.Full`, and `Content.Aside` as the shared family; remove local one-off width/indent overrides where possible.
- Define `SessionEntry` defaults as the normal assistant/system row contract: prose lane, about 90% width for paragraph-like text, full prose width for code/table blocks, and stable marker column.
- Define user prompt rows as right-aligned prose-lane content with bubble-owned background/padding and right-aside timestamp.
- Keep standalone prose as a named concept: assistant text ops with internal paragraph breaks that need separation from adjacent ops inside the same assistant turn.
- Move any remaining markdown block layout special cases toward block-aware rendering: prose paragraphs/lists in prose lane, code blocks/tables in the best fitting lane, no stray markers in code block gutters.

### Track C — Scroll, Disclosure, And Anchoring

Goal: expanding/collapsing content and scrolling never makes the user lose the target line.

- Implement or upgrade the silvery primitive needed for anchored expansion: the caller can say which screen row or item key should stay visually fixed across a height change.
- Apply that primitive to activity summaries, tool calls, session metadata, markdown code blocks, and any other disclosure row.
- Ensure expanded views fit prose first and widen only when the expanded child genuinely needs `wide` or `full`.
- Make scrollbar drag/hover/release use robust pointer capture semantics so trackpad release cannot leave the thumb armed.
- Keep top/bottom overflow indicators visible while scrollbar chrome is hovered or active.
- Make the scrollbar track/content geometry coherent with the floating command box: either the track reaches full screen with bottom padding under the composer, or the layout has an explicit reason not to.

### Track D — Selection And Hover Metadata

Goal: text selection, timestamps, and popovers behave like scoped document UI, not raw terminal buffer accidents.

- Implement scoped text selection at the silvery selection layer: default selection starts in the smallest selectable owner; cross-owner selection escalates to the highest common selectable ancestor; Shift-selection can opt into buffer-wide behavior if needed.
- Ensure user prompt bubbles define their own selectable scope while turns/session lists define broader fallback scopes.
- Keep timestamps as Cmd-hover-only asides; showing/hiding them must not change layout.
- Normalize popovers to Cmd-hover for now, and ensure hover alone does not briefly open/close popovers.

### Track E — State Machine And Session Metadata

Goal: resumed and active sessions show truthful status and metadata, with no stuck or missing turn states.

- Add virtual session metadata entries for session start/resume/end, with click-to-expand details and exactly one collapsed separator around them.
- Investigate Claude session `6c17eef9-b26e-422d-bd1a-fe0017acaad2` for stuck/appears-stuck state. If active, show what it is blocked on; if ended, render ended state and no running command.
- Keep first prompt visible on resume for Codex and Claude sessions.
- Add liveness/deadlock detection around in-flight turns and permission prompts so a turn cannot silently remain open forever.
- Ensure every session close path reaps spawned backends and their grandchildren. Normal close, Ctrl-C, app unmount, scope disposal, and test harness disposal should all converge on process-group cleanup; no ACP wrapper daemon should survive with PPID 1 after the parent exits.

### Track F — Storybook And Verification Harness

Goal: regressions are visible in durable examples, not only in one live transcript.

- Update Silvercode storybook/All to use the real session components inside `Content.Layout`.
- Include examples for fresh welcome, loading resumed session, session start/resume metadata, user prompts, assistant prose, standalone prose, thinking text, code blocks, blockquotes, activity summaries collapsed/expanded, small/large tool results, permission prompts for Codex and Claude, and scrollbar/composer states.
- Add a helper that can render real resumed sessions to text/ANSI for inspection without starting a backend: Codex `019ddfc8-0749-7da1-b892-b2e1c6bc389f` and Claude `6c17eef9-b26e-422d-bd1a-fe0017acaad2`.
- Run focused strict tests first, then real `silvercode --resume ...` checks, then ask for screenshot/user confirmation before checking off acceptance criteria.

## Related Areas / Cross-Links

Likely related code:

- `apps/silvercode/src/components/SessionUpdateList.tsx`
- `apps/silvercode/src/components/SessionEntry.tsx`
- `apps/silvercode/src/components/TurnActivitySummary.tsx`
- `apps/silvercode/src/components/ToolCall.tsx`
- `apps/silvercode/src/components/Content.tsx`
- `apps/silvercode/src/components/PaneGrid.tsx`
- `apps/silvercode/src/components/Welcome.tsx`
- `vendor/silvery/packages/ag-react/src/ui/components/ListView.tsx`
- `vendor/silvery/packages/ag-react/src/ui/components/Scrollbar.tsx`
- `vendor/silvery/packages/ag-react/src/ui/image/Image.tsx`
- `vendor/silvery/packages/ag-react/src/ui/image/image-placement.ts`
- `vendor/silvery/packages/headless/src/selection.ts`
- `vendor/flexily/src/layout-zero.ts`

Related existing bug themes to cross-link if matching beads exist:

- content/prose lane layout
- turn activity summary disclosure
- resumed-session metadata rows
- click-to-expand scroll anchoring
- scoped text selection
- scrollbar hover/drag behavior
- welcome composer refresh/cursor retention
- terminal graphics / Kitty image placement lifecycle
- flex-grow auto-main layout measurement

## Verification Plan

- Add focused tests for each acceptance item before fixing it.
- For silvery/flexily bugs, place final regression tests at the owning package layer and keep only app-level smoke coverage where it protects composition.
- Include at least one real resumed Codex session render using `silvercode --resume codex:019ddfc8-0749-7da1-b892-b2e1c6bc389f`.
- Include at least one real resumed Claude Code session render using `silvercode --resume claude:6c17eef9-b26e-422d-bd1a-fe0017acaad2`.
- Use visual/terminal verification for layout, scroll anchoring, scrollbar drag, and selection behavior.
- Use Ghostty or a terminal-capture path that can verify Kitty graphics lifecycle for the welcome logo artifact.
- Run the relevant targeted tests plus `bun run test:fast` before requesting user confirmation.

