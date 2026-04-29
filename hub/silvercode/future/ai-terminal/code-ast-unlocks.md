# Code AST Unlocks — Opportunities for Silvercode

**Status**: 2026-04-26 design doc. Not implementation. Captures the unlock-tree from "we have an AST" so we can sequence investment.

## Why this doc

silvercode today renders AI chat output as text (with a regex syntax highlighter wrapper). When we eventually add AST-level capability, an entire class of agent unlocks becomes available — most of them invisible until you look. This doc maps the space, names the libraries, and proposes a phased adoption.

## The three AST layers

Conflating these is the most common pitfall. They have different libraries, different cost profiles, and different unlock surfaces.

| Layer | Question it answers | Today's tooling | Future direction |
|:--|---|---|---|
| **Refactoring AST** | "How do I mutate code while preserving semantics?" | ts-morph (TS/JS, full type info) + ast-grep (multi-lang, tree-sitter under the hood) + ripgrep + jscodeshift via `vendor/bearly/tools/refactor.ts` and `scripts/codemod.ts` | Stays as-is. Mature, multi-backend, editset-based. |
| **Rendering AST** | "How do I display code with structure visible?" | silvercode `SyntaxHighlighter.tsx` (regex keywords v0) + planned shiki v1 | shiki for tokens, lezer if folding / outline become load-bearing |
| **Understanding AST** | "How does the agent retrieve, summarize, and reason about code?" | None | serena-style MCP, aider-style repo-map, AST-anchored memory |

Lezer's elegance lives in the **rendering** layer; ts-morph + ast-grep cover **refactoring** completely; the **understanding** layer is currently empty and is where the highest agent leverage sits.

## Existing infrastructure (ground truth)

### Refactoring layer (mature)
- **`vendor/bearly/tools/refactor.ts`** — multi-backend codemod CLI with editset workflow (propose → select → apply with checksums)
  - ts-morph backend: `symbol.at`, `refs.list`, `symbols.find`, `rename.propose`, `rename.batch`
  - ast-grep backend: `pattern.find`, `pattern.replace` for Go/Rust/Python/JSON/YAML
  - ripgrep backend: text patterns for any file
  - wikilink / package-json / tsconfig backends: cross-format ref tracking
- **`scripts/codemod.ts`** — jscodeshift runner for legacy transforms
- **`docs/future/batch-refactor-spec.md`** — design doc for batch operations

### Rendering layer (v0)
- **`apps/silvercode/src/components/SyntaxHighlighter.tsx`** — keyword-based regex highlighter; explicit comment "Shiki-backed `@silvery/syntax` is the target implementation"
- **`apps/silvercode/src/components/MarkdownView.tsx`** — consumer
- **shiki packages already in dep tree** via VitePress: `@shikijs/core`, `@shikijs/engine-javascript`, `@shikijs/engine-oniguruma`, `@shikijs/langs`, `@shikijs/themes`

### Understanding layer (empty)
- No semantic index, no symbol graph, no retrieval pipeline beyond raw grep / file-read tools.
- Agents discover code by file-listing + grep, which is brittle and expensive on token budget.

## Library landscape

| Library | Category | Strengths | Where it fits |
|---|---|---|---|
| **shiki** | Tokenizer | VS Code TextMate grammars, ANSI output mode, ~50 KB per language, browser-friendly. Already installed. | Rendering — highlight code blocks in chat. |
| **lezer** | Incremental parser | Pure JS/TS, ~50-200 KB per grammar, yieldable parse, GC-safe, CodeMirror ecosystem. | Rendering — when folding / outline / selection-expand become real. |
| **tree-sitter** | Incremental parser | C/Rust core, multi-language pool, used by Helix/Zed/Neovim/GitHub. WASM has documented OOM class. | Avoid for in-process TUI. ast-grep's transitive use as a CLI is fine. |
| **ts-morph** | Type-aware AST | TypeScript compiler API wrapper. Full type info. Heavy startup. | Refactoring — TS/JS rename, structural transforms. Already used. |
| **ast-grep** | Pattern matcher | Rust CLI on tree-sitter grammars, multi-language structural search/replace. | Refactoring — non-TS languages. Already used. |
| **highlight.js** | Tokenizer | All languages in one bundle (~50 KB total), regex-based, ~85% accuracy. | Fallback if shiki proves too heavy. |
| **jscodeshift** | Codemod runner | Legacy ESTree transforms, broad ecosystem of recipes. | Existing legacy paths. Not the future. |

## Tier 1 — agent context window optimization

Highest leverage. AI quality scales with relevant context per token.

| Use | What it enables |
|---|---|
| Outline-as-context | Feed AI file outline (~50 lines) instead of full file (~1000 lines). 20× token reduction with no relevance loss for "modify function X." |
| Function-grained retrieval | RAG keyed by symbol, not by text similarity. "Edit `auth.signIn`" → exact AST lookup. |
| Selective body expansion | AI calls `expandFunction(name)` as a tool; only relevant bodies materialize in the prompt. IDE-like navigation, not blind grep. |
| Structural diffs | Tell AI "function `signIn` changed signature; function `validateToken` added," not "lines 14-22 changed." Smaller, more meaningful diffs. |
| AST-anchored memory | Persistent memory keyed by `(file, symbol-path)` instead of `(file, line-number)`. Survives line drift — kills 80% of stale-memory bugs in agent recall. |

**Ref**: aider's repo-map is the canonical implementation of this pattern. Uses tree-sitter to build a token-budget-aware summary of the entire codebase.

## Tier 2 — refactoring as a deterministic tool

| Use | Today's path |
|---|---|
| Rename symbol | `bun vendor/bearly/tools/refactor.ts rename.propose` |
| Cross-file rename | Same |
| Move file | `wikilink` backend already handles import path updates |
| Change function signature | ts-morph identifies all call sites |
| Inline / extract | ts-morph (manual scripting today) |
| Structural codemods | ast-grep `pattern.replace` |

The pattern: **AI describes intent, AST-aware tool executes precisely.** This is already partly real via `vendor/bearly/tools/refactor.ts`. The gap is exposing it as MCP tools so an AI can call `rename`, `extract_function`, `inline_variable` directly.

**Future bead candidate**: `km-bearly.refactor-mcp` — wrap `vendor/bearly/tools/refactor.ts` as an MCP server so silvercode-attached agents call rename/refs/symbols-find as named tools.

## Tier 3 — structural search + understanding

| Use | Library |
|---|---|
| Find-references | ts-morph (TS/JS) or ast-grep (other) |
| Goto-definition | ts-morph |
| Symbol graph extraction | ts-morph + custom traversal |
| Structural search ("functions named handle\* that take 3+ args") | ast-grep |
| Type relationship view | ts-morph |
| Module dependency graph | wikilink + ts-morph imports |

Already mostly buildable from existing tooling. Missing: a **persistent index** so queries are O(log n) instead of O(n) per call.

## Tier 4 — editing affordances (rendering layer)

When silvercode adds editor surface:

| Use | Library |
|---|---|
| Selection expansion (Helix-style) | lezer |
| Smart fold by AST | lezer |
| Indent on newline | lezer |
| Bracket matching | lezer |
| Comment toggle (lang-aware) | lezer |
| Move statement up/down | lezer |
| Multi-cursor at all matching pattern | lezer + ast-grep |

This is the **future-web target** territory — when silvery's canvas / DOM target lands, embedded code editing becomes a concrete need. Lezer's CodeMirror-ecosystem fit makes it the right call here.

## Tier 5 — agent observability & safety

| Use | What it prevents |
|---|---|
| AST-pattern lints | "Never call `setTimeout` in a render function" — custom rules at AST precision |
| Diff-aware review | `/review` focuses on changed AST regions, not "every line in the diff" |
| Privacy filters | Redact sensitive AST regions (config, env-loading) before sending to remote LLM |
| Tool-call validation | When AI invokes Edit, validate the patch hits a real AST node before applying — catches "edit drifted because line numbers shifted" |
| Patch-by-function | AI emits "replace function `foo`" → tool finds AST node, replaces only that subtree. No partial-overlap risk. |
| Test-selection from changed AST | Changed function → run tests that exercise it via call graph. 10× test-loop speedup. |
| Code complexity tracking | Cyclomatic, AST depth, fan-out per function — surface brittle areas without LLM judgment |

## Tier 6 — agent memory specifically

| Use | Library |
|---|---|
| Symbol-anchored bookmarks | Anchored to `(file, symbol-path)` not `(file, line)` |
| Failure-pattern memory | "Last touch of `cleanup` in `PaneGrid.tsx` broke focus dispatch" |
| Recency per symbol | Last-edited timestamp per AST node |
| Annotation per AST node | Persistent notes attached to functions, surfaced when agent works in that area |

This is where **bd memory + AST anchors** would compose into something genuinely new. Today km bd memories are file/line-anchored; AST anchors would survive renames + reformats automatically.

## Tier 7 — compositional unlocks

These compose multiple tiers:
- "Refactor all callers of `oldApi.foo` to `newApi.bar`" — Tier 2 + Tier 3
- "Generate a test for every exported function in this module" — Tier 1 + Tier 2 + Tier 5
- "Show me functions that call `db.query` without awaiting" — Tier 3 + Tier 5
- "Migrate this codebase from Promises to async/await" — Tier 2 + Tier 3 codemod
- "What's the blast radius of changing the `Scope` type?" — Tier 3 + Tier 6 graph traversal

## MCP / ACP / extension landscape

What's gaining traction in the agentic-coding space (2025).

### MCP servers worth tracking

| Project | What | Status |
|---|---|---|
| **serena** (`oraios/serena`) | LSP-backed MCP server; exposes `find_symbol`, `find_referencing_symbols`, `replace_symbol_body`, `insert_after_symbol`, `insert_before_symbol`. Multi-language via LSP. | Popular. Closest existing thing to what we'd build for Tier 2-3. |
| **aider's repo-map** | Tree-sitter-based codebase summary with token-budget awareness. Not an MCP, but the canonical pattern for Tier 1 outline-as-context. | Influential. Worth porting the pattern. |
| **mcp-language-server** (community variants) | Wraps language servers as MCP tools. | Emerging. |
| **codemcp** / similar | Editing primitives as MCP tools (apply patches, write files). | Many variants. |
| **Sourcegraph Cody / src-cli** | Structural search via Sourcegraph indexing (also tree-sitter-based). | Established. |

### ACP-side reality

ACP v1 has no AST primitives. The `ToolCall.kind = "search"` could in principle be backed by AST search, but the protocol doesn't define semantic search semantics. Each agent (codex, gemini, claude) builds internal AST tools and exposes them as opaque tool calls.

### Browser / IDE extensions

- **Cursor** indexes via embeddings + custom retrieval; some AST awareness internally.
- **Continue.dev** uses tree-sitter for code chunking + retrieval.
- **Cody** uses Sourcegraph's structural search.

### Pattern that's emerging

The high-leverage pattern across the ecosystem: **AST-aware retrieval as an MCP server**. serena is the leading reference implementation. Aider-repo-map is the leading non-MCP implementation. silvercode's path: implement the pattern internally first (since silvercode owns the agent harness) and optionally publish as an MCP server later.

## Recommended phased adoption

### Phase R0 — already done
- Refactoring infra: `vendor/bearly/tools/refactor.ts` with ts-morph + ast-grep + ripgrep.
- Rendering v0: regex `SyntaxHighlighter.tsx`.

### Phase R1 — chat-rendering polish (next, low-risk)
- Wire shiki behind `SyntaxHighlighter.tsx`. Bead `km-silvery.syntax-shiki` already created.
- Cost: ~200-400 LOC. Bundle: zero (shiki already installed).
- Value: ~99% highlighting accuracy in chat output.

### Phase U1 — understanding layer foundation
- Wrap `vendor/bearly/tools/refactor.ts` as an MCP server. Expose ts-morph and ast-grep as MCP tools. Bead candidate: `km-bearly.refactor-mcp`.
- Add an outline-as-context tool: given a file, return signatures + docstrings as a compact summary.
- Add symbol-anchored bd memory: extend `km bd remember` to accept `--anchor file.ts:functionName`.
- Cost: ~1000-1500 LOC. Value: agents call rename/refs/outline as named tools instead of grepping.

### Phase R2 — only if editor surface lands
- Embed lezer for selection-expand, fold-by-AST, indent-on-newline. Bead candidate: `km-silvery.code-lezer`.
- Cost: ~600-1000 LOC.
- Value: real editor primitive in silvery. Loads-bearing only when web/canvas target arrives.

### Phase U2 — repo-map and graph queries
- Port aider's repo-map pattern: token-budget-aware codebase summary. Use ast-grep for the multi-language case, ts-morph for TS-aware refinement.
- Add call graph + dependency graph queries.
- Cost: ~1500-2000 LOC.
- Value: AI can answer "what's the blast radius of changing X?" deterministically.

## Anti-patterns to avoid

1. **Adopting tree-sitter WASM in-process.** Documented OOM class in Claude Code 2.1.47-2.1.50. ast-grep's CLI use is fine; embedding tree-sitter as a JS lib is not.
2. **Building a fourth refactoring backend.** ts-morph + ast-grep + ripgrep already cover the space. Lezer would not add value here.
3. **Conflating rendering AST with refactoring AST.** Different libraries, different runtimes, different ergonomics. Keep them separate in beads.
4. **Shipping AST features without persistent index.** Per-query traversal of a 100k-LOC repo is slow. Build the index once, query O(log n).
5. **Building "another LSP."** LSPs exist; serena wraps them. Reuse, don't reimplement.

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-26 | Defer tree-sitter; adopt shiki for rendering | Already installed; ANSI mode; no OOM history; lighter than tree-sitter WASM. |
| 2026-04-26 | Lezer is the future for AST features (not tree-sitter) | Pure JS/TS, GC-safe, CodeMirror ecosystem; same architectural unlocks; better fit for silvery's web-target stance. |
| 2026-04-26 | Refactoring layer stays on ts-morph + ast-grep | Mature; lezer adds nothing; ts-morph has type info that lezer/tree-sitter don't. |
| 2026-04-26 | Understanding layer is the highest-leverage missing piece | Refactoring covered; rendering imminent (shiki); understanding empty and is where AI quality multipliers live. |

## Open questions

- Should we build our own outline-as-context tool, or vendor aider's repo-map approach?
- Should refactor.ts MCP wrap the existing CLI, or rewrite as an in-process JS library? (CLI wrap is faster to ship; in-process is faster to call.)
- For symbol-anchored memory, which symbol-path representation? (`file.ts::namespace::Class.method` vs JSON path vs TS symbol declaration ID.)
- Should we publish the refactor.ts MCP server publicly (community use) or keep silvercode-internal?

## Related beads

- `km-silvery.syntax-shiki` (P2) — Phase R1
- `km-silvery.diff-code-accordion` (Phase 1 shipped, Phase 2 superseded by syntax-shiki)
- `km-silvery.code-tree-sitter` (closed, superseded)
- `km-silvercode.acp` — ACP integration tracking; AST work attaches downstream
- TODO bead — `km-bearly.refactor-mcp` (Phase U1)
- TODO bead — `km-silvery.code-lezer` (Phase R2 — defer)
- TODO bead — `km-silvercode.repo-map` or `km-bearly.repo-map` (Phase U2)
