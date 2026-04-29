---
id: "@km/agent-view/mvp-design"
aliases:
  - km-agent-view.mvp-design
  - km-agent-view-mvp-design
created_by: claude:c6244087
created_at: 2026-04-23T06:13:35Z
closed_at: 2026-04-23T08:00:06Z
close_reason: "v0 shipped in commits 35caec8d0 (feat exports), 4216d4c5d
  (silvery bump), 3eb59bdd0 (style format). 6/6 tests green. Follow-ons:
  km-silvery.listview-flex-sibling, km-silvery.docs-flex-content-width."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-agent-view.mvp-design
    depends_on_id: km-agent-view
    type: parent-child
    created_at: 2026-04-22T23:13:35Z
    created_by: claude:c6244087
    metadata: "{}"
---

# [x] MVP design: iMessage-style chat view, progressive disclosure, pill clustering @km/agent-view #feature #P1

blocks:: [[@km/agent-view]]

Capture the v0 design for the agent-view demo.

## Vision
Chat-UI viewer for Claude Code session JSONL. iMessage-shaped (USER right, everything else left, bubbles + pills). Showcase for silvery virtual-terminal ListView, layout, theming, interactive disclosure. Architected so the same shell could later become a coding-agent frontend — include a disabled composer region from v0 to telegraph direction.

Sibling to @km/logview, not replacement: @km/logview = flat power-user list; @km/agent-view = chat product surface. Shared code: ViewConfig + Claude parser — extract into a package once this lands (wait for the second consumer rule).

## Message visual language

| Kind          | Side   | Style                        | Default state        |
|---------------|--------|------------------------------|----------------------|
| user          | right  | `$primarybg` filled bubble   | full                 |
| assistant text| left   | subtle border                | full                 |
| thinking      | left   | dim italic                   | collapsed            |
| tool_use      | left   | tool icon + inline cmd       | 1-line preview       |
| tool_result   | nested under its tool_use | dim | 3-line snippet       |
| hook          | pill cluster row | small chip          | grouped              |
| inject        | warning pill | `$warning`           | collapsed to pill    |
| queue-op      | hidden | —                            | off                  |

## Progressive disclosure — 4 levels

1. **Pill** — tiny chip, one per event, color+label only
2. **Inline-expanded** — full bubble in-flow (toggle via Enter/click)
3. **Hover popover** — transient preview, no state change
4. **Detail drawer** — D or Shift-click → full raw JSON overlay

Global default level configurable (e.g. `--level=pills`); per-row override via keybind.

## Smart grouping
Consecutive same-kind events collapse to `◆ HOOK ×N` with expand-in-place. Trigger on either (N=3) or (window=500ms) — open question below.

## Time-aware features
- Relative timestamps ("2m ago"), absolute on hover
- Duration badges on tool_use: pair with tool_result by tool_use_id
- Turn summary: cost, tokens-in/out, duration per assistant turn (if JSONL has them)
- Session markers (SessionStart, compact, checkpoint) as horizontal dividers

## iMessage anatomy
- **Top**: session tabs (5 latest by mtime, new-data dot, Ctrl+Tab)
- **Middle**: message stream (ListView cache: virtual, auto-scroll-on-follow)
- **Bottom**: composer placeholder (greyed out in v0 — signals future direction)
- **Status strip**: current session cost/tokens/duration (optional)

## Real-time tail
- fs.watch on current tab's session file
- Auto-scroll pinned-to-bottom; stops when user scrolls up
- `▼ N new` jump-to-latest badge when not at bottom
- Per-tab new-data indicator dot

## Filter bar
- Kind toggle chips: USER / ASSIST / TOOL / HOOK / SYSTEM
- Tool-specific filter (Bash, Edit, Read, …)
- Text search (reuse SearchProvider from @km/logview)
- Combined expression syntax: `kind:user \"worktree\"` (Gmail/lnav style) — parse to predicate + text

## Phased plan
- **v0 — showcase** (blocking for silvery demo): one session, static load, bubbles, pill clustering for hooks, expand/collapse, detail drawer, no real-time
- **v1 — live**: fs.watch tail, auto-scroll behavior, new-data indicator
- **v2 — multi-session**: 5 tabs with new-data dots, Ctrl+Tab switching, cross-session text search
- **v3 — filters + durations + grouping**: filter bar, duration badges, turn summaries
- **v4 — promotion**: extract shared parser package, publish as `@silvery/examples/apps/agent-demo`, write blog post

## Open questions
1. Extract Claude parser into a shared package now or after v0? (default: wait per "second consumer" rule — @km/logview alone doesn't justify extraction)
2. Bubble width: fixed N-col cap (e.g. min(60, cols*0.7)) or responsive flexShrink? Test at 80 and 200 cols.
3. Pill cluster trigger: consecutive count, time window, or both? (lean: both — cluster when ≥3 consecutive AND within 1s)
4. v0 composer region: render disabled placeholder to signal direction, or omit entirely until v2?
5. Naming when promoted: `@silvery/examples/apps/agent-demo` vs `claude-replay` vs `codescope`?

## Why this is a good silvery showcase
Exercises ListView virtual cache, theme tokens (bubble backgrounds), layout (alignment, flex, width caps), hover/click events, tabs, animation (optional), search, pills (compact UI), multi-surface (tabs as independent ListViews). And every Claude Code user recognizes the source data — the demo explains itself.

## Open design files to reference
- `apps/km-logview/src/configs/claude-session.ts` — parser + row derivation (port/share)
- `vendor/silvery/examples/apps/vterm-demo/index.tsx` — virtual-terminal ListView pattern
- `vendor/silvery/docs/guide/the-silvery-way.md` — canonical components + styling

## Placement
- v0-v3: `apps/km-agent-view/` (new km app, sibling to @km/logview)
- v4: extract to `vendor/silvery/examples/apps/agent-demo/` (public showcase)