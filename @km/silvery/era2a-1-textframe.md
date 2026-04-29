---
id: "@km/silvery/era2a-1-textframe"
aliases:
  - km-silvery.era2a-1-textframe
  - km-silvery-era2a-1-textframe
created_by: claude:fed8de9e
created_at: 2026-03-25T03:51:40Z
closed_at: 2026-03-25T05:40:40Z
close_reason: "Phase 1 complete: createTextFrame() snapshot factory,
  cellToFrameCell(), FrameCell convergence (underlineColor + UnderlineStyle),
  App implements TextFrame structurally, 25 tests, CLAUDE.md updated. All
  /complete criteria met."
---

# [x] Era2a Phase 1: TextFrame — immutable snapshot from buffer @km/silvery #task #P1 @claude:fed8de9e

Extract immutable TextFrame type + converge cell types + wire App.

## Core: TextFrame snapshot factory (DONE)
- ag/src/text-frame.ts — TextFrame + FrameCell types (existed, updated FrameCell for convergence)
- ag-term/src/buffer.ts — createTextFrame(buffer): immutable snapshot via clone + lazy text/ansi
- FrameCell: added underlineColor, normalized underline to UnderlineStyle (matches termless Cell)

## Consumer wiring
- App implements TextFrame structurally (text, ansi, lines, width, height, cell, containsText)
- Export createTextFrame from ag-term barrel
- BoundTerm.cell() stays as Cell (semi-internal; FrameCell via App.cell())

## What deferred to Phase 2
- TermScreen → TextFrame: depends on term.paint() storing TextFrame as term.screen
- term.screen type change: requires termless adapter or convergence
- toAnsi(frame) standalone function: Phase 2 when paint uses it

## Delete
- Remove lastFrame/lastBuffer/lastFrameText from App public interface (internal only)

## /complete
- createTextFrame() exists and is exported
- App structurally matches TextFrame (text, ansi, lines, width, height, cell, containsText)
- FrameCell has underlineColor + UnderlineStyle (matches termless Cell)
- Docs/examples updated. CLAUDE.md updated if needed.