# Batch Refactoring Tool - Spec

**Status:** MVP Complete + LLM Migration
**Bead:** km-batch
**Last Updated:** 2026-01-31

## Vision

A smart batch refactoring tool that:

1. Finds all occurrences of a pattern across **any text** (code, markdown, comments, notes)
2. Lets Claude review and score confidence for each match
3. Auto-applies high-confidence changes, asks about uncertain ones
4. Verifies the result

**Scope:** Works on all text files. Code gets bonus AST-aware support, but markdown/comments/notes are first-class citizens.

**Key insight:** LLMs can't use interactive TUI tools (ast-grep -i). Instead, we batch the search, let Claude analyze, present uncertain cases to user, then batch-apply.

## Goals

- [x] Faster than one-by-one LLM calls for large refactors
- [x] Smarter than blind find-replace (understands context)
- [x] Shareable as a Claude Code plugin
- [x] Works with ast-grep, MCP servers, and LSP tools

## Tools Landscape

### Text-Based (works on any file)

| Tool               | Status      | Strength                               |
| ------------------ | ----------- | -------------------------------------- |
| **ripgrep/Grep**   | ✅ Built-in | Fast text search with context          |
| **Fastmod** (Rust) | Consider    | Interactive regex replace, `e` to edit |
| **Repgrep (rgr)**  | Consider    | TUI for batch selection                |
| **rep**            | Consider    | Diff-first review pattern              |

### AST-Aware (code-specific bonus)

| Tool                        | Status        | Strength                               |
| --------------------------- | ------------- | -------------------------------------- |
| **ast-grep**                | ✅ Installed  | Structural patterns, tree-sitter based |
| **Comby**                   | Consider      | Language-agnostic structural matching  |
| **cclsp**                   | ✅ Installed  | LSP wrapper for type-safe operations   |
| **mcp-refactor-typescript** | ✅ Configured | Rename, move, organize imports         |

### Key Insight from Research

> "No refactoring tool guarantees behavior preservation. Your test suite does."

## Current Implementation

| Component               | Status        | Location                                  |
| ----------------------- | ------------- | ----------------------------------------- |
| ast-grep                | ✅ Installed  | `nix profile`                             |
| cclsp                   | ✅ Installed  | `bun global`                              |
| mcp-refactor-typescript | ✅ Configured | `.mcp.json`                               |
| /batch command          | ✅ Plugin     | `batch@tools`                |
| pattern.migrate         | ✅ Complete   | LLM-powered API migration                 |
| Confidence scoring      | 📝 Documented | In command instructions                   |
| Plugin packaging        | ✅ Complete   | `vendor/bearly/plugins/batch` |
| Marketplace             | ✅ Configured | `tools`                      |

### Installation

```bash
# Add marketplace (one-time)
claude plugin marketplace add /path/to/vendor/bearly

# Install plugin
claude plugin install batch@tools
```

## Architecture Options

### Option A: Skill Only (Current)

```
User → /batch skill → Claude interprets instructions → uses ast-grep + Edit
```

- **Pros:** Simple, works today, no code to maintain
- **Cons:** Re-interprets each time, slower, can't share easily

### Option B: MCP Server + Skill

```
User → /batch skill → MCP server (search/apply) → Claude (analyze/decide)
```

- **Pros:** Fast operations, stateful, programmatic
- **Cons:** More code to maintain

### Option C: Plugin (Recommended for Sharing)

```
batch-plugin/
├── .claude-plugin/plugin.json    # Manifest
├── commands/batch.md             # User-facing skill
├── .mcp.json                     # MCP server config
└── servers/batch-server.ts       # Heavy operations
```

- **Pros:** Shareable via marketplace, versioned, namespaced
- **Cons:** More structure to set up

## UX Patterns (from research)

### Pattern A: Sequential Prompts (codemod/fastmod)

```
Show one match → y/n/e/q → next match → ...
```

- **Pros:** Simple, careful consideration per change
- **Cons:** Tedious for 100+ matches

### Pattern B: Batch Multi-Select (repgrep)

```
Show ALL matches in TUI → toggle selection → apply selected
```

- **Pros:** Overview of all changes, quick selection
- **Cons:** Needs TUI, harder to show full context

### Pattern C: Diff-First Review (rep)

```
Generate unified diff of ALL changes → user reviews → apply if OK
```

- **Pros:** Familiar diff format, can use external tools
- **Cons:** All-or-nothing (no per-match selection)

### Pattern D: Confidence-Based Auto (our approach)

```
Claude scores each → auto-apply HIGH → ask about MEDIUM → skip LOW
```

- **Pros:** Leverages AI judgment, minimal user decisions
- **Cons:** Trust threshold, may need tuning

### Hybrid Approach (Recommended)

Combine D + C: Claude scores and categorizes, then present uncertain ones as a diff for review.

## Workflow Design

### Core Flow

```
1. SEARCH    → ripgrep (text) or ast-grep (code) → structured matches
2. ANALYZE   → Claude scores each: HIGH/MEDIUM/LOW confidence
3. REVIEW    → Present MEDIUM to user via AskUserQuestion
4. APPLY     → Edit tool for approved changes
5. VERIFY    → bun fix + tsc (for code), or just lint (for text)
```

**Search tool selection:**

- `.md`, `.txt`, comments → ripgrep (text-based)
- `.ts`, `.tsx`, `.js` → ast-grep (AST-aware) or ripgrep
- User can force either with `--mode text|ast`

### Confidence Scoring

| Confidence | Criteria                                   | Action     |
| ---------- | ------------------------------------------ | ---------- |
| HIGH       | Code context (call site, import, type ref) | Auto-apply |
| MEDIUM     | String, comment, or ambiguous              | Ask user   |
| LOW        | Partial match, different meaning           | Skip       |

### Example Session

```
/batch rename "createRepo" "createRepo" --glob "packages/**/*.ts"

Found 47 matches across 12 files.
- HIGH (auto-apply): 38
- MEDIUM (review): 7
- LOW (skip): 2

[AskUserQuestion for 7 MEDIUM matches]

Applied 43 (38 auto + 5 approved)
Skipped 4 (2 low + 2 rejected)
Verification: PASSED
```

## Plugin Structure (Current)

```
vendor/bearly/
├── .claude-plugin/
│   └── marketplace.json       # Marketplace manifest
└── plugins/
    └── batch/
        ├── .claude-plugin/
        │   └── plugin.json    # Plugin manifest
        ├── commands/
        │   └── batch.md       # Main /batch command
        └── README.md
```

**Installation:**

```bash
# Add marketplace (one-time)
claude plugin marketplace add github:beorn/tools

# Install plugin
claude plugin install batch@tools
```

## Data Structures & Export Formats

### Internal Representation

```typescript
interface RefactorMatch {
  file: string
  line: number
  column: number
  endLine: number
  endColumn: number
  matchText: string
  contextBefore: string[] // 3-5 lines
  contextAfter: string[]
  confidence: "high" | "medium" | "low"
  reason: string
  selected: boolean
}

interface RefactorPlan {
  pattern: string
  replacement: string
  matches: RefactorMatch[]
  stats: { high: number; medium: number; low: number }
}
```

### Export Formats

**1. Unified Diff (--dry-run)**

```diff
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -45,3 +45,3 @@
-  const repo = createRepo(path)
+  const repo = createRepo(path)
```

- Human readable, can be reviewed externally
- Apply with `git apply` or `patch`

**2. JSON Edits (--json)**

```json
{
  "changes": {
    "src/foo.ts": [
      {
        "range": {
          "start": { "line": 45, "character": 16 },
          "end": { "line": 45, "character": 27 }
        },
        "newText": "createRepo"
      }
    ]
  }
}
```

- Machine readable (LSP WorkspaceEdit format)
- Good for programmatic workflows

**3. Branch/PR Export**

- Apply changes to a new branch
- Create PR for team review
- Integrates with normal code review flow

## Open Questions

1. **State persistence:** Should matches persist between `/batch search` and `/batch apply`?
   - Option: Store in temp file, reference by session ID
   - Option: Single-command workflow only

2. **Dry run mode:** Show diffs without applying?
   - Could use ast-grep's output formatting
   - Or generate unified diff (like `rep` tool)

3. **Git integration:** Auto-stage changed files? Create atomic commits?
   - Could leverage `git add -p` mechanics for hunk selection

4. **Undo support:** Track changes for rollback?
   - Could generate reverse diff automatically

5. **Large result sets:** What if 500+ matches? Pagination? Sampling?
   - Group by file for better overview
   - Show summary first, drill down on request

6. **Editor escape hatch:** Should we support `$EDITOR` for manual tweaks?
   - Fastmod has `e` key to open occurrence in editor
   - Useful when automated replacement isn't quite right

7. **Incremental verification:** Apply + test in chunks?
   - Safer but slower
   - Could be optional `--incremental` flag

8. **Export workflow:** Should we support exporting to PR/branch?
   - Generate changes on a branch
   - Let team review via normal code review

## Feedback & Ideas

<!-- Add your ideas here -->

### From initial discussion:

- Threshold-based auto (HIGH auto-apply, MEDIUM ask, LOW skip)
- Want to preview ALL changes at once, not one-by-one
- Should be packagable/shareable as Claude Code plugin

### From ChatGPT research (2026-01-26):

- Consider **Comby** for language-agnostic structural matching
- **Unified diff as interchange format** - familiar, tool-friendly
- **$EDITOR escape hatch** - let user manually tweak individual matches
- **Batch list TUI** (repgrep style) - show all matches, toggle selection
- **WorkspaceEdit JSON format** - machine-readable edit representation
- Tests are the source of truth: "No refactoring tool guarantees behavior preservation"
- Incremental apply + test pattern for extra safety

### Implemented (2026-01-31):

- **LLM-powered API migration** (`pattern.migrate`): For complex API migrations where transformations require context awareness (e.g., adding `await`, changing destructuring patterns, value mapping). Uses ripgrep to find patterns, sends matches with context to LLM in one call, generates editset.

### Future ideas:

- Integration with PR review workflow (export to branch)
- Learn from user selections to improve confidence scoring
- Support for multi-step refactors (rename A→B, then update callers)
- `--test` flag to auto-run test suite after apply
- Bisect which change broke tests (advanced)

## References

- [ast-grep docs](https://ast-grep.github.io/)
- [Claude Code plugins](https://code.claude.com/docs/en/plugins.md)
- [mcp-refactor-typescript](https://github.com/stefan-nitu/mcp-refactor-typescript)
- Plugin repo: [beorn/tools](https://github.com/beorn/tools)
- Plugin command: `vendor/bearly/plugins/batch/commands/batch.md`
