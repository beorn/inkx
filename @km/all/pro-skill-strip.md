---
mentions:
  - km
  - claude
id: "@km/all/pro-skill-strip"
aliases:
  - km-all.pro-skill-strip
  - km-all-pro-skill-strip
created_by: claude:2405c72e
created_at: 2026-04-27T06:59:19Z
closed_at: 2026-04-27T07:20:50Z
close_reason: "Stripped /pro, /deep, /ask SKILL.md files to lean decision
  tables. Deleted discover.md, review.md, triage.md, history.md (~460 LOC).
  Daily usage scenarios still work. Force-closed because dep
  km-bearly.llm-cli-json-output is intentionally future work that the skill
  cleanup was meant to predate. Commit: 1bf3f718a → cherry-picked to main
  4b583c870."
started_at: 2026-04-27T07:13:48Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-all.pro-skill-strip
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-26T23:59:27Z
    created_by: claude:2405c72e
    metadata: "{}"
  - issue_id: km-all.pro-skill-strip
    depends_on_id: km-bearly.llm-cli-json-output
    type: blocks
    created_at: 2026-04-26T23:59:27Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-all
      - type: link
        target: km-bearly.llm-cli-json-output
---

# [x] Strip /pro skill to decision table; move workflow to CLI subcommand @km/all #task #P2 @claude:2405c72e

blocks:: [[@km/all]], [[@km/bearly/llm-cli-json-output]]

## Problem

The /pro skill is ~600 lines across 5 files (SKILL.md, discover.md, review.md, triage.md, history.md, plus templates) describing a 7-step PM workflow:

1. Discovery & cost estimation (bash for-loops, wc/sed/grep)
2. User selection (numbers/ranges/all/unreviewed/stale)
3. Create tracking bead
4. Per-package review (3 concurrent fire-and-forget)
5. Triage (P0–P3 classification, per-finding bead creation)
6. Optional fix
7. Append to history.jsonl

This is too heavy for an AI-agent skill. Claude Code doesn't reliably remember state across turns; bash for-loops in markdown are fragile (path/quoting/platform); P0–P3 classification + bead-per-finding belongs in a dedicated tool, not in a skill that an LLM copy-pastes.

Daily usage of /pro is ~95% one of:

- `/pro "question"` — direct query
- `/pro review <package>` — single-package review

The 7-step workflow is for the rare "review round" case but bloats every invocation.

Discovered via /pro review of the llm tool (Kimi K2.6, 2026-04-26): findings 3.1, 3.2, 3.3, 3.5.

## Goal

Reduce /pro skill to ~80 lines structured as:

1. **Decision table at the top** (first 20 lines):
  ```
  User wants                    → Mode    → Command
  Quick answer                  → ask     → bun llm "..."
  Code review (fast, with code) → pro     → bun llm pro --context-file <f> "..."
  Code review (deep web search) → deep    → bun llm --deep --model gpt-5.4-pro ...
  Multi-model opinion poll      → opinion → bun llm opinion ...
  ```
2. **Brief context-gathering rules** (use --context-file not --context; full files not snippets)
3. **Brief recovery rules** (--no-recover for fresh; bun llm recover for incomplete deep)
4. Pointer to `bun llm pro --discover --json` for the rare review-round case

## Apply same pattern to /deep and /ask

- /deep is currently 195 lines. Strip to ~50 lines: decision rule + context-file pattern + recovery.
- /ask is currently 269 lines. Strip to ~70 lines: top-of-skill decision table + flags reference.

## Move out of skills

- discover.md bash for-loops → `bun llm pro --discover --json` CLI subcommand (uses the CLI's tokenizer + actual pricing). See @km/bearly/llm-cli-json-output.
- triage.md P0–P3 classification → either a separate review-tracker tool or deleted (manual triage is fine for daily use).
- history.md JSONL append → either a separate tool or `bun llm pro --append-history --json`.

## Depends on

- @km/bearly/llm-cli-json-output (P2) — for the --discover --json subcommand
- Optional: @km/bearly/llm-registry-split (P1) — capability flags make /pro skill simpler

## Acceptance

- /pro SKILL.md ≤ 100 lines, decision table at top
- /deep SKILL.md ≤ 70 lines
- /ask SKILL.md ≤ 100 lines
- discover.md / review.md / triage.md / history.md either deleted or moved into CLI subcommand
- Daily usage (single-package review, direct query) still works identically
- Review-round usage migrates to CLI subcommand or external tool

## Reference

Review at /tmp/llm-2405c72e-adversarial-review-of-the-292y.txt

