---
mentions:
  - km
id: "@km/silvery/virtualinline-parity"
aliases:
  - km-silvery.virtualinline-parity
  - km-silvery-virtualinline-parity
created_by: Bjørn Stabell
created_at: 2026-04-03T05:59:22Z
owner: bjorn@stabell.org
---

# [ ] altInline — seamless alt-screen rendering with zero-config defaults @km/silvery #epic #P1

Go beyond Claude Code's NO_FLICKER. Make silvery's fullscreen mode seamless: zero-config, auto-detecting, with features CC doesn't have. The default rendering mode for interactive terminal apps.

## Three rendering modes

- **inline** — main screen buffer, terminal owns scrollback (progress bars, short output)
- **altInline** (default) — alt screen buffer, dumps history to scrollback on exit. Looks inline before/during/after but has all alt screen powers: no flicker, mouse, search, virtual rendering
- **altScreen** — alt screen buffer, persistent UI, no dump on exit (vim/htop/km board). Alias: "fullscreen" accepted silently

Both alt modes set alternateScreen: true internally. They differ only in exit behavior (dump to scrollback or not).

## Core innovation: altInline

1. START: enter alt screen — terminal preserves original content automatically
2. RUNNING: full alt screen with all behaviors (mouse, search, scroll, no flicker, viewport clipping)
3. EXIT: leave alt screen (original content restored), print entire session history to stdout

After exit: Cmd+F works, tmux copy mode works, grep works. Session looks like normal inline command output. CC's Ctrl+O -> [ does this manually; altInline does it automatically.

## Mode matrix

default = on automatically, supported = opt-in, N/A = not applicable

| Feature                                                | inline    | altInline | altScreen |
| ------------------------------------------------------ | --------- | --------- | --------- |
| Scroll (keyboard/wheel/auto-follow/speed)              | N/A       | default   | default   |
| Mouse selection (semantic/dblclick/tripleclick/copy)   | supported | default   | default   |
| Interactive mouse (expand/collapse, URL click, toggle) | supported | default   | default   |
| Popovers — hover (link URL, truncated text)            | supported | default   | default   |
| Popovers — keyboard (keybinding hints on focus)        | default   | default   | default   |
| Content filtering (by type, by content, collapse)      | supported | default   | default   |
| Search (Cmd+F, match highlight, n/N)                   | N/A       | default   | default   |
| Transcript mode (Ctrl+O less-style)                    | N/A       | default   | default   |
| tmux clipboard routing                                 | default   | default   | default   |
| tmux auto-detection (mouse, -CC fallback)              | N/A       | default   | default   |
| Dump history on exit                                   | N/A       | default   | no        |

## Phased plan

### Phase 1: Foundation — rename + dump on exit

- [ ] Rename virtualInline -> altInline, accept "fullscreen" as altScreen alias
- [ ] On altInline exit: leave alt screen, print session history to stdout

### Phase 2: Scroll behaviors

- [ ] Ctrl+Home -> top, Ctrl+End -> bottom + resume auto-follow
- [ ] Auto-follow: pause on scroll-up, resume on scroll-to-bottom
- [ ] Auto-calibrate scroll speed via wheel event frequency (no env var)

### Phase 3: Mouse selection

- [ ] Semantic click select: selectable prop — click selects whole component, copy gives clean text
- [ ] Double-click word select (Unicode UAX #29, file paths as unit)
- [ ] Triple-click line select
- [ ] Copy-on-select -> @km/silvery/copy-on-select

### Phase 4: Interactive mouse

- [ ] Click-to-expand/collapse — Collapsible/Disclosure component
- [ ] URL/file path click to open (Link + OSC 8 exist, wire mouse click)
- [ ] Runtime mouse disable toggle (keybinding, not env var)

### Phase 5: Popovers (CC doesn't have) -> @km/silvery/popover

- [ ] Link hover: show URL in floating popover
- [ ] Truncated text: show full text on hover
- [ ] Focused element: show keybinding hint
- [ ] Explicit Popover for app-level use (file preview, error details, timestamps, colors, commits)

### Phase 6: Content filtering (Warp-style, CC doesn't have)

- [ ] Filter by type: toggle visibility per component type
- [ ] Filter by content: live narrowing (hides non-matches)
- [ ] Collapse by type: fold all items of a type
- [ ] Block-level copy: semantic select + copy clean text
- [ ] Block-level export: single block as markdown/HTML
- [ ] region prop on Box for tagging filterable/collapsible categories
- [ ] ListView filter prop for item-level filtering

### Phase 7: Search

- [ ] Cmd+F (Kitty) / Ctrl+F across all content
- [ ] Match highlighting with scroll-to-match
- [ ] Cmd+G / n for next, Shift+Cmd+G / N for prev

### Phase 8: tmux intelligence

- [ ] Auto-detect mouse mode, degrade gracefully
- [ ] Auto-detect tmux -CC -> fallback to inline
- [ ] Auto-route clipboard to tmux paste buffer

### Phase 9: Transcript mode -> @km/silvery/transcript-mode

- [ ] Ctrl+O: less-style j/k/g/G/Ctrl+u/d navigation
- [ ] Mid-session dump to native scrollback ([ key)
- [ ] Open content in $EDITOR (v key)

### Phase 10: aichat demo — showcase everything

- [ ] Switch to altInline default
- [ ] selectable on message blocks, Collapsible on tool output
- [ ] Link components + hover popovers on URLs
- [ ] region tags for content filtering (user/agent/tool)
- [ ] Filter toggles, Cmd+F search, copy-on-select, dump on exit
- [ ] The definitive proof that altInline > CC's NO_FLICKER

### Phase 11: silvery.dev docs audit

Full audit of silvery.dev to ensure every feature — new and existing — has proper documentation. This is NOT just about modes; it's about the whole site.

Audit scope:

- [ ] Read all existing docs to map what's documented vs what's shipped
- [ ] Identify underdocumented features (existing + new from this epic)
- [ ] Ensure every component has a doc page (currently 42 component pages — check for gaps)

New features needing docs:

- [ ] Popover component (new) — component page + guide usage
- [ ] Collapsible/Disclosure component (new) — component page
- [ ] selectable prop on Box — add to Box.md, new guide section
- [ ] region prop on Box — add to Box.md, new content filtering guide
- [ ] Copy-on-select — add to mouse/input docs
- [ ] Content filtering — new guide page
- [ ] Semantic selection — new guide section under mouse/input

Existing docs to update:

- [ ] guide/scrolling.md — update with altInline scrollback, auto-follow, scroll speed calibration
- [ ] reference/input-features.md — add double-click, triple-click, semantic select
- [ ] components/Tooltip.md — update or redirect to Popover
- [ ] components/Link.md — add popover behavior, click-to-open
- [ ] components/ListView.md — add filter prop, region-based filtering
- [ ] guide/the-silvery-way.md — add principle about zero-config defaults
- [ ] guide/silvery-vs-ink.md — update (Ink has no altInline, popovers, filtering, etc.)
- [ ] reference/terminal-capabilities.md — tmux detection, scroll speed detection

New pages:

- [ ] guide/rendering-modes.md — inline/altInline/altScreen, when to use each, mode matrix
- [ ] guide/mouse.md or update event-handling.md — selection, popovers, semantic select, copy
- [ ] guide/tmux.md — zero-config tmux support, auto-detection, clipboard, -CC fallback
- [ ] guide/content-filtering.md — Warp-style filtering, region prop, collapse by type
- [ ] guide/transcript-mode.md — Ctrl+O, vi navigation, dump, editor
- [ ] guide/silvery-vs-cc.md or blog post — comparison with Claude Code NO_FLICKER

Examples:

- [ ] Update all examples to use appropriate mode (not hardcoded fullscreen/inline)
- [ ] aichat example as the flagship altInline showcase (Phase 10)

Meta:

- [ ] CHANGELOG entry for the altInline feature set
- [ ] README: mention modes naturally (not as the lead — silvery is a React TUI framework first)

## km adoption plan

### Mode selection

- bun km view (board) -> altScreen — persistent UI, no dump
- bun km (CLI one-shot) -> altInline — output stays in scrollback
- Future AI/chat -> altInline — conversation dumps on exit

### Per-phase km usage

Phase 1: CLI commands use altInline — no flicker, output persists in scrollback
Phase 2: Board auto-follow on sync/import, Ctrl+Home/End for long boards
Phase 3: selectable on cards (copy gives clean markdown), selectable on code blocks, copy-on-select
Phase 4: Mouse expand/collapse cards (currently keyboard-only z/Z), click links/file paths in body
Phase 5: Truncated card titles hover -> full title, due dates hover -> absolute date, keybinding hints on focused card (e=edit, z=fold, d=done), link previews, column header hover -> item count
Phase 6: Filter by status (TODO/DONE/IN_PROGRESS), live search narrows cards, collapse sub-items, region tags per card type, block-level copy of columns
Phase 7: Cmd+F across all columns, n/N jumps between matching cards
Phase 8: Auto clipboard routing in tmux, auto-fallback on tmux -CC
Phase 9: Ctrl+O to review board with vi nav without accidental edits

## CC hacks -> silvery solutions

| Claude Code                         | silvery                                             |
| ----------------------------------- | --------------------------------------------------- |
| CLAUDE_CODE_NO_FLICKER=1 env var    | altInline is default                                |
| CLAUDE_CODE_DISABLE_MOUSE=1 env var | Runtime keybinding toggle                           |
| CLAUDE_CODE_SCROLL_SPEED=3 env var  | Auto-calibrate via wheel frequency                  |
| "one-time hint" for tmux mouse      | Auto-detect and degrade                             |
| "incompatible with tmux -CC"        | Auto-detect and fallback to inline                  |
| Ctrl+O -> [ manual dump             | Automatic dump on exit                              |
| iTerm2 word boundaries              | Unicode UAX #29 + selectable prop                   |
| No popovers                         | Auto popovers on links, truncated text, keybindings |
| No content filtering                | Warp-style type/content filtering + collapse        |
| No semantic selection               | selectable prop — click component, copy clean text  |

## Children

- @km/silvery/copy-on-select (P1) — Phase 3
- @km/silvery/popover (P2) — Phase 5
- @km/silvery/transcript-mode (P3) — Phase 9

## Done when

- altInline is default mode, all behaviors built in
- Zero env vars — everything auto-detected or runtime-toggled
- Every CC fullscreen feature matched or surpassed
- Popovers, content filtering, semantic selection go beyond CC
- km adopts every feature with concrete UX improvements
- aichat demo showcases everything
- Every feature — new and existing — has a home on silvery.dev

