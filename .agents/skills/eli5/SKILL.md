---
description: Re-explain to a teammate who just walked in. Strips task-shorthand, names mechanisms, caps at one screen. Use when the user signals they're lost ("explain", "wait what?", "I don't have your context", "ELI5"), or when you catch yourself using terms specific to the current task (option names, numbered suspects, file paths without gloss).
argument-hint: [topic, or empty = "what we're doing right now"]
---

# /eli5 — Explain Like a Teammate Just Walked In

**Keywords**: eli5, explain, plain, lost, context-drift, jargon

The user has only general project knowledge — what km / silvercode / silvery / the vendor packages ARE. Nothing else from the last N minutes of your work. Reset to that floor.

## The 4 rules

1. **Mechanism, not option name.** ❌ "we could enable singlePassLayout." ✅ "silvery currently runs layout → re-renders → runs layout again until stable. The option would force one pass."
2. **Define names on first use.** "the cascade", "the feedback loop", "Suspect 3", `Content.tsx` — gloss on first mention even if it's the 20th time you've thought it.
3. **Numbers, not adjectives.** "200 violations", not "still many". "1 second", not "briefly". "70% drop", not "big improvement".
4. **One screen, ~25 lines.** If it doesn't fit, drop secondary detail. Pick the load-bearing parts.

## Structure (when explaining problem + options)

```
What's happening:   mechanism — 2-3 sentences
What I did:         change + concrete result
What's left:        remaining mechanism
Options, plainly:   (a) <name> — what it changes, tradeoff
                    (b) ...
Recommendation:     1 sentence
```

For a simple question, just write prose under "What's happening" and stop.

## Before / after (a real one)

❌ "Should I (a) try singlePassLayout, (b) hunt the 336-wide text, or (c) audit useBoxRect call sites? Suspect 3 didn't pan out and AsideLayout was reverted."

✅ "The remaining churn is silvery (the rendering framework) doing layout, then re-rendering, then doing layout again until things settle — call this the cascade. Three angles:
- **Force one layout pass** — silvery has a setting that runs layout exactly once. Risk: components that read their own size get 0 on first paint.
- **Find the long unwrappable text** — one chat element measures 336 columns wide inside an 85-column parent. Adding `wrap="wrap"` fixes that one leaf.
- **Reduce measurement reads** — every `useBoxRect()` call is a re-render trigger. We have 3; some may be redundant."

## Self-trigger when you catch yourself

Writing any of these in user-facing text → stop, run /eli5:
- "the X fix" / "the Y change" — name what changed mechanically
- "Suspect N" / "Phase N" / "Attempt N" — your enumeration isn't theirs
- "Per the diagnosis" / "Per the bead" — they haven't read it
- A bare file path — gloss it ("`Content.tsx` — silvercode's chat-layout file")
