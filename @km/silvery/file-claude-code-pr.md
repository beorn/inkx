---
mentions:
  - km
id: "@km/silvery/file-claude-code-pr"
aliases:
  - km-silvery.file-claude-code-pr
  - km-silvery-file-claude-code-pr
created_by: Bjørn Stabell
created_at: 2026-04-09T20:36:44Z
closed_at: 2026-04-09T21:25:01Z
owner: bjorn@stabell.org
---

# [x] File PR comment on anthropics/claude-code#41965 — silvery inline incremental rendering as existence proof (REQUIRES USER APPROVAL) @km/silvery #task #P2

Sub-bead of @km/silvery/positioning. File a technical comment (not a PR) on the Claude Code scrollback regression issue explaining silvery's architectural approach to the 'unfixable' sub-problem, at a conceptual level, WITHOUT linking to source code.

## DO NOT FILE WITHOUT EXPLICIT USER APPROVAL

Gated on user review. Requirements:

1. User reviews full draft word-by-word
2. User approves tone (technical, collegial, no sales)
3. User confirms NO source code links
4. User confirms architectural description is accurate
5. User explicitly says 'file it'

## Link policy

**ALLOWED**:

- silvery.dev (marketing site, once)
- github.com/beorn/silvery (repo root, once, for attribution)
- A silvery demo or example page showing inline incremental updates in action (if one exists)
- chrislloyd's HN comment (as respectful reference to what we're responding to)

**FORBIDDEN**:

- Direct links to packages/ag-term/src/pipeline/output-phase.ts
- Direct links to tests/inline-mode.test.ts or tests/inline-output.bench.ts
- Any source code file paths
- Any line numbers
- Any commit SHAs
- Any code snippets or pseudocode

## Architectural explanation (to include at conceptual level)

The comment CAN and SHOULD explain WHY silvery can do this while Ink can't. The mechanism is public domain knowledge — explaining it does not leak silvery's implementation:

1. **Cell-level buffer** — silvery maintains a 2D grid of cells (char + fg + bg + attrs) as its internal representation. Ink's internal representation is a flat string.
2. **Layout-first pipeline** — layout runs BEFORE content render, so every cell has stable screen coordinates when it's painted. Ink renders the React tree to text and then lays out, so cell positions don't exist.
3. **Cell-level diff** — output phase compares prev vs next buffer cell-by-cell and emits only the changed cells. Ink's v7.0 incremental rendering compares lines of text; cell-level diff requires a buffer.
4. **Relative cursor addressing** — inline mode emits CSI NA / NB / CR / NC to navigate to changed cells without needing absolute row addressing. This is the unlock for working in inline/scrollback mode where you don't own the viewport.
5. **DEC mode 2026 bracketing** — each frame wrapped atomically to prevent tearing. (Ink 7.0 also does this.)

The FIRST FOUR are unique to silvery's architecture; the fifth is shared with Ink 7.0.

## Why Ink can't easily follow

The dependency chain: inline incremental updates need cell-level diff → cell-level diff needs a cell-level buffer → cell-level buffer needs layout-before-render. Ink is string-based all the way down, so retrofitting this is effectively rewriting the renderer. That's what Claude Code's Oct 2025 - Mar 2026 fork-and-rebuild effort was. Silvery was buffer-based from day 1.

## Comment draft (illustrative, subject to user edit)

Hey, TUI rendering engineer here on a different React-for-terminals project (silvery — silvery.dev). Wanted to share a reference point on the 'no way to incrementally update scrollback' part you mentioned on HN, in case it's useful as a design pointer.

Silvery supports incremental updates to inline/scrollback content — only changed cells are emitted, no full redraw, scrollback preserved. The mechanism is standard stuff once you have the right pipeline:

- Internal cell-level buffer (2D grid of cells, not a string)
- Layout-first rendering: positions are computed before content is painted, so each cell has stable screen coordinates
- Output phase diffs prev buffer vs next buffer at the cell level
- Inline mode uses relative cursor addressing (CSI NA/NB/CR/NC) so we can navigate to changed cells without owning the viewport
- DEC mode 2026 brackets each frame atomically (same as what you're already doing)

The first four are the hard parts of the architecture — they require a cell-level buffer, which in turn requires layout to run before content rendering. Ink's string-based pipeline can't easily retrofit this; I think that's what's behind chrislloyd's 'no way' comment on HN, and it matches what your custom renderer has been working on since October.

Not trying to pitch migration — just noting the sub-problem you described as unsolvable has been solvable in a differently-architected pipeline for a while. If any of it is useful as a reference point, the repo is at github.com/beorn/silvery. Happy to chat technical details if you'd like.

## Anti-patterns to avoid

- No 'use silvery instead'
- No 'Claude Code should adopt silvery'
- No criticism of their approach (acknowledge the difficulty + fork effort)
- No source code links
- No unverified numbers
- No architectural prescriptions

## Acceptance criteria

- [ ] User reviews full draft
- [ ] User approves tone
- [ ] User confirms no source links
- [ ] User confirms architecture description is accurate
- [ ] User says 'file it'
- [ ] Comment filed via gh CLI
- [ ] Comment URL recorded

## Parent

@km/silvery/positioning

