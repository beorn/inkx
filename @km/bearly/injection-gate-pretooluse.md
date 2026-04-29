---
id: "@km/bearly/injection-gate-pretooluse"
aliases:
  - km-bearly.injection-gate-pretooluse
  - km-bearly-injection-gate-pretooluse
created_by: claude:7e9436e8
created_at: 2026-04-21T19:41:49Z
closed_at: 2026-04-21T20:09:26Z
close_reason: "Phase 1 complete. tools/injection-gate.ts + 12 tests covering
  incident replay (blocks Write of advisor-takes.md when filename traces to
  recall only), legit-ask (allows), ambiguous (denies), no-false-positives on 3
  normal km prompts, degraded paths (no-manifest/empty-recall), destructive-bash
  detection. Settings wiring documented in tools/injection-gate.README.md —
  awaiting user confirmation to add to ~/.claude/settings.json. Commit:
  8ed976c63."
---

# [x] PreToolUse authority gate — block mutating tools driven by injected content @km/bearly #feature #P0 @claude:7e9436e8

blocks:: [[@km/bearly]], [[@km/bearly/injection-envelope-lib]]

# Phase 1 of @km/_orphan/ambot fix — THE STRUCTURAL BACKSTOP

Per Pro/Kimi review: this is the only capability barrier. Even if prompt-confusion survives (and it will), disk writes get blocked when proposed content is traceable to injected recall rather than user-typed text.

## What ships

New hook binary + settings entry: `tools/injection-gate.ts` as a PreToolUse hook.

### Turn manifest (built at UserPromptSubmit time, consumed at PreToolUse time)

```ts
type TurnManifest = {
  typedUserText: string        // exactly what user typed, no hook additions
  typedEntities: string[]      // names, file paths, task sigils, rare tokens
  typedShingles: string[]      // 4-gram hashes
  explicitWriteAuth: boolean   // did typed text actually ask to write?
  untrustedRecall: InjectedSpan[]
}
```

Persisted to `~/.claude/bearly-sessions/turn-manifest-<pid>.json` for the duration of the turn.

### Gate logic (at PreToolUse for Write / Edit / MultiEdit / destructive Bash)

Deterministic heuristics, no model calls:

1. **No explicit write auth + injection present** → block
2. **Candidate output contains entities present ONLY in injected spans** (not in typed text) → block
3. **Lexical overlap: candidate ↔ injected >> candidate ↔ typed** → block
4. **Preceding assistant text claims user source** ("you said", "from your message", "verbatim") AND recall-only entities present → block

Block message tells user: "I was about to write content referencing {entities} that came from retrieved memory, not from your typed message. Reply 'proceed' to authorize or clarify."

## Acceptance

- [ ] Hook wired into ~/.claude/settings.json for PreToolUse events matching Write|Edit|MultiEdit|Bash
- [ ] Turn manifest persisted at UserPromptSubmit, read at PreToolUse
- [ ] Incident-replay test: synthesize the @km/_orphan/ambot attack → gate blocks Write → zero file created
- [ ] Legitimate-ask test: user explicitly asks 'create advisor-takes.md with my notes' → gate allows
- [ ] Ambiguous test: user asks 'what do you think?' with injection present → gate asks for confirmation
- [ ] No false positives on day-to-day km development tasks (eval on top-10 recent session transcripts)

## Dependencies

- **After**: @km/bearly/injection-envelope-lib (library provides manifest schema + provenance spans)
- **Parallel**: @km/bearly/injection-evals (evals validate the gate)