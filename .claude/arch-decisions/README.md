# Arch Decisions

This directory archives `/arch` retros — one file per architectural decision.

## File naming

`YYYY-MM-DD-<topic-slug>.md` — e.g. `2026-04-30-path-vs-ulid-as-sqlite-pkey.md`.

## File format

Every retro must have:

- Frontmatter with `topic`, `date`, `verdict` (ADOPTED / REJECTED / DEFERRED / REVERSAL)
- A list of canonical docs the lead actually read (with line numbers, not just file paths)
- A list of close-reasons quoted verbatim
- A reversal check (does this verdict reverse prior framing?)
- Effort estimate (verified, not just from the arch agent's report)

See [.claude/skills/arch/SKILL.md](../skills/arch/SKILL.md) for the full template.

## How retros gate `/max`

`tools/check-arch-required.ts` reads this directory. When `/max` is invoked,
its Step 0 runs the drift-checker:

1. Scans changed paths for architectural triggers (identity / storage / loader / public-API / pipeline).
2. For each triggered topic, looks for a retro <7 days old whose `topic:` frontmatter or body matches.
3. If any topic is uncovered → exits 1 → `/max` aborts.

To unblock: run `/arch <topic>`, write a retro here, re-run.

## Retention

Retros are permanent record. Don't delete them — they document why the codebase
looks the way it does. Older retros (>30 days) drop out of the gate window
but stay readable as architectural context.
