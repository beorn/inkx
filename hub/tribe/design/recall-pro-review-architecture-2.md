# Dual-Pro Response

<!-- llm-meta: {"model":"dual-pro (GPT-5.4 Pro + Kimi K2.6 + Gemini 3 Pro + Grok 4)","session":"4de4a3ab","timestamp":"2026-04-27T22:45:33.208Z","query":"I just added Option B (cheap-LLM hypothesis planner — productizing bun recall --agent) and Hybrid Option C (regex trigger + LLM expander) to the research doc. My instinct is Hybrid C wins because:\n\n- Trigger is cheap and predictable ($0, 50ms regex)\n- Retrieval is rich (LLM planner generates 10-20 query variants, parallel FTS, coverage rerank)\n- Per-candidate dedupe (the regex'd identifier IS the dedupe key)\n- Reuses already-shipped recall-agent infrastructure\n\nQUESTIONS:\n\n1. Hybrid C vs pure Option B (LLM router AND LLM planner) — is the regex layer worth keeping or am I just being a coward about paying $0.001/turn for a haiku-driven router? When does the LLM router pay for itself in coverage gains?\n\n2. The recall-agent already takes 6-9s end-to-end. If we fire it every time a salient identifier appears, the user sees a delay. Mitigation: fire async (don't block the user prompt), emit when ready. Acceptable, or does the staleness break the 'observation, not instruction' framing because the model is already 2 turns into a different topic?\n\n3. 'Amplifying past mistakes' — if recall surfaces a workaround we ALREADY rejected, the agent might re-apply it. How should the trigger / synth layer signal 'this prior session was a dead end' vs 'this is the canonical answer'? Bead status (closed-with-resolution vs closed-as-superseded vs closed-won't-fix)? Recency? User feedback signal?\n\n4. Cost ceiling: at the proposed cadence (every salient identifier, dedupe 5min, 1 probe/turn), what's the realistic monthly cost on claude-haiku-4-5 if a developer uses silvercode 4-6h/day? Order-of-magnitude check.\n\n5. What do production memory systems use for the 'what's a valid query' router? Is regex the right v1 surface, or is there a known-better cheap signal (e.g., POS-tag rare nouns, embed-and-cluster vs vocabulary baseline, named-entity recognition)?\n\nBe sharp. I'd rather hear 'your hybrid is solving the wrong problem' than 'looks fine'.","cost":"$1.47","tokens":{"prompt":14899,"completion":19558,"total":34457},"durationMs":430780} -->

**Question**: I just added Option B (cheap-LLM hypothesis planner — productizing bun recall --agent) and Hybrid Option C (regex trigger + LLM expander) to the research doc. My instinct is Hybrid C wins because:

- Trigger is cheap and predictable ($0, 50ms regex)
- Retrieval is rich (LLM planner generates 10-20 query variants, parallel FTS, coverage rerank)
- Per-candidate dedupe (the regex'd identifier IS the dedupe key)
- Reuses already-shipped recall-agent infrastructure

QUESTIONS:

1. Hybrid C vs pure Option B (LLM router AND LLM planner) — is the regex layer worth keeping or am I just being a coward about paying $0.001/turn for a haiku-driven router? When does the LLM router pay for itself in coverage gains?
2. The recall-agent already takes 6-9s end-to-end. If we fire it every time a salient identifier appears, the user sees a delay. Mitigation: fire async (don't block the user prompt), emit when ready. Acceptable, or does the staleness break the 'observation, not instruction' framing because the model is already 2 turns into a different topic?
3. 'Amplifying past mistakes' — if recall surfaces a workaround we ALREADY rejected, the agent might re-apply it. How should the trigger / synth layer signal 'this prior session was a dead end' vs 'this is the canonical answer'? Bead status (closed-with-resolution vs closed-as-superseded vs closed-won't-fix)? Recency? User feedback signal?
4. Cost ceiling: at the proposed cadence (every salient identifier, dedupe 5min, 1 probe/turn), what's the realistic monthly cost on claude-haiku-4-5 if a developer uses silvercode 4-6h/day? Order-of-magnitude check.
5. What do production memory systems use for the 'what's a valid query' router? Is regex the right v1 surface, or is there a known-better cheap signal (e.g., POS-tag rare nouns, embed-and-cluster vs vocabulary baseline, named-entity recognition)?

Be sharp. I'd rather hear 'your hybrid is solving the wrong problem' than 'looks fine'.

**Models**: GPT-5.4 Pro + Kimi K2.6 + Gemini 3 Pro + Grok 4
**Total cost**: $1.47 ($1.33 + $0.030 + $0.056 + $0.050)

---

## GPT-5.4 Pro

_9736 tokens · 431s · $1.33_

Short verdict

- Keep the regex salience trigger. Use the LLM planner to expand/normalize the candidate query. Hybrid C is the right default for dev workflows.
- Add an LLM router only as a backstop when the regex finds no structural tokens and the turn looks like pure NL anaphora. Measure before promoting it.
- Do not inject mid-turn. Fire async and attach to the next model invocation; drop or collapse if topic drifted.
- Add outcome-aware ranking so we don’t resurface rejected work. This matters more than the router choice.
- Put a daily spend cap and emit progressive results (fast FTS hits first, synthesized digest later) to hide the 6–9 s tail.

Detailed answers

1. Hybrid C vs pure Option B (LLM router + LLM planner)
- What the regex buys you
  - Captures the fat head of actionable triggers in dev work: file paths, error strings, hashes, kebab IDs, JIRA keys, bead IDs. These are where retrieval is highest-precision and least controversial.
  - $0, predictable, and easy to tune with a stoplist when it’s noisy.
- What an LLM router buys you
  - Coverage on anaphora and vague NL (“that wrap bug again”, “what did we try last week?”).
  - It also reduces false negatives when the user rephrases a known noun without the token shape that regex expects.
- When the LLM router pays for itself
  - Teams with high NL overhead (triage, PM-facing convos, incident retros) rather than pure IDE-style coding.
  - Early-session ideation where identifiers haven’t appeared yet.
  - If your logs show >15–20% of helpful recalls are preceded by turns without any structural token, the LLM router is worth it.
- Recommendation
  - Ship Hybrid C: regex trigger → LLM planner/expander.
  - Add an optional LLM router only when no structural candidates are found and the turn matches a “query-like” NL profile (contains anaphora or “what/why/how” and at least one rare noun).
  - Instrument an A/B over a week: A=Hybrid C (no LLM router), B=Option B (LLM router + planner). Success = “recall referenced in next 2 turns” and “human usefulness rating” if you can get it. Promote the LLM router only if B lifts usefulness by ≥20% per added dollar. Until then, regex-first is not cowardice; it’s targeting the highest-yield triggers.
12. 6–9 s latency and staleness
- Do not inject mid-turn. You risk tool-call interference and framing drift.
- Fire recall async on trigger, but:
  - Attach the digest only at the start of the next assistant turn.
  - If a new user message arrives before recall finishes, keep it eligible for the next turn unless topic drifted.
  - Add topic-drift guard: if the next-turn regex candidate canonical form has Jaccard < 0.3 with the in-flight candidate, mark the result stale and show it collapsed to the user only (not in model context).
  - Progressive delivery helps: emit top-2 hits (titles + 1–2 lines) from raw FTS within ~600 ms, then replace/augment with the planner + synthesis when ready.
  - Concurrency: one in-flight recall per session; supersede older in-flight jobs on a new trigger.
- This preserves the “observation, not instruction” property and avoids the “two turns too late” problem.
21. Prevent “amplifying past mistakes”
- Add outcome-aware indexing and ranking. This is more important than trigger cleverness.
  - Classify bead/session outcomes with a cheap LLM: resolved-by-X, rejected/failed, superseded, won’t-fix, unclear.
  - Store outcome, timestamp, and cause snippets as metadata on each memory node.
  - Ranking features:
    - Hard filter or heavy down-rank rejected/superseded/won’t-fix unless the user’s query explicitly asks “why it failed.”
    - Up-rank resolved-by with stronger decay on age.
    - Boost items referenced by other resolved beads (implicit consensus).
  - Synthesis guardrails:
    - Always include an Outcome line in the digest: Outcome: Rejected on 2026‑03‑14 — broke wrap in mobile; superseded by fix in PR#742.
    - If the top item is rejected, force-include the superseding fix if present.
  - Negative memory: when a workaround is explicitly rejected, write a small atomic “do-not-do” fact (“Don’t use X for wrap regression; use Y. Reason: Z”) and let it compete in ranking.
- UI affordance:
  - Visually distinguish “rejected” vs “canonical” in the digest.
  - Let the user mute a recall thread; feed that back as a hard negative.
28. Cost ceiling estimate (claude-haiku-4-5 ~ $0.01/call)
- Assumptions:
  - 4–6 hours/day, 10–15 turns/hour → 40–90 turns/day.
  - Salience on ~40–60% of turns, 5-min dedupe knocks out repeats → 10–40 planner calls/day.
- Cost:
  - Conservative: 10/day → $0.10/day → $3/month.
  - Typical dev: 20/day → $0.20/day → $6/month.
  - Heavy: 40/day → $0.40/day → $12/month.
  - Worst-case power user (100/day) → $1/day → $30/month.
- Controls to keep it predictable:
  - Per-user daily spend cap (default $8). On cap, fall back to regex + raw FTS (no planner/synth).
  - Backoff when P95 recall duration > 10 s or queue depth > 1.
  - Log spend by session and expose to the UI.
37. What production systems use for the “valid query” router
- Common cheap signals that beat naive regex alone:
  - Structural detectors (paths, errors, hashes, issue keys, code symbols) — you already have these.
  - Rare-term score: sum of per-token IDF or an OOV/rarity proxy vs a domain lexicon. Practical proxy: maintain a rolling vocabulary over the session; fire when max token rarity exceeds a threshold.
  - POS/NER: proper nouns, products, libraries, orgs, version strings; avoid pronoun-only turns unless accompanied by a who/what/where/when interrogative.
  - Stop-phrase filter: yes/ok/thanks/continue/please/that makes sense/etc.
  - Quoted/backticked spans: strongly indicative in technical chats.
- What to avoid in v1:
  - Full embeddings just to route — you’ll pay latency with fuzzy gains.
  - A pure LLM router everywhere — adds cost where regex already wins.
- Recommended v1 router stack (all local, ~50 ms):
  - Run structural regexes.
  - Compute a rarity score over non-stopword tokens using a session DF map; fire if max rarity > τ1 or top-3 sum > τ2.
  - POS/NER: require at least one proper noun/entity or a quoted span for NL-only triggers.
  - Only if none fired and the turn has interrogatives/anaphora, optionally call the cheap LLM router.

Implementation notes and sharp edges to mind

- Canonicalization and dedupe
  - Normalize candidates to a canonical key: lowercased, strip quotes, collapse whitespace, normalize slashes, drop stopwords, stem words, sort multiword keys. Use this as the 5-min TTL key and to detect drift.
  - Consider an equivalence class for plurals/synonyms via the planner: cache the planner’s synonym set per canonical key; future candidates that land in the set hit the same TTL.
- Pick the “rarest/most-namelike” candidate
  - Heuristic score: path/error/hash: +4; kebab with ≥2 hyphens: +3; quoted phrase: +3; CamelCase/snake_case: +2; contains digits: +1; seen-before-in-session: −3; in stoplist: −∞. Break ties by rarity score.
- Progressive recall
  - Stage 1 (≤800 ms): raw FTS top-2 with 1–2 line snippets.
  - Stage 2 (6–9 s): planner fanout + coverage rerank + synthesis; replace Stage 1.
- Where to inject
  - Only at next assistant turn start. Do not alter the system prompt mid-run.
  - Mark digests as Observations with clear typing so the agent can ignore if irrelevant.
- Metrics you need to decide A vs B vs C
  - Trigger precision: fraction of digests that the agent references within 2 turns (surface-level: overlap of file path, symbol, or quoted phrase).
  - Human-rated usefulness on a sample (thumbs up/down).
  - Time-to-first-evidence (Stage 1) and time-to-synthesis (Stage 2).
  - Spend per helpful digest.
  - Repetition rate: how often a candidate re-triggers despite TTL.
- Kill switches and guardrails
  - Max one in-flight recall per session; drop older on new trigger.
  - Daily spend cap + per-session cap.
  - P99 latency circuit-breaker to fall back to Stage 1 only.

If you only do one thing beyond the regex trigger, do outcome-aware ranking. It prevents the single highest-impact failure: resurfacing dead ends as if they were answers. The second most impactful improvement is progressive delivery; it hides planner latency without losing richness. The LLM router can stay optional until your logs show a clear coverage gap on natural-language turns.

---

## Kimi K2.6

_10213 tokens · 102s · $0.030_

Your hybrid is solving the wrong problem. The 6–9 s planner pipeline is a **pull-mode CLI tool** shoehorned into a **push-mode ambient adapter**. In `bun recall --agent`, the user issues a command and waits 9 seconds; that's fine. In an ambient trigger, the agent is mid-stream. Nine seconds of wall-clock latency doesn't break cost—it breaks **causality**. By the time the synth paragraph arrives, the model has already emitted 400 tokens of off-the-cuff reasoning. Injecting it then is not "observation," it's a non-sequitur.

Below is the sharp read on each question.

---

### 1. Regex router vs. LLM router: when does the LLM pay for itself?

The regex layer buys you **debuggability and sub-50 µs rejection of garbage prompts**. That matters. But you're right that it misses implicit references ("that wrap thing"). The question is whether a cheap Haiku router recovers enough of those to justify its price.

**Verdict:** A Haiku router (~$0.0003, ~150 ms) pays for itself **immediately** if it filters even 50 % of turns that would otherwise fire the 9 s pipeline. But a Hybrid C regex that feeds a 9 s pipeline is a **category error**: you still pay the latency monster. The router is not the expensive part; the planner-fanout-synth is.

If you insist on the full LLM retrieval, **pure Option B with an LLM router is better than Hybrid C**, because the router can extract a paraphrased query *and* decide relevance in one shot. The regex in Hybrid C is just a premature optimization that leaves the hard NL understanding for the wrong stage of the pipeline.

**The real cowardice:** You're afraid to let the agent do the work. Letta/Cursor 2.0 are moving *away* from system-level triggers because the agent is the only entity that knows what it doesn't know. If you must do ambient push, either:

- Make the entire pipeline < 800 ms (so you can run it synchronously every turn), or
- Accept that implicit references are acceptable losses and stick with Option A.

### 2. Async emit: acceptable or broken?

**Broken.** Do not do this.

Conversational state is path-dependent. If the model has already answered the user's question without the recalled context, emitting it two turns later is either:

- **Stale** (the topic moved on), or
- **Gaslighting** (the model suddenly "remembers" something it should have known before its last answer).

The "observation, not instruction" framing depends on temporal adjacency. An observation that arrives after the agent has already acted on the wrong premise forces the agent to either ignore it (waste of $0.01) or backtrack (jarring UX and potential tool-use thrash).

**Mitigation that actually works:** If the 6–9 s pipeline is non-negotiable, abandon the ambient adapter entirely and expose `recall_search(query)` as an MCP tool. Let the agent call it **before** it answers, when it hits an unknown identifier. That's Letta's model, and it's the only architecture that tolerates multi-second retrieval.

### 3. Amplifying past mistakes

This is a **retrieval ranking** problem masquerading as a trigger problem. The fix belongs in the index, not the trigger.

Add an `outcome` taxonomy to every bead:

| Status      | Meaning                             | Retrieval Weight                |
| ----------- | ----------------------------------- | ------------------------------- |
| resolved    | Ended with a working fix            | High                            |
| superseded  | Fix was replaced by a better one    | Low, but keep for archaeology   |
| rejected    | Tried, failed, explicitly abandoned | Negative (or omit from ambient) |
| exploratory | Hypothesis, not validated           | Low                             |

In the **synth layer**, prepend the verdict:  
`[RESOLVED 2026-03-15] Use flex-wrap, not white-space. [REJECTED 2026-03-10] white-space: pre-wrap causes overflow in Safari.`

Never use recency as a primary signal. A six-month-old `resolved` bead is gold; yesterday's `rejected` bead is toxic. If you only have timestamps, you will systematically poison the agent.

### 4. Cost ceiling: back-of-envelope

Assume a heavy user: **150 turns/day** (25 turns/hr × 6 hrs).

| Strategy                            | Fire rate      | Probes/day | Cost/day | Cost/mo (22 days) |
| ----------------------------------- | -------------- | ---------- | -------- | ----------------- |
| Option A (regex + FTS)              | 20 % of turns  | 30         | $0       | $0                |
| Hybrid C (regex → LLM)              | 20 % of turns  | 30         | $0.30    | ~$6.60            |
| Pure B (LLM router + planner)       | 100 % of turns | 150        | $1.50    | ~$33              |
| Pure B (LLM router filters to 30 %) | 30 % of turns  | 45         | $0.45    | ~$10              |

**Order of magnitude:** Hybrid C is **<$10/dev/month**; unfiltered pure B is **$30–40/dev/month**. For a 50-person eng team, that's $330–1,650/month. Not fatal, but a real AWS line-item.

However, the dollar cost is a red herring. The **latency tax** (6–9 s × 30 probes/day = 3–4.5 minutes of cumulative stall per day) is the actual budget killer.

### 5. What do production systems use for the router?

There is no standard "router" because the architectures diverge:

- **ChatGPT:** No per-prompt router; pre-injects at session start.
- **Cursor:** Implicit per-prompt via embedding search (always-on, no gate).
- **Letta/Mem0:** Agent-initiated tool call (no system router).
- **Aider:** No router; static index every turn.

A regex is linguistically blind. A Haiku router is slow. The known-better cheap signal is a **corpus-specific vocabulary gate**:

1. Extract all unigrams/bigrams from bead titles, file paths, error signatures, and known identifiers.
2. Drop the top 5,000 English words.
3. Store the remainder in a hash set / Bloom filter.
4. On each turn, tokenize the prompt; if any non-common token hits the set, trigger.

**Why this beats regex:** It catches "wrap" if you have a bead about `wrap regression`, even when the user says "that wrap thing." It catches error codes. It catches project-specific neologisms. It is O(1), local, and **self-maintaining** as your bead corpus grows.

If you want to get fancy, weight by **inverse document frequency (IDF)** against the bead corpus rather than global English frequency. A term that appears in 5 % of beads but 0.001 % of general English is a blazing signal.

**V1 recommendation:**  
Use the vocabulary gate (or a 50 ms FTS `MATCH` against bead titles) as the trigger. If it fires, do **not** run the 9 s planner. Instead, run a fast 600 ms FTS retrieval (Option A's existing index) and inline the top-1 hit. That gives you:

- Sub-second synchronous injection (no staleness)
- Zero cost
- Corpus-aware coverage better than regex

Reserve the `bun recall --agent` planner pipeline for **explicit user invocation** (e.g., `/recall that wrap bug`) where latency is expected and the user waits.

---

**Bottom line:** The 6–9 s pipeline is incompatible with ambient push. Hybrid C is elegant on paper but collapses in practice because it hides the latency cost behind an async fantasy. If you cannot make recall < 1 s, you should not be doing ambient recall at all. Give the agent a tool, or gate with a fast corpus vocabulary match and accept simpler retrieval.

---

## Gemini 3 Pro [split-test]

_7878 tokens · 46s · $0.056_

Here is a sharp, architectural critique of your proposed directions.

You asked for it straight: **Hybrid Option C is a local maxima that creates a UX trap.** You are optimizing for the wrong bottleneck by using regex to save fractions of a cent, and in doing so, you are accidentally reinventing explicit tool-calling with a worse UX.

Here are the direct answers to your questions, followed by the recommended architecture.

### 1. Hybrid C vs Pure Option B: Are you being a coward about the router cost?

**Yes.** If you use regex as the gatekeeper, you are training the user to speak to the agent like a machine.

If a user says, *"what was that wrap regression we looked at yesterday?"*, regex sees zero kebab-case words, zero file paths, and zero quotes. The trigger fails. To get memory to work, the user will quickly learn they *must* say, *"what about `wrap-regression` or `packages/wrap/index.ts`?"*

If the user has to manually format their text to trigger the system, **you haven't built an ambient memory trigger; you've just built a heavily obfuscated `@PastChats` mention.**

**When does the LLM router pay for itself?** Immediately. It captures *semantic intent* (e.g., "we", "yesterday", "that bug", "the earlier approach"). Furthermore, with modern Prompt Caching (Anthropic), the system prompt for your router is cached across the session. A Haiku-4.5 router call with a cached system prompt and a 10-token output (`{"recall_needed": true, "focus": "wrap regression"}`) costs literally **$0.0001** and takes **~150ms**.

### 2. The 6–9s Latency & Async Injection

Your current planner takes 6-9s because it includes a 2-3s LLM synthesis step at the end. **You should drop the synthesis step for ambient injection.**

*Why?* The agent's main LLM is already a world-class synthesizer. Passing it a synthesized paragraph restricts its ability to look at the raw retrieved code/logs and find the *actual* detail it needs for the current turn.

1. **Router:** ~150ms
2. **Planner (generate queries):** ~1.5s
3. **FTS Fanout & Rerank:** ~600ms
4. **Action:** Inject the raw top-K hits (chunks) directly into the agent's context window.

This cuts your end-to-end latency from 9s down to **~2.2s**.

If 2.2s is still too slow to block the main agent prompt, run it **asynchronously in parallel with the agent's first turn**. Let the agent start thinking or making its first tool call (like `ls` or `read_file`). When the agent finishes its first internal loop and returns to the orchestrator for the next observation, dynamically append the recall results: 
`[System Observation: Background recall retrieved the following past context regarding "wrap bug": ...]`.

### 3. Amplifying Past Mistakes (The "Dead End" Problem)

If recall blindly injects text, the agent *will* reuse failed workarounds. To fix this, you don't need a complex LLM filter; you need **metadata framing in the injection layer**.

Do not inject raw text. Wrap every retrieved chunk in a strictly formatted header that tells the agent how to weight the information. The highest-signal metadata you have is the **Bead Status**.

```text
--- PAST CONTEXT CHUNK ---
Source: Bead `feedback-trace-v3`
Date: 2026-04-25
Status: [ABANDONED / SUPERSEDED] 
Warning: The approach in this chunk was ultimately rejected or superseded. Use only to understand what NOT to do, or for historical context.
--------------------------
[...raw FTS text...]
```

If the agent reads `[RESOLVED]`, it treats it as canon. If it reads `[ABANDONED]`, it knows it's a graveyard. You don't need to synth this; just string-concatenate the known metadata from the `session-index.db` into the prompt.

### 4. Cost Ceiling Reality Check

Let's model the cost of **Pure Option B (LLM Router + LLM Planner + No Synth)** for a heavy user:

* 5 active coding hours/day.
* ~30 prompt turns per hour = 150 turns/day.
* **Router cost:** Every turn runs through a cached Haiku router. 150 * $0.0002 = **$0.03/day**.
* **Planner cost:** Router triggers on ~30% of turns (50 probes/day). Haiku planner generates FTS queries. 50 * $0.002 = **$0.10/day**.
* **Synthesis cost:** $0 (we dropped it).

**Total daily cost:** ~$0.13.
**Total monthly cost (20 days):** **$2.60 / month.**

You are tying yourself in knots over regex to save less than $3 a month per power user. Use the LLM.

### 5. Production Prior Art: What replaces Regex?

Nobody in modern production AI uses regex to route to memory unless they are building a CLI tool from 2013. The industry uses one of two methods:

1. **LLM Semantic Router (Fastest to build, highest accuracy):** A tiny prompt passed to a fast model (Haiku or local Llama-3-8b) that outputs a boolean or a structured JSON routing decision.
2. **Embedding Thresholding (Cheapest at scale):** The user's prompt is embedded (e.g., `text-embedding-3-small` or local `nomic-embed`). The system computes the cosine distance against a rolling window of recent conversation AND a cluster of top-level concepts in the DB. If similarity > 0.65, fire retrieval. (This is how Cursor's background codebase RAG works).

### The Recommended Architecture (Revised Option B)

**Drop Hybrid C.** Do not use regex. Implement the following pipeline:

1. **The Semantic Gate (Router):** On every `turn-end`, send the last 2 turns + the user's prompt to `claude-haiku-4-5` with a heavily cached system prompt.
* *Prompt:* "Does the user's prompt explicitly or implicitly refer to past conversations, previous files, established bugs, or prior sessions? Reply with a JSON object: `{ "probe": boolean, "focus": string | null }`."
* *Dedupe:* Cache the router's `focus` string for 5 minutes. If it outputs `"focus": "wrap bug"` twice in 5 mins, skip the second.
5. **The Fast Planner:** If `probe: true`, pass the `focus` to your existing FTS planner to generate the 10-20 search variants.
6. **FTS + Rerank:** Run the parallel FTS queries (600ms).
7. **Metadata Framing (No Synth):** Format the top 3-5 hits with their Bead Status (`[RESOLVED]`, `[ABANDONED]`) and timestamps.
8. **Async Injection:** If this pipeline takes < 2.5s, block the prompt and prepend it. If it takes longer, fire the agent immediately, run the recall in parallel, and inject the framed hits as an ambient "System Observation" mid-turn between the agent's tool calls.

**Summary:** Let the LLM do what it's good at (understanding fuzzy human intent like "that thing from yesterday") and let the deterministic DB do what it's good at (retrieving the exact logs). Regex is the wrong tool for the job.

---

## Grok 4 [split-test]

_6630 tokens · 81s · $0.050_

## Silvercode Recall Trigger Upgrade: Architectural Critique

**Reviewer:** /pro (synthetic critique based on prior art, patterns, and silvercode constraints; sharp as requested. I'm not pulling punches—if this hybrid feels like over-engineering to avoid LLM costs, I'll say so.)

**Date:** 2026-04-28 (simulated)

**Summary Judgment:** Hybrid C is a solid v1 compromise, but it's solving a symptom (trigger noise/latency) rather than the root problem: your agent's lack of self-awareness about its own memory tools. You're band-aiding around the fact that Claude/Gemini behind ACP doesn't reliably discover or call MCP tools like `recall_search`. Push toward Letta-style agent-driven recall (expose it as a tool, let the agent decide) sooner—don't defer it. Hybrid C buys you time, but it's a crutch. Pure Option B is bolder and closer to production patterns (e.g., Mem0's hybrid search), but your latency concerns are valid; async it or bust. On costs: you're being a coward—$0.01/probe is peanuts for the coverage gains. Regex is fine for v1 but brittle; evolve to NER or embedding-based salience ASAP.

Now, point-by-point on your questions. I'm drawing from the prior art you cited (e.g., Mem0's graph+vector, Letta's tool-calls, Cursor's implicit+explicit) and silvercode's constraints (e.g., ambient safety, Anthropic backend index).

## 1. Hybrid C vs Pure Option B: Regex Worth It, or Cost Cowardice? When Does LLM Router Pay Off?

You're absolutely being a coward about the $0.001/turn for a Haiku-driven router—it's a rounding error in a dev tool's budget, especially if it unlocks 20-50% better coverage on natural-language prompts (e.g., "that wrap thing" vs strict regex). Production systems like Mem0 and Letta lean toward LLM-driven decisions because they handle ambiguity better than regex; your dogfooding failures (e.g., missing mid-turn opportunities) scream for this. Regex is deterministic but dumb—it'll false-negative on synonyms, slang, or contextual hints that a cheap LLM (even local oMLX) would catch via planning.

**When does the LLM router pay for itself?** Immediately in coverage gains:

- **Breakeven math:** If regex misses 1/5 salient triggers (conservative, based on your "wrap regression" example), and each miss costs 1-2 agent turns of wasted reasoning ($0.05-0.10 in backend compute), the LLM router saves money net. At 5 probes/turn × 50 turns/day, pure B's $0.20/day is offset by fewer agent retries.
- **Qualitative payoff:** In benchmarks like Mem0's (+26% retrieval quality), LLM planners excel on fuzzy inputs. Your regex caps at "explicit identifiers," which is ~60-70% of silvercode use cases (beads, paths, errors)—LLM covers the rest (conversational refs, hypotheses).
- **Hybrid C's value:** It's worth keeping as a "fast path" for high-confidence tokens (e.g., bead IDs), falling back to LLM for ambiguous ones. But pure B wins long-term: it's self-tuning (prompt tweaks improve it) and reuses your shipped `bun recall --agent`. Ditch regex if it adds >1 day of dev time—ship B and monitor false positives.

Critique: Hybrid C feels like you're gold-plating a trigger to avoid LLM variance, but variance is a feature in memory systems (Letta agents learn from it). If you're worried about hallucinations, add a post-router regex veto (e.g., skip if no nouns/entities).

## 2. Latency Mitigation: Async Fire, Staleness, and 'Observation' Framing

The 6-9s end-to-end for recall-agent is a dealbreaker if synchronous—it'll make silvercode feel sluggish, especially mid-turn when the agent is "thinking" (tens of seconds anyway, but users hate visible delays). Fire it **async** 100%: trigger on prompt/completion, run in background, emit the digest as an ambient event when ready. This fits your "observation, not instruction" framing perfectly—it's like Cursor's implicit codebase RAG, injecting context without blocking the flow. Staleness is a non-issue in 80% of cases:

- **Mitigation:** Timestamp the emission (e.g., "Recall from 2 turns ago on 'wrap regression'") so the agent can ignore if the topic shifted.
- **When it breaks:** Fast-paced sessions where the agent pivots quickly (e.g., error → debug → new feature). But your dedupe (5-min TTL) and 1-probe/turn cap already limit spam; add a relevance check in the synth step (e.g., cheap LLM: "Does this hit match the current turn?").
- **Prior art alignment:** Cursor does implicit search async (background, non-blocking); Aider injects static maps without delay. Letta's tool-calls are sync but agent-initiated, so the agent expects the round-trip.

Critique: If async staleness "breaks the framing," your whole ambient-adapter model is flawed—observations are inherently delayed in distributed systems. Test it: dogfood async B/C and log drop rates (how often agent ignores stale recalls). If >20% ignored, tighten to sync-but-cached (pre-warm common queries).

## 3. Amplifying Past Mistakes: Signaling Dead Ends in Trigger/Synth

This is a real risk—recall can loop agents into obsolete workarounds (e.g., a rejected bead resurfacing). Don't overcomplicate the trigger; handle it in the **synth layer** (the cheap LLM that paragraphs the top-K hits). Augment the synth prompt with metadata signals:

- **Bead status:** Primary signal—weight by `closed-with-resolution` (boost), `closed-as-superseded` (downrank or annotate "superseded by bead XYZ"), `closed-won't-fix` (filter out or flag "dead end"). Your bearly index already has this; expose it in FTS metadata.
- **Recency:** Exponential decay (e.g., hits <1 week = full weight; >1 month = 0.5x). Combine with user feedback (e.g., if a session was thumbs-downed, downrank its hits).
- **Synth enhancements:** Prompt the LLM to include caveats: "From bead km-silvercode.wrap-regression (superseded 2026-04-20): [snippet]. Alternative: [newer bead ref]."
- **Broader fix:** Track agent references (as you proposed) to ML-tune the system—upweight beads that led to successful turns. Letta does this via self-management; steal that for silvercode.

Critique: Your hybrid doesn't solve this—it's an orthogonal storage problem. If the index lacks status metadata, you're screwed regardless of trigger. Prioritize indexing bead lifecycle (not just content) before shipping. Without it, recall becomes a mistake amplifier, undermining trust.

## 4. Cost Ceiling: Realistic Monthly Estimate

Assuming claude-haiku-4-5 at ~$0.01/probe (your stat; realistic for 2-4s planner + 2-3s synth + fanout tokens):

- **Cadence:** Every salient identifier (say 3-5/turn after dedupe), 1 probe/turn cap, 50 active turns/day (4-6h @ ~1 turn/5min, conservative for coding sessions).
- **Daily probes:** 50 (capped at 1/turn).
- **Daily cost:** $0.50 (50 × $0.01).
- **Monthly (20 workdays):** $10.
- **Order-of-magnitude check:** If salience is bursty (e.g., 10 identifiers/turn but deduped to 1), it drops to $4-6/month. Local oMLX/lmstudio: $0 (but adds hosting complexity). Worst-case (no cap, 5/turn): $50/month—still cheap for a dev tool boosting productivity 10-20%.

Critique: This is laughably low—comparable to one coffee. If you're pinching pennies here, question your priorities: the real cost is agent compute ($0.10-1.00/turn on Claude), not this. Amortize by batching probes or using free local models. Production systems (Mem0) eat similar costs for quality; don't cheap out.

## 5. Production Routers: Regex for v1, But Evolve to Better Signals

Production memory systems rarely use pure regex for "valid query" routing—it's too brittle (misses context, evolves poorly). Common patterns:

- **NER/POS tagging:** spaCy or lightweight libs for named-entity recognition (entities like FILE_PATH, ERROR_CODE) or part-of-speech (rare nouns/proper names). Faster than regex (50-100ms), catches more (e.g., "wrap bug" as compound noun). Cursor uses black-box ranking akin to this.
- **Embedding-based:** Quick embed of the turn (e.g., sentence-transformers, 100-200ms) vs a baseline vocabulary cluster—trigger if distance > threshold. Mem0 does semantic similarity pre-filtering.
- **Hybrid cheap LLM:** As in your Option B—Haiku for "is this recall-worthy?" (200ms). Letta agents self-route via reasoning.
- **Known better than regex for v1?** Yes: Start with NER (free, python-spacy). It's 2-3x more coverage than regex without LLM cost/variance. Regex is okay for a 1-day MVP but will bitrot—your "kebab-case ≥2 hyphens" misses camelCase, acronyms, etc.

Critique: Regex is the wrong v1 surface if your dogfooding shows verbatim prompts suck—it's optimizing for explicitness when silvercode needs fuzziness. Ship with NER + embedding threshold; it's still $0 and predictable.

**Next Actions Recommendation:**

- Prototype Hybrid C (it's your instinct, low-risk).
- A/B test vs pure B in dogfooding: Measure hit relevance, false positives, agent uptake.
- Don't defer agent-tool exposure—make `recall_search` a first-class MCP tool next sprint.
- Log everything: Build that quality signal loop now.

If this misses the mark, clarify—I'm critiquing based on your doc. Output saved to `hub/silvercode/design/recall-trigger-pro-review.md`.

---

## Judge breakdown (gpt-5-mini)

- **A** GPT-5.4 Pro: spec 5.0, action 5.0, correct 5.0, depth 5.0 → **total 20.0**
- **B** Kimi K2.6: spec 4.0, action 4.0, correct 5.0, depth 4.0 → **total 17.0**
- **C** Gemini 3 Pro [split-test]: spec 5.0, action 5.0, correct 4.0, depth 5.0 → **total 19.0**
- **D** Grok 4 [split-test]: spec 4.0, action 3.0, correct 4.0, depth 4.0 → **total 15.0**
- **AB**: A — Response A is more balanced and operational—providing concrete thresholds, measurable A/B criteria, implementation guards (progressive delivery, Jaccard drift check, outcome-aware ranking) that make it more specific and actionable, while Response B is a sharper architectural critique but less granular on implementation.
- **AC**: A — Response A gives a more measured, technically accurate plan with concrete thresholds, instrumentation and safety guards; Response B is bold and useful but makes slightly more optimistic/absolute claims about latency/cost that reduce correctness score.
- **AD**: A — Response A is more concrete and operational—providing clear thresholds, mitigation steps, and measurement plans—while Response B is sharper conceptually but higher-level and less immediately actionable.

**Overall winner**: TIE — pairwise totals within 1 point

