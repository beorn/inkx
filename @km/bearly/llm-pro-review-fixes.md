---
id: "@km/bearly/llm-pro-review-fixes"
aliases:
  - km-bearly.llm-pro-review-fixes
  - km-bearly-llm-pro-review-fixes
created_by: claude:2405c72e
created_at: 2026-04-27T14:59:47Z
closed_at: 2026-04-28T05:07:15Z
close_reason: "Work shipped via @bearly/llm 0.3.0 (commit c2f454c, 2026-04-27).
  Current version is 0.9.0 with cost: 1.0 default (overshoots ask of 0.5). 3 of
  4 original P1 items vindicated as false-positives by re-verification (see bead
  NOTES F1/F2/F3 + closure note). R3 (path leakage) spun out as
  km-bearly.llm-path-leakage. R2 (leaderboard cache) deferred per YAGNI."
started_at: 2026-04-28T05:05:04Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-bearly.llm-pro-review-fixes
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-27T08:00:00Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Pro-review fixes for @bearly/llm 0.2.0 — JSONC parser, cost weights, backtest determinism, leaderboard cache @km/bearly #epic #P1 @claude:cc081a9a

blocks:: [[@km/bearly]]

## Source

/pro review of dual-pro 3-leg framework, 2026-04-27. Real run: \$0.062 with leg A (GPT-5.4 Pro) failing, legs B (Kimi K2.6) + C (Gemini 3 Pro challenger) both delivering. Judge declared tie. The champion failure is itself a real-world validation that the champion-challenger framework degrades gracefully — but the reviewers flagged real issues.

Reviews at: \`/tmp/llm-2405c72e-adversarial-review-of-the-do23.txt\`

## Issues to fix (priority order)

### P1 — Critical (correctness / cost)

1. **JSONC parser is a regex landmine.** \`dual-pro.ts:loadConfig\` strips \`^\\s*\\/\\/.*\\$/gm\` then JSON.parse'es. A URL or path containing \`//\` inside a string value will get mangled and the parse will throw, bricking \`bun llm pro\`. Fix: switch to \`jsonc-parser\` (npm) OR drop comments and validate via Zod with helpful error messages.

2. **\`scoreWeights.cost: 0.0\` default — promotion ignores price.** A \$15/query model scoring 4.8 displaces a \$0.50 model scoring 4.6. Tied directly to the user's \$700-month spend. Fix: default to \`cost: 0.5\` (mild penalty) or \`cost-aware\` rubric option that normalizes score-per-dollar. Ship docs explaining how to tune.

3. **Backtest determinism broken.** \`pickNextChallenger\` reads global \`ab-pro.jsonl\` history, but \`sampleBacktestEntries\` reorders the sequence (stratified weighted). The challenger rotated into slot C during backtest is NOT the challenger that hit slot C in the live run being replayed. The \`winLossTie\` aggregate measures the wrong models against the wrong history. Fix: backtest must replay each entry's *original* leg-C model from the persisted \`c.model\` field; rotation logic only fires for live calls.

4. **O(N) leaderboard scan.** \`buildLeaderboard\` reads entire \`ab-pro.jsonl\` on every \`--leaderboard\` and every promotion check. At 10K entries that's 500ms-1s of blocking I/O per \`bun llm pro\` call. Fix: maintain rolled-up \`~/.claude/projects/<proj>/memory/leaderboard-state.json\` that updates after each call; bound the JSONL read to last N=500 lines for live promotion checks.

### P2 — Important (security / UX)

5. **Path leakage in \`file\` envelope field.** JSON stdout reveals \`/Users/<name>/...\` paths in CI logs. Fix: emit a hash-of-path or relativize-to-cwd by default; \`--full-paths\` flag for users who want the absolute path.

6. **Default 3-leg dispatch escalation.** Every \`bun llm pro\` now fires 3 models + judge. Existing automation paying \$0.50 per call before now pays \$5-15. Fix: either keep 3-leg as default but require \`--yes\` for first-time users, OR flip default to 2-leg and add \`--challenger\` opt-in. **NOTE**: Today's \$0.062 cost was much lower than estimate — the issue is variance, not the typical case. Worth measuring real distribution before defaulting to opt-in.

7. **Backtest cost confirmation gap.** \`--backtest\` defaults to N=30 (≈ \$200-400) but bypasses the per-call \$5 confirmation. Fix: aggregate-cost confirmation gate before any LLM call fires; \`--yes-i-am-sure\` flag for batch mode.

8. **Judge-on-failure waste.** When a leg returns an error string, the judge still fires and scores it 0 — burning judge tokens. Fix: short-circuit failed legs locally; only ask the judge to score legs that returned content.

### P3 — Future-proofing (will rot)

9. **Half-finished registry split.** \`research.ts:222\` still uses \`model.provider === "openai" && model.reasoning?.openaiEffort\` for the OpenAI-specific \`reasoning_effort\` API parameter. When Anthropic ships \`thinking_budget\` or Google ships \`search_depth\`, this becomes another provider-name hardcode. Fix: extend Capabilities to parameter mappings (e.g., \`capabilities.reasoningParam: { kind: "openai-effort" | "anthropic-budget" | ... }\`); dispatch translates generic \`reasoningLevel: "high"\` to provider payload.

10. **Singleton \`output-mode.ts\` non-reentrant.** Current design relies on process-level state; toxic for future parallel test runner or library embedding. Fix: scope output mode to a context object passed through the dispatch chain.

11. **Hardcoded \`a/b/c\` envelope schema.** A future 4-leg tournament will require schema migration. Fix: \`legs: Record<string, LegEnvelope>\` would have cost zero today, saves a migration later.

12. **\`inferDefaultsFromRegistry\` decay.** Picks "highest-cost-tier OpenAI" — when a model gets deprecated, picks something nonsensical. Fix: explicit fallback chain + warning when champion is missing from registry.

13. **\`--promote-review\` clarity.** Reviewers worried it might fire live LLM calls for "sample queries." It currently doesn't (reads from \`ab-pro.jsonl\`), but the docs should make this explicit.

## Acceptance

- All P1 fixes land
- Tests cover (a) JSONC parser with URLs/paths in string values, (b) backtest replay uses persisted leg-C model not rotation, (c) leaderboard cache invalidation
- New rubric option: \`cost-aware\` with \`scoreWeights.cost: 0.5\`
- README updates explaining cost-weight tuning + the new defaults
- Bump @bearly/llm minor (0.2.0 → 0.3.0) given default config change

## Out of scope (for now)

- Quota tracking — separate bead @km/bearly/llm-quota-tracking
- dispatch.ts shatter — @km/bearly/llm-dispatch-shatter (deferred)