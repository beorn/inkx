---
id: "@km/infra/llm-recover-ux"
aliases:
  - km-infra.llm-recover-ux
  - km-infra-llm-recover-ux
created_by: claude:88c0e764
created_at: 2026-04-20T21:01:08Z
closed_at: 2026-04-20T21:27:26Z
close_reason: "5 fixes shipped in vendor/bearly@ceda3be + km@84ce360dc: (1)
  recover ceiling 180→600 + LLM_RECOVER_MAX_ATTEMPTS env, (2) recover writes
  /tmp/llm-*.txt via shared buildOutputPath() helper, (3) makePollProgress() —
  TTY spinner, non-TTY 60s-gated lines (no more claude-code auto-background),
  (4) new 'bun llm await <id>' silent block subcommand, (5) /pro skill SKILL.md
  + review.md document --fast vs --deep tradeoff. 9 unit tests pass
  (format.test.ts), bearly typecheck clean, bun llm --help renders, await
  argument validation verified. Not pushed."
---

# [x] /pro /llm recover: poll timeout too short, no write-to-file, stdout spam @km/infra #task #P0 @claude:a1a0e667

blocks:: [[@km/infra]]

From /why on 2026-04-20 pro review experience. Recovery of GPT 5.4 Pro deep response was painful:

- bun llm recover timed out at 180 × 5s = 900s, but response took ~40min end-to-end
- Successful recover prints to stdout but doesn't write /tmp/llm-*.txt (only the initial launch does)
- Verbose "⏳ in_progress (Ns elapsed)" every 3s triggers claude-code's auto-background → output invisible without manual tail
- Required 3 recover attempts + final manual stdout redirect to capture the 79K-token review

## Fixes

### PATCH (tonight)
1. Bump recover maxAttempts 180 → 600 (50 min window) in vendor/bearly/tools/llm.ts
2. On successful recover, write output to /tmp/llm-<session>-<topic>-<hash>.txt same format as launch

### GUARD (next session)
3. Quiet progress format: single overwriting line (\\r), not append. Prevents claude-code auto-background.

### REDESIGN (if multiple sessions hit)
4. `bun llm await <id>` — blocks silently, prints only the final result, writes /tmp/llm-*.txt. Recover stays for probing partial responses.

### SPEC (future)
5. /pro skill: add --fast mode that drops --deep for self-sufficient context reviews (would have been ~10min instead of ~40min today)

## /complete criteria

- [ ] maxAttempts bumped + env var override (LLM_RECOVER_MAX_ATTEMPTS)
- [ ] Recover path writes to /tmp/llm-*.txt on success
- [ ] Progress format either: single-line \\r overwrite OR gated by isatty (stdout if TTY, silent otherwise)
- [ ] /pro skill documents --fast vs --deep tradeoff
- [ ] Test: manual e2e recovery flow works without manual redirect

## Parent

@km/infra (or appropriate infra scope)