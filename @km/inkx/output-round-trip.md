---
id: "@km/inkx/output-round-trip"
aliases:
  - km-inkx.output-round-trip
  - km-inkx-output-round-trip
created_by: claude:23485adf
created_at: 2026-02-24T11:03:21Z
closed_at: 2026-03-04T16:23:38Z
owner: bjorn@stabell.org
---

# [x] Output-level testing: parse ANSI output back to buffer and compare @km/inkx #feature #P2

Current INKX_STRICT only validates buffer contents (incremental vs fresh). It does NOT test the output phase — the ANSI string that actually goes to stdout.

The garbled rendering bugs (textSizing cursor divergence, grey line artifact) all happen in the untested layer between buffer and terminal:
  Buffer (tested) → Output Phase ANSI → stdout → Terminal (NOT tested)

Proposed: an output round-trip test that:
1. Runs the output phase to generate ANSI string
2. Parses the ANSI string back into a virtual terminal buffer (using a VT parser)
3. Compares that parsed buffer against the source TerminalBuffer cell-by-cell

This catches: cursor positioning errors, background color leaks from \x1b[K, style reset gaps before newlines, OSC 66 width mismatches, synchronized update interference.

Could be a new INKX_STRICT level or separate env var (INKX_OUTPUT_STRICT).

Key files:
- vendor/beorn-inkx/src/pipeline/output-phase.ts — generates ANSI
- vendor/beorn-inkx/src/scheduler.ts — wraps in SYNC_BEGIN/END
- vendor/beorn-inkx/src/buffer.ts — TerminalBuffer to compare against

Implementation approach:
- Add a lightweight VT parser (xterm state machine) that processes ANSI sequences and builds a cell grid
- After output phase, feed the ANSI string into the VT parser
- Compare resulting grid against the source buffer
- Report mismatches with row/col/expected/actual like INKX_STRICT does

Prior art: node-pty has a VT parser, xterm.js has one. Or write a minimal one that handles: cursor movement (CUP, CUF, CR, LF), SGR styles, erase (ED, EL), and character output.