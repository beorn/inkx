---
id: "@km/bearly/llm-judge-history"
aliases:
  - km-bearly.llm-judge-history
  - km-bearly-llm-judge-history
created_by: claude:2405c72e
created_at: 2026-04-27T17:37:08Z
closed_at: 2026-04-27T17:50:49Z
close_reason: "Implemented `bun llm pro --judge-history [--limit N] [--quick]
  [--apply]`. Dual fix: (1) appendAbProLog now stores response content inline
  per-leg, eliminating /tmp file lifetime dependency for future entries; (2)
  retroactive judging script tolerates v1+v2 entry shapes. Real-world result on
  user's 239-entry ab-pro.jsonl: 11 eligible, 10 successfully scored at $0.0087
  total. Leaderboard now shows real signal — gpt-5.4-pro ranks negative (-0.40)
  under cost-aware weighting due to 56% failure rate and $1.18/call cost;
  gemini-3-pro-preview dominates at rank 17.98. Commit: vendor/bearly 8fd0e31;
  km parent 2b1a93459. 104 llm tests pass."
owner: bjorn@stabell.org
---

# [x] Retroactive judge scoring for historical ab-pro.jsonl entries (where output files survived) @km/bearly #feature #P2

## Why

User's 239 historical ab-pro.jsonl entries have NO judge scores (judge was added 0.2.0). Without scores, --leaderboard shows avgScore: 0.00 and --promote-review can never identify candidates. Fresh-fired calls now get scored, but the historical data is dark.

## What's possible

ab-pro.jsonl persists \`outputFile\` (path to /tmp/llm-*.txt with combined response). 
- Recent entries (~last 7 days): content file still exists on disk → can retroactively judge
- Older entries: content file auto-cleaned → cannot retroactively judge without re-firing

Empirical check: 23/50 of the most recent entries have files alive (~46%).

## Goal

\`bun llm pro --judge-history [--limit N] [--quick] [--apply]\`:

1. Read ab-pro.jsonl
2. Filter entries where \`!entry.judge\` AND \`fs.existsSync(entry.outputFile)\` AND entries have at least 2 legs with content
3. Read outputFile, parse per-leg sections (markdown headers like \`## GPT-5.4 Pro\` / \`## Kimi K2.6\`)
4. Build judge prompt via existing \`buildJudgePrompt(...)\` 
5. Fire judge in parallel batches (5 concurrent, gpt-5-nano if --quick else gpt-5-mini)
6. Append augmented entry to ab-pro.jsonl with \`schema: "ab-pro/v2-judge-augment"\` and \`derivedFrom: <queryHash>\` linking to the original
7. Update buildLeaderboard to merge augment entries with their originals (lookup by queryHash)

\`--apply\` mode: rewrite ab-pro.jsonl in place with judge data merged into original entries (with .bak backup). \`--apply\` is the destructive path; default is the additive sidecar.

## Cost estimate

239 entries × ~46% recoverable = ~110 candidates × \$0.001 (gpt-5-mini judge) = ~\$0.10 total. Cheap.

## Acceptance

- New CLI subcommand \`bun llm pro --judge-history\`
- Honors \`--limit N\` (test on small subset first)
- \`--quick\` uses gpt-5-nano judge
- \`--apply\` rewrites in place with backup
- Tests cover: parse outputFile sections, skip entries without alive files, handle parse failures gracefully
- README documents retention semantics ("retroactive judging only works while /tmp/llm-*.txt files are alive — 7 days by default")

## Long-term: prevent this from happening again

Add to backlog: store response content INLINE in ab-pro.jsonl (compressed) rather than relying on /tmp file persistence. ~3KB per response × 1000 entries = 3MB ab-pro.jsonl. Acceptable. Eliminates the 7-day decay problem.