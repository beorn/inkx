---
mentions:
  - km
id: "@km/silvery/code-tree-sitter"
aliases:
  - km-silvery.code-tree-sitter
  - km-silvery-code-tree-sitter
created_by: claude:cd034ca4
created_at: 2026-04-26T16:27:48Z
closed_at: 2026-04-26T18:53:17Z
close_reason: "SUPERSEDED by km-silvery.syntax-shiki. Per /big analysis: shiki
  already installed in dep tree, silvercode SyntaxHighlighter already roadmapped
  to shiki, tree-sitter WASM has documented OOM history in Claude Code
  2.1.47-2.1.50 (~120 GB RAM). Closing forced because the open parent bead
  km-silvery.diff-code-accordion (Phase 1 already shipped) is unrelated to the
  highlighting choice — Phase 1 was Accordion+LineNumber+Diff, no parser
  dependency."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.code-tree-sitter
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-26T09:27:52Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvery.code-tree-sitter
    depends_on_id: km-silvery.diff-code-accordion
    type: blocks
    created_at: 2026-04-26T09:27:52Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery
      - type: link
        target: km-silvery.diff-code-accordion
---

# [x] silvery <Code> + tree-sitter highlighting pipeline (split from diff-code-accordion) @km/silvery #feature #P2

blocks:: [[@km/silvery]], [[@km/silvery/diff-code-accordion]]

Tree-sitter integration for the <Code> component. Heavy enough to deserve its own bead — the parent @km/silvery/diff-code-accordion ships Accordion / LineNumber / basic Diff first.

## Scope

- WASM grammar loading (tree-sitter-typescript, tree-sitter-javascript, tree-sitter-python, tree-sitter-rust at minimum)
- Highlight-query → silvery theme token mapping
- Async loading: first paint with raw text, refine after grammar loads
- Memoization across renders (don't reparse unchanged source)
- <Code> primitive consuming the highlighter
- Tests for grammar coverage + token mapping

Blocks the highlighting layer of <Diff> (which ships unhighlighted at v0).

## Estimated LOC: ~600-1000

