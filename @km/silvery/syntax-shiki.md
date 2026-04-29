---
id: "@km/silvery/syntax-shiki"
aliases:
  - km-silvery.syntax-shiki
  - km-silvery-syntax-shiki
created_by: claude:cd034ca4
created_at: 2026-04-26T18:52:48Z
closed_at: 2026-04-26T23:19:05Z
close_reason: Closed
started_at: 2026-04-26T22:12:23Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvery.syntax-shiki
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-26T11:53:06Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [x] silvery <Code> via shiki — wire installed shiki packages behind silvercode SyntaxHighlighter @km/silvery #feature #P2 @claude:cd034ca4

blocks:: [[@km/silvery]]

Wire shiki for syntax highlighting; supersedes the tree-sitter-WASM bead.

## Why shiki
- Already installed (@shikijs/core, engine-javascript, engine-oniguruma, langs, themes — pulled via VitePress for silvery's docs)
- ANSI output mode for terminal rendering
- VS Code TextMate grammars (~99% accuracy)
- Lazy-load ~50-200 KB per language vs tree-sitter's 1-2 MB WASM per language
- No documented OOM class (tree-sitter had OOM in Claude Code 2.1.47-2.1.50, ~120 GB RAM)
- Multi-target — same library does TUI ANSI + future browser HTML
- silvercode SyntaxHighlighter.tsx already comments 'Shiki-backed @silvery/syntax is the target implementation'

## Scope
1. Create @silvery/syntax (or inline into ag-react) — thin wrapper over shiki: highlight(code, lang, themeName) → ANSI string OR styled spans for native rendering
2. Map shiki theme tokens to silvery color slots ($color0..$color15 for ANSI 16-color terminals, $primary/$muted/etc. semantic for richer themes)
3. Lazy-load grammars on demand (per-language); cache by lang
4. Update silvercode/src/components/SyntaxHighlighter.tsx to use shiki when language is detected
5. Tests: shipped grammars produce expected highlighting; ANSI output is renderable; lazy-load doesn't block

## Defer
- Folding by AST node — not a shiki feature; would need lezer
- Outline view — same
- Selection expansion — same
- These remain candidates for a future @km/silvery/code-lezer bead if/when AST features land

## Acceptance
- bun add not needed (shiki already installed)
- highlight('const x = 1', 'typescript', 'github-dark') returns ANSI-colored string
- silvercode renders fenced code blocks with shiki highlighting (verify in storybook)
- Tests pass; bundle size doesn't grow (shiki was already in dep tree)