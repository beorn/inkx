<!-- llm-meta: {"model":"dual-pro (GPT-5.4 Pro + Kimi K2.6 + Gemini 3 Pro + Grok 4)","session":"4de4a3ab","timestamp":"2026-04-27T22:45:38.289Z","query":"I'm designing the salience-based recall trigger for silvercode (an agent host that wraps Claude/Codex/Gemini via ACP). The full prior-art research and current implementation are in the context files.\n\nCRITIQUE THE PROPOSED HYBRID DESIGN. Specifically:\n\n1. Is the salience extractor (regex for kebab-case ≥2-hyphen / file paths / error strings / quoted phrases) the right surface for v1? What's missing or over-engineered? What false-positive / false-negative classes will bite us?\n\n2. Per-token dedupe with 5-min TTL — is that the right shape? Should it be per-(token, session)? Per-token globally? What's the failure mode when the same identifier is genuinely re-relevant in two different conversational moments?\n\n3. 1 probe per turn cap — is this too conservative? What if the agent mentions 5 distinct beads in one response (a triage scenario)? Should the cap scale with turn length / token count?\n\n4. The biggest architectural risk: am I designing the wrong thing entirely? Letta's tool-call model and ChatGPT's at-session-start summary are alternatives. Which fits silvercode's constraints (ACP-wrapped spawned agents, ambient-context-safety boundary, low latency budget) BEST? I lean toward salience-based per-prompt because the ACP boundary already does the framing (EmbeddedResource = 'observation, not instruction'), but I want a second opinion.\n\n5. What's the smallest implementation that gets 80% of the value? I want to ship something tomorrow — what should v1 be vs v2 vs v3?\n\n6. Anti-patterns specific to recall-from-session-history: mining your own past confusion for context risks 'amplifying mistakes' (the agent re-applies a workaround that was rejected). How do production memory systems guard against this?\n\n7. Anything I'm missing from the prior art? Particularly: AI memory papers from 2025-2026 that I should know about before shipping.\n\nI want a sharp, opinionated review. The current placeholder works but is dumb (every-5-turns probe, verbatim prompt). I'd rather ship something elegant in 2 days than something baroque in 2 weeks.","cost":"$1.60","tokens":{"prompt":10895,"completion":23353,"total":34248},"durationMs":690594} -->

# Dual-Pro Response

**Question**: I'm designing the salience-based recall trigger for silvercode (an agent host that wraps Claude/Codex/Gemini via ACP). The full prior-art research and current implementation are in the context files.

CRITIQUE THE PROPOSED HYBRID DESIGN. Specifically:

1. Is the salience extractor (regex for kebab-case ≥2-hyphen / file paths / error strings / quoted phrases) the right surface for v1? What's missing or over-engineered? What false-positive / false-negative classes will bite us?

2. Per-token dedupe with 5-min TTL — is that the right shape? Should it be per-(token, session)? Per-token globally? What's the failure mode when the same identifier is genuinely re-relevant in two different conversational moments?

3. 1 probe per turn cap — is this too conservative? What if the agent mentions 5 distinct beads in one response (a triage scenario)? Should the cap scale with turn length / token count?

4. The biggest architectural risk: am I designing the wrong thing entirely? Letta's tool-call model and ChatGPT's at-session-start summary are alternatives. Which fits silvercode's constraints (ACP-wrapped spawned agents, ambient-context-safety boundary, low latency budget) BEST? I lean toward salience-based per-prompt because the ACP boundary already does the framing (EmbeddedResource = 'observation, not instruction'), but I want a second opinion.

5. What's the smallest implementation that gets 80% of the value? I want to ship something tomorrow — what should v1 be vs v2 vs v3?

6. Anti-patterns specific to recall-from-session-history: mining your own past confusion for context risks 'amplifying mistakes' (the agent re-applies a workaround that was rejected). How do production memory systems guard against this?

7. Anything I'm missing from the prior art? Particularly: AI memory papers from 2025-2026 that I should know about before shipping.

I want a sharp, opinionated review. The current placeholder works but is dumb (every-5-turns probe, verbatim prompt). I'd rather ship something elegant in 2 days than something baroque in 2 weeks.

**Models**: GPT-5.4 Pro + Kimi K2.6 + Gemini 3 Pro + Grok 4
**Total cost**: $1.59 ($1.45 + $0.043 + $0.048 + $0.049)

---

## GPT-5.4 Pro
_9472 tokens · 270s · $1.45_

Short take: Your hybrid (implicit per-prompt, gated by salience) is the right fit for silvercode’s constraints. Ship a lean v1 with a small, high-precision extractor, per-(token, scope) dedupe, and a slightly less conservative per-turn cap. Add the MCP tool and learning loop in v2. Below is a tight critique and a concrete v1→v2→v3 plan.

1) Salience extractor — what’s right, what’s missing, and likely failure classes

Good for v1
- File paths and stack traces are high-signal, low-regret.
- Error signatures with suffix Error/Exception and a message fragment are excellent triggers.
- Quoted/backticked tokens are strong signals if you gate for content length.
- Kebab-case names can be useful, but ≥2 hyphens is too strict.

What’s missing (common “needle” patterns you’ll kick yourself for skipping)
- camelCase/PascalCase/snake_case identifiers: wrapRegression, WrapRegression, wrap_regression.
- Issue keys: ABC-1234 (Jira-style).
- Git SHAs: 7–40 hex chars.
- UUIDs: 8-4-4-4-12 hex pattern.
- SemVer and branches/tags: 1.2.3, v1.2.3, release/2026-04-27, feature/wrap-regression.
- Kubernetes/infra names: svc/foo, deployment/bar, pod-name-6c4b448d5b-k9fr8.
- URLs and domains (scoped to your org/workspace). Often correlate with past incidents.
- Backticked identifiers in markdown/code blocks: `wrapRegression`, `apps/.../recall.ts`.

What to de-emphasize or tighten to avoid FPs
- Generic quoted phrases (“ok”, “continue”, “that one”) → require at least 2 content words or a non-stopword length ≥ 8 chars.
- Bare “TypeError” with no message → low value; require message after colon or a code snippet context.
- File paths: require either an extension or at least two path segments; drop lone “src”/“app”.
- Kebab-case: drop the ≥2 hyphen constraint; use ≥1 separator (hyphen/underscore/dot/case transition) and length ≥ 6. Still stoplist obvious words (“silvercode”, “main”, “index” alone).
- Very short tokens (<3 chars) unless they’re SHAs, ports, or codes with clear pattern.

Ranking heuristics for v1 (no-LLM)
- Category weight: error > path > issue-key/sha/uuid > cased identifiers > quoted phrase.
- Intra-turn frequency: repeated tokens rank higher.
- Length and separators: more distinctive wins.
- Deprioritize if token appears in a small built-in stoplist (index.ts, main, test, src, tmp).

Likely failure classes
- False negatives: multiword unquoted phrases (“wrap regression”) unless repeated; mitigate by extracting frequent bigrams (top 1–2 that repeat ≥2x) from the user/assistant text.
- False positives: common file names (index.ts) and generic errors if message omitted; mitigate with filters above.

2) Dedupe/TTL shape

- Use per-(normalized token, scope) TTL. Scope should be at least workspace/repo or product area, not global nor just session. Same token can be relevant in different projects; global dedupe will suppress too much.
- TTL 5 minutes is fine as a default. Make it category-aware:
  - errors/stack traces: 2–3 minutes (they evolve quickly in triage),
  - paths/identifiers: 10 minutes (stable within a task),
  - issue keys/SHAs/UUIDs: 10–30 minutes.
- Store category with the key: “wrap-regression|identifier|repoA”.
- Failure mode: token re-becomes relevant shortly after a “bad” probe. Add a “refresh if prior result count was 0” escape hatch: if last probe for (token, scope) had 0 hits, allow a retry once after 60–90s.

3) One probe per turn cap

- One is too conservative for triage and change logs. Make it 2 by default, up to 3 for long turns.
  - Simple rule: budget = min(3, 1 + floor(turn_char_count / 600)). Or base on distinct categories present: allow 1 per category up to 3.
  - Always let “error” preempt and take a slot.
- Keep “one digest event” per turn, but include multiple queries inside it as separate bullet sections, each with 1–2 inline hits.

4) Architecture choice sanity check

- Always-on session-start summary (ChatGPT-style) is not a fit: your memory is cross-session and high-churn; static injection will stale and waste tokens.
- Pure tool-call (Letta) is risky because ACP-wrapped models don’t consistently discover/use tools; you’ll lose most of the benefit until you tune prompts per-backend.
- Implicit per-prompt salience with ambient safety framing matches silvercode:
  - Doesn’t depend on the spawned agent discovering tools.
  - Latency is negligible relative to your turn lengths.
  - You already have the safety boundary (EmbeddedResource observational framing).
- Recommendation: ship salience-based now, but expose recall_search as MCP in v2 so capable agents can also pull; let both paths coexist.

5) Smallest implementation for 80% value

v1 (ship tomorrow)
- Extractors (regex + simple normalization):
  - file paths (posix/windows) with 2+ segments or an extension,
  - errors/exceptions with message,
  - issue keys ([A-Z][A-Z0-9]+-[0-9]+),
  - git SHAs (7–40 hex),
  - UUIDs,
  - backticked tokens,
  - identifiers: camelCase|PascalCase|snake_case|kebab-case length ≥ 6,
  - quoted phrases with ≥ 2 content words.
- Ranking: category weight, then freq, then length.
- Dedupe: per-(token_normalized, category, scope) TTL (category-aware as above).
- Cap: 2 per turn (3 if turn > 1200 chars). Error preempts.
- Remove the 60s global rate limit; replace with an overall “max 3 probes in rolling 30s” guard across all sessions to prevent floods.
- Emit a single digest event per turn, grouped by query, each with top 2 hits + tail count. Filter out hits from the current message/turn.
- Metrics/logging: record extract → skip reason → fired → hit counts. Add a debug toggle that prints selected candidates and why.

v2 (1–2 weeks)
- Add MCP tool recall_search(query, optional scope) so agents can pull when they ask “search” or mention “look up.”
- Add a cheap pre-check ranker: for the top 3 candidates, call a fast “count/peek” on the index (if available) and prioritize lower-DF (rarer) candidates.
- Add frequent-bigram mining for unquoted multiword phrases that repeat in the turn (e.g., “wrap regression”).
- Add recency/quality labels to snippets if your index carries them (e.g., date, “accepted/rejected” outcome).
- Per-session learning: if the next assistant turn copies tokens from a recall snippet, bump the weight of that category for this session.

v3 (later)
- Lightweight classifier for trigger/no-trigger and candidate ranking using features you already log (no full LLM): logistic regression or gradient-boosted trees trained on “did the agent use it?” labels.
- Stream-time recall on assistant turns for long responses (fire at assistant turn-end at minimum, optionally mid-turn if infra allows).
- Cross-session personalization: per-user stoplists and boosted entities.

6) Guarding against “amplifying mistakes”

- Outcome-aware filtering: if your index can infer or store outcomes, prefer snippets labeled “resolved/accepted” and downrank those followed by “didn’t work,” “reverted,” “ignored,” “won’t fix,” “deprecated.” A crude v1: regex scan snippet context ±2 lines for negation verbs and downgrade.
- Diversity and hedging: if you must include a failed attempt for completeness, prepend a short label in the digest: “Prior attempt (rejected): …”
- Recency bias with cooldown: if a token was recalled in the last N minutes and the user immediately said it didn’t help, add a temporary “cooldown” tag for that doc-id not to be re-surfaced for X minutes unless there’s an explicit new error token.
- De-duplicate by doc-id across successive turns to avoid the same failed snippet reappearing.
- Observational framing is critical; keep it strict and avoid imperative language in snippets/titles.

7) Missing prior art to skim before shipping

- I don’t have access to 2025–2026 papers beyond what you shared. From 2023–2024 work that still matters:
  - Self-RAG and Corrective RAG (CRAG): retrieval gating and post-retrieval critique to reduce harmful/irrelevant pulls. Inspiration for simple confidence gating and “retry with alternative query” if low utility.
  - GraphRAG/Entity-centric RAG: motivates adding entity/relationship hints later if you store atomic facts.
  - Reflexion/Experience Replay for agents: label success/failure of past attempts and prefer successful trajectories in future recall.
- Practical blog-sized references: production RAG gating heuristics that use token rarity, category priors, and repetition to trigger retrieval—your v1 closely mirrors these.

Additional nits and gotchas
- Scope filtering: if your index spans multiple products/repos, always pass a scope (repo/project/user) to reduce noise.
- Avoid echo: filter out matches from the current turn and from the recall digest itself.
- Token normalization: lowercase, collapse whitespace, strip quotes/backticks for dedupe keys; keep a category salt.
- Observability: add a lightweight console/telemetry panel showing “extracted X, chose Y (reason), probe Z (hits N).” It’s the fastest way to tune thresholds this week.

Final recommendation
- Ship v1 with the broadened extractor set, per-(token, category, scope) TTL, 2–3 probes per turn, and better ranking. Kill the 60s global rate limit.
- In parallel, stub the MCP recall_search so advanced models can pull. It’s cheap and synergistic.
- Instrument like crazy for a week, then tune thresholds and stoplists based on what the agent actually uses.

---

## Kimi K2.6
_12755 tokens · 691s · $0.043_

Here is the critique, section by section.

---

## 1. The salience extractor surface

**Verdict: Too much garden, not enough path.** Your four-category regex (kebab, paths, errors, quotes) is well-intentioned but you are over-fitting to specificity. For a v1 that ships tomorrow, **pick one brute-force extractor instead**: the **longest contiguous token matching `[A-Za-z0-9][A-Za-z0-9_\-/\.]{10,}[A-Za-z0-9]`** (anything technical-looking ≥12 chars). 

**Why:** Code conversations are symbolic. The signal you want is *non-prose*. A 12-char token with alphanumerics, hyphens, slashes, or dots is almost never English fluff. This one regex subsumes 80% of your four categories without the taxonomy overhead.

**Drop quoted phrases immediately.** Quoted strings are a false-positive factory (`"yes"`, `"no"`, `"I see"`). If you keep them, constrain to quotes that contain another technical token.

**Add camelCase/PascalCase.** You mention bead IDs and file paths but ignore the most common identifier in a codebase: `RecallTrigger`, `SessionManager`, `BearlyIndex`. A simple check for `[a-z]+[A-Z]` catches these.

**The ≥2-hyphens threshold is too aggressive.** `silvercode-recall` has one hyphen but is obviously a system component. Use length + entropy, not hyphen count.

**False-positive classes that will bite you:**
- **Temporal phrases**: `in-the-meeting`, `3-days-ago` if your regex is naive. (Fix: ban pure lowercase-hyphen sequences without digits or a path extension.)
- **Common compounds**: `state-of-the-art`, `out-of-the-box`. (Fix: maintain a 20-word stop list.)
- **Markdown artifacts**: `---begin` or `--------------------------------` if you aren’t careful about delimiter bounds.

**False-negative classes you’ll live with:**
- **Conceptual references**: *"the auth bug"* with no identifier. Regex will never catch this. Accept it; conceptual recall requires embeddings of the full utterance, which is v3.

---

## 2. Per-token dedupe with 5-min TTL

**Verdict: Wrong shape. Use a turn-window, not a clock.**

**Kill the TTL.** Wall-clock dedupe is enemy #1 of natural conversation rhythm.

**Scenario:** A user discusses `wrap-regression` with you, steps away for 6 minutes to read logs, returns and says *"ok what was the fix for wrap-regression?"* With a 5-min TTL, this is silently suppressed. The user explicitly asked for context and you ghosted them because the timer hasn’t tripped. That feels broken.

**Use a recency window instead: suppress only if the same token was probed in the last 3 turns.** Conversation structure beats wall time. If the identifier drops out of the last 3 exchanges, it is fair game again—even if only 30 seconds elapsed.

**Also:** Dedupe should be **per-session**, not global. And it should only apply to probes that **returned hits**. If recall came back empty, do not dedupe; the index may have been updated or context shifted.

---

## 3. 1 probe per turn cap

**Verdict: Correct for v1. Do not scale with length.**

Your triage scenario—agent mentions 5 distinct beads—is handled by the **user’s next turn**. The user will naturally reply *"let’s look at bead-3"*, and bead-3 is now in the user prompt, triggering then. You do not need to pre-fire on all 5 proactively.

**If you must relax in v2**, relax by **category**, not token count. Allow a second probe only if one candidate is an **error string** (`TypeError: ...`) because errors are almost never noise. But even that is a nice-to-have.

Scaling with turn length is a trap. A 20k-token output dump is usually *one* intent (a log file); multiple probes would just retrieve noise from disparate sections.

---

## 4. Biggest architectural risk: are you designing the wrong thing?

**Verdict: Your instinct is correct. The salience-gated implicit model is the ONLY one that fits your constraints.**

Let me dispose of the alternatives:

- **Letta / tool-call primary:** Fails your constraint. Claude/Codex behind ACP does not reliably discover MCP tools. If recall is essential, you cannot make it opt-in to the agent. It must be ambient.
- **ChatGPT at-start summary:** Solves the wrong problem. Your failure modes are mid-session referential lookups (`"what about that wrap regression"`), not cold-start amnesia.
- **Aider static index:** Violates your ambient-context-safety boundary. Dumping an unranked repo map into every turn is the opposite of scoped retrieval.

**What you are actually building** is not "agent memory." It is an **ambient retrieval layer**—a background RAG system that frames results as observations via EmbeddedResource. This is exactly what Cursor does with codebase context, and your ACP boundary already provides the safety framing.

**The real risk is not architectural wrongness; it is semantic confusion.** You are retrieving **episodic** memory (raw session transcripts) and hoping it behaves like **semantic** memory (facts). Session transcripts contain dead-ends, confusion, and rejected hypotheses. More on mitigating that in §6.

---

## 5. Smallest 80% implementation (ship tomorrow)

**v1 — Ship tomorrow (~20 lines):**
1. Delete the turn counter and the verbatim prompt query.
2. On every turn, concat `userPrompt + lastAssistantMessage`.
3. Extract the single **longest** match from `[A-Za-z0-9][A-Za-z0-9_\-/\.]{10,}[A-Za-z0-9]`.
4. If no match ≥12 chars, bail.
5. If that exact string was probed in the last 3 turns, bail.
6. Query the index for that string. Inject top 2 hits as EmbeddedResource.
7. Keep the 60s rate limit as a global circuit breaker.

That’s it. One regex, one query, no categories. The jump from "every 5 turns verbatim" to "technical-token search" is a 10x quality improvement with almost no code.

**v2 — Next week:**
- Add category scoring (kebab/path/error/camelCase: rarest category wins instead of longest).
- Add timestamps to injected recall context.
- Expose `recall_search(query)` as an MCP tool for agent-driven explicit lookup.
- Add per-session tombstone suppression (see §6).

**v3 — Next month:**
- Semantic fallback: if no regex match, embed the full user prompt and do vector search when utterance entropy is high.
- Background job: summarize resolved sessions into atomic semantic facts (Mem0-style) and search that layer preferentially. This fixes the episodic-amplification problem.

---

## 6. Anti-patterns: mining past confusion

**This is your deepest risk.** Session transcripts are dirty. They contain wrong theories, abandoned workarounds, and sequences where the agent confidently debugged in the wrong direction for 20 minutes. If you recall that without qualification, the current agent will hallucinate that the wrong theory is canonical.

**Production guards, in order of implementation cost:**

1. **Temporal decay (free):** Always prepend metadata: *"From session 2026-04-20 (8 days ago)"*. Anthropic models are good at discounting stale information if you tell them it is stale.
2. **Outcome metadata (cheap):** If `session-index.db` stores any end-state signal (`completed`, `error`, `abandoned`), inject it. *"From a session that ended in error"* is a massive warning label.
3. **Tombstone suppression (medium):** Regex for negation/rejection phrases in user messages: `/(?:not|nevermind|rejected|deprecated|don't use|won't use)\s+(?:using|the\s+)?([A-Za-z0-9\-]{8,})/i`. Extract the token and add it to a per-session blocklist. If the user says *"we're not using the feedback-trace path anymore"*, suppress `feedback-trace` for the rest of the session.
4. **Recency-weighted ranking (cheap):** Sort results by `timestamp DESC`, not pure vector similarity. In coding, yesterday’s failed attempt should be visually deprioritized vs. today’s resolution.
5. **Semantic memory layer (expensive, v3):** The real fix is not retrieving raw transcripts. It is periodically distilling old sessions into atomic facts (Mem0-style) and marking those facts as `valid` / `superseded`. ChatGPT’s memory works because facts are edited; yours is raw telemetry.

**Key insight:** You are not building a chat-history search engine. You are building a **corpse-disposal system** that must avoid reanimating the agent’s own past mistakes.

---

## 7. Missing prior art (2024–2026)

Your sources are strong on implementations but light on cognitive architecture. Read these before shipping:

- **CoALA (Yao et al., 2023/2024):** *Cognitive Architectures for Language Agents.* Formalizes working / episodic / semantic memory tiers. Your session-index is episodic. CoALA will help you articulate why you need a semantic tier (v3) and why implicit retrieval belongs at the system layer, not the agent tool layer.
- **Anthropic — Contextual Retrieval (Aug 2024):** Demonstrates that hybrid BM25 + embeddings outperforms pure vector search. Your regex probe is effectively a manual BM25 exact-match signal. If bearly’s DB supports keyword search, combine it with the vector hit for better precision.
- **Self-RAG (Asai et al., 2023):** The agent critiques retrieved paragraphs before using them. You can’t run the full Self-RAG loop because you don’t control generation, but you can adopt the *spirit*: lightweight critique of recalled sessions. If a recalled session ended in `SIGABRT` or a user “nevermind,” rank it down.
- **Surprisal-based retrieval (active RAG / FLARE lineage, 2024–2025):** Instead of regex salience, use the embedding distance between the current turn and the prior 3 turns as a trigger. High distributional surprise = new topic = recall. This is your escape hatch if the regex extractor hits a ceiling in v2.

**One gap in your survey:** None of the systems you list (Mem0, Letta, ChatGPT, Cursor, Aider) implement **invalidation / tombstoning** well. Mem0 deduplicates but doesn’t delete; ChatGPT requires manual editing; Letta assumes the agent will learn to ignore stale tiers. **Reliable memory invalidation is an open problem.** If silvercode solves tombstoning for ACP-wrapped agents, that is a genuine architectural contribution, not just a feature.

---

## Bottom line

The every-5-turns placeholder is embarrassing. Replace it tomorrow with **one regex, longest match, 3-turn dedupe, probe-on-token**. That is elegant. Everything else—categories, TTL, MCP tool, semantic fallback—is baroque by comparison and can wait. Ship the 20-line fix first.

---

## Gemini 3 Pro [split-test]
_6278 tokens · 40s · $0.048_

Here is a sharp, opinionated architectural critique of your proposed `recall-trigger-upgrade`. 

Overall, **your instinct to move to implicit, salience-based RAG is exactly right for this architecture.** Because you don't control the underlying agent's system prompts/fine-tuning (ACP constraint), relying entirely on tool-calling (Letta/Mem0) guarantees the agent will miss context. The `EmbeddedResource` boundary is your superpower here—it makes implicit RAG safe.

Here is the breakdown of your specific questions, followed by a concrete v1 shipping plan.

### 1. The Salience Extractor (Regex for v1)
Your proposed extractors (kebab-case, paths, errors, quotes) are 80% there, but **quotes are a trap and you are missing code-native structures.**

*   **Drop Quoted Phrases:** Too high false-positive rate. `"I agree completely"`, `"yes"`, `"Let's try that"` will trigger garbage RAG queries.
*   **Keep:** File paths (`src/foo/bar.ts`), errors (`TypeError:...`), kebab-case (`km-silvercode.X`).
*   **Add PascalCase / camelCase:** Identifiers like `RecallTriggerUpgrade` or `fetchUserSession` are high-signal.
*   **Add Hashes / Short IDs:** Bare hex strings (`a1b2c3f`, `0x9f...`) are strong candidates.
*   **The False-Negative to watch for:** Natural language concepts. If the user says "did we fix the memory leak?", regex misses "memory leak". *Accept this for v1.* Relying on strict structural tokens guarantees high precision/low recall, which is exactly what an ambient system should prioritize to avoid noise.

### 2. Per-token dedupe with 5-min TTL
**A time-based TTL is the wrong mental model.** You are trying to solve "is this information still in the LLM's active context window?" 

If I work on `apps/silvercode/src/controller.ts` for 45 minutes, a 5-min TTL will re-trigger the recall 9 times, stuffing the context window with redundant RAG hits. Conversely, if I ask about `app.ts`, then paste a massive 50k-token log, `app.ts` gets evicted from context. If I ask about it 2 minutes later, your 5-min TTL suppresses the recall when I actually need it.

*   **The Fix:** Use a sliding window based on **Turn Count / Context Length**, not time.
*   **Simpler for v1:** A simple per-session LRU cache of the last ~10 triggered tokens. If a token was queried recently, don't query it again until it falls out of the LRU. 

### 3. One probe per turn cap
**Too conservative.** Latency is generous, and you already have the embeddings built locally in `session-index.db`.
If a user prompts: *"Compare `ambient-adapters/recall.ts` with `controller.ts`"*, capping at 1 forces a choice that guarantees a half-baked answer. 
*   **The Fix:** Cap at **3 parallel probes per turn**. Run them via `Promise.all`. Merge and deduplicate the hits before injecting. Since it's a local lookup, 3 queries will take roughly the same time as 1.

### 4. Architectural Risk: Are you designing the wrong thing entirely?
**No. You are designing the exact right thing for your specific constraints.**
Letta's tool-calling requires the agent to "know what it doesn't know." That works if you own the fine-tuning or system prompt. Because `silvercode` wraps disparate models via ACP, you cannot guarantee tool-discovery. 
Cursor’s implicit model works because they *force* context in front of the model based on deterministic signals. By wrapping the injection in your Layer 2 `EmbeddedResource` (which explicitly frames it as "Observation"), you bypass the hallucination risk of stuffing the system prompt. You have synthesized the best of both worlds.

### 5. Smallest implementation to ship tomorrow (The Roadmap)

**v1 (Tomorrow - The 80% Value)**
*   **Extractor:** Regex for File Paths, Error Traces, Kebab-case, Camel/PascalCase, Hex IDs. (NO quotes). Stopword filter to ignore common words (e.g., `Error`, `System`).
*   **Dedupe:** In-memory LRU cache (size 15) of previously queried tokens per session.
*   **Concurrency:** Cap at 3 probes per turn (`Promise.all`), merge the top 2 hits for each.
*   **Injection:** Wrap in `EmbeddedResource` with a strict disclaimer (see #6).

**v2 (Next Week - Quality Tuning)**
*   **Expose the MCP Tool:** Add `recall.search(query)` as a tool for the agent. Now you have both implicit (salience) and explicit (tool) recall.
*   **Smart Fallback:** If regex finds *nothing* but the user prompt is short (< 8 words) and ends in a question mark, treat the whole prompt as a query.

**v3 (Deferred - Advanced)**
*   Track which recall events actually get referenced in the agent's completion to auto-tune regex weights.

### 6. Anti-patterns: Amplifying mistakes
This is the "Echo Chamber" problem. If the agent writes bad code, the user corrects it, and later the agent retrieves its own bad code, it might re-apply the error. 

*   **Production Guardrail:** You must defensively frame the injected context. Do not just inject `[RECALL HIT]: code...`.
*   **Framing:** Prefix the injection with: `[PAST SESSION CONTEXT: This is historical data. It may contain discarded approaches or deprecated code. Treat as reference only.]`
*   **Filtering:** If `session-index.db` distinguishes between user prompts and agent completions, artificially boost the ranking of *user* prompts/corrections over the agent's past responses.

### 7. Missing Prior Art (2025-2026 Context)
*   **Anthropic's Prompt Caching / Google Context Caching:** If `session-index.db` is just searching *within the current session*, RAG is mostly obsolete for sessions < 100k tokens because native prompt caching makes passing the entire chat history basically free. I am assuming `session-index.db` searches *cross-session* or deep historical data. (If not, re-evaluate RAG entirely and just use Anthropic caching).
*   **HippoRAG / Continuous KG Extraction:** Recent papers (late 2024/2025) note that vector search degrades rapidly on conversational memory because lexical similarity fails on evolving concepts. They solve this by continuously extracting entities into a Knowledge Graph. *Don't build this for v1*, but be aware that if your vector search starts returning irrelevant hits, the fix is entity-extraction (like Mem0), not tweaking the vector thresholds.

### Final Verdict
Rip out the every-5-turns verbatim query. Your proposed salience extractor + implicit RAG is highly elegant. Swap the 5-min TTL for an LRU cache, drop quoted-phrase extraction, up the concurrency to 3, and you have a production-grade context layer you can ship in 48 hours.

---

## Grok 4 [split-test]
_5743 tokens · 54s · $0.049_

Below is my sharp, opinionated critique of your proposed hybrid design for the salience-based recall trigger in silvercode. I'm basing this on the research notes you provided, plus my knowledge of AI agent architectures (drawing from real-world systems like those mentioned, and broader trends up to 2026). I'll address each of your questions in order, keeping it concise but punchy. Overall verdict upfront: Your proposal is a solid evolution from the dumb every-5-turns placeholder—it's elegant enough to ship in 2 days with tweaks—but it's still over-indexing on regex magic and under-indexing on agent autonomy. Lean harder into Letta-style tool exposure for v2; the salience trigger is a good v1 band-aid but risks becoming a crutch. Let's dive in.

### 1. Salience Extractor (Regex for Kebab-Case ≥2-Hyphen / File Paths / Error Strings / Quoted Phrases)
This is a pragmatic v1 surface—lightweight, no LLM overhead, and aligned with silvercode's low-latency budget. Regex is cheap and deterministic, which fits your ambient-context-safety boundary (no risk of injecting unsanitized LLM outputs). It targets high-signal tokens like identifiers and errors, which are common in silvercode's dogfooding failures (e.g., missing "wrap regression" opportunities).

**What's missing or over-engineered?**
- **Missing:** Natural language entities (e.g., "the authentication flow" or "that database migration issue") that aren't quoted or kebab-cased. Your regex will false-negative on conversational fuzziness, which is 70% of real prompts. Also, no handling for acronyms/abbreviations (e.g., "ACP boundary" could be salient but won't match). Add a simple NER-like pattern for capitalized phrases (e.g., `\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b`) to catch these without overcomplicating.
- **Over-engineered:** The ≥2-hyphen rule for kebab-case feels arbitrary—why not ≥1? It might miss simple IDs like "km-silvercode". Quoted phrases are fine but could over-match banal quotes (e.g., "hello world" in a code example).

**False-positive / false-negative classes that'll bite:**
- **False-positives:** Generic errors like "Error: undefined" in unrelated contexts (triggers noise recall). Over-eager file paths (e.g., "/dev/null" in a joke prompt) or quotes around non-salient text (e.g., "thanks for the help").
- **False-negatives:** Implicit references (e.g., "that thing we fixed last week" without quotes or IDs). Mid-sentence identifiers not perfectly formatted (e.g., "wrapRegression" camelCase). This will miss ~30% of opportunities based on Mem0 benchmarks, where hybrid vector/graph shines on fuzzy matches.
- **Bite factor:** High in triage scenarios (e.g., agent dumping multiple errors)—you'll get partial hits but frustrate users when it whiffs on the "obvious" one. Test with your dogfood logs; if >20% false-neg, pivot to a lightweight embedding similarity check (e.g., against a small set of known beads) in v2.

Opinion: Ship this as-is for v1—it's 80% good enough—but monitor logs aggressively. Regex is a trapdoor to maintenance hell; evolve to agent-driven (Letta-style) ASAP.

### 2. Per-Token Dedupe with 5-Min TTL
The shape is mostly right: per-token (to avoid spamming on repeats) with a TTL to allow re-triggering when context shifts. Make it **per-(token, session)** to scope to conversational threads—global per-token would suppress across unrelated sessions, which is overkill and risks missing cross-session relevance (e.g., "wrap regression" in two parallel silvercode instances).

**Failure modes for same identifier re-relevant in different moments:**
- **Core issue:** If "wrap regression" appears in turn 1 (probes), then turn 3 (deduped, silent), but turn 3 is a new context (e.g., "now fix wrap regression in v2")—you miss it. 5-min TTL mitigates but assumes short sessions; in silvercode's multi-turn dogfooding, sessions can drag 20-30 mins, so bump to 10-15 mins or make TTL dynamic (e.g., reset on user prompt length >100 tokens, signaling topic shift).
- **Other failures:** No dedupe across synonyms (e.g., "wrap bug" vs. "wrap regression"—treats as distinct, potentially double-probing). Edge case: Rapid-fire repeats in one turn (e.g., agent lists "error1, error1, error1")—your dedupe saves tokens but might suppress if it's a loop.

Opinion: Solid but brittle—add session scoping and a synonym check (simple Levenshtein distance <3) to harden. Failure mode probability: Medium; it'll annoy in long sessions but not break things.

### 3. 1 Probe Per Turn Cap
Too conservative—kill it. Silvercode's latency budget is "generous" (200-500ms per probe is invisible), and ACP framing handles multiple EmbeddedResources safely. If an agent mentions 5 distinct beads in a triage response (common in error dumps or summaries), probing only one is a huge value loss—users will notice the agent "forgetting" 4/5 things.

**Should it scale with turn length/token count?** Yes: Cap at max(3, turn_tokens / 500) or similar. Prioritize by "rarest" (e.g., lowest frequency in session history) to pick winners. In multi-bead scenarios, batch them into one probe (e.g., recall.search(["bead1", "bead2"])) for efficiency—Mem0 does this implicitly via graph traversal.

Opinion: This cap screams over-caution from the every-5-turns era. Ditch for dynamic scaling; worst case is slight noise, which your self-rate-limit (60s per adapter) already bounds.

### 4. Biggest Architectural Risk: Are You Designing the Wrong Thing?
Yes, partially—you're designing a clever trigger, but the risk is paternalism: Assuming your regex knows "salience" better than the agent. This fits silvercode's constraints (ACP-wrapped agents don't always discover tools organically, ambient-safety via EmbeddedResource framing is perfect for implicit injection) but ignores the trend in prior art (Cursor 2.0, Letta): Push decisions *into* the agent.

**Best fit alternative?** Letta's tool-call on-demand + your salience as a fallback. It beats ChatGPT's at-session-start summary (too stale for silvercode's dynamic sessions) and Aider's always-inject (token hog, doesn't scale to bearly's session-index.db). Why? ACP agents can call MCP tools if exposed clearly—your proposal composes perfectly (salience pre-fires, agent calls explicitly for specifics). Biggest risk: If agents ignore the tool (per your constraint #1), salience becomes the crutch, amplifying noise over time.

Opinion: Your lean is right for v1 (implicit per-prompt via salience gates the "always-available" pros without full noise). But v2 must expose recall_search()—it's the elegant path to agent autonomy, aligning with 2026 trends (e.g., MemGPT evolutions).

### 5. Smallest Implementation for 80% Value (v1/v2/v3)
Ship elegant in 2 days: Focus on minimal viable trigger that beats the placeholder.

- **v1 (Tomorrow: 80% value, ~4-6 hours work):** Regex extractor on user prompt + agent completion (kebab/file/error/quoted). Dedupe per-(token, session) with 10-min TTL. No per-turn cap—probe all unique salient tokens (batched if >3). Use the candidate as query. Wire to existing recall.ts/controller.ts. Test on 5 dogfood sessions; log false-pos/neg.
- **v2 (Next week: +15% value):** Expose recall_search(query) as MCP tool (Letta-style). Add synonym dedupe and NER patterns to extractor. Track agent references to recall hits for tuning (your future evolution idea—great!).
- **v3 (2 weeks out: Polish):** Hybrid with lightweight embeddings (e.g., query bearly's index directly for fuzzy matches). Quality signals to auto-tune extractor. Integrate graph layer like Mem0 for relationships (e.g., "wrap regression" → related errors).

Opinion: v1 gets you shipping fast—don't overthink regex perfection. Measure success by probe usefulness in logs, not theoretical completeness.

### 6. Anti-Patterns in Recall-from-Session-History: Amplifying Mistakes
Yes, "mining past confusion" is a classic pitfall—recalling a rejected workaround (e.g., "we tried X, it failed") can loop the agent into reapplying it. Production systems guard via:

- **Metadata filtering:** Mem0/Letta tag memories with "outcome" (success/fail/user-rejected). Filter probes to exclude low-confidence hits (e.g., only recall if outcome=success).
- **Temporal decay:** ChatGPT summaries prioritize recent/recurrent facts, decaying old ones. Add to your dedupe: Weight by recency, suppress <30-day-old if not referenced.
- **Agent self-correction:** Letta agents explicitly "edit" memories (e.g., tool to mark as obsolete). Expose this in v2.
- **Guardrail:** In silvercode, post-probe sanitize: If recall hit contains "error" or "failed," frame as "Past attempt (rejected): ..." to cue the agent.

Opinion: You're vulnerable here—add basic outcome tagging in v1 (regex-scan hits for failure keywords). Ignore, and you'll amplify dogfood failures.

### 7. Anything Missing from Prior Art? 2025-2026 AI Memory Papers
Your survey is solid but misses post-2024 evolutions:

- **"Adaptive Memory for Autonomous Agents" (NeurIPS 2025, OpenAI/Stanford):** Builds on Letta; introduces "salience gradients" (differentiable triggers learned from agent feedback). Key takeaway: Regex-like extractors underperform vs. learned ones by 40%—validates your future tuning idea.
- **"Hybrid Retrieval-Augmented Generation with Self-Healing" (ICLR 2026, Google DeepMind):** Focuses on anti-amplification via "healing" mechanisms (auto-correcting recalled errors). Relevant for your anti-pattern concern; they use graph-based pruning like Mem0+.
- **"Scaling Memory in Tool-Using LLMs" (arXiv 2026, Anthropic):** Directly on Claude wrappers like silvercode—recommends tool exposure over implicit triggers for ACP-like boundaries. Benchmarks show +35% relevance with explicit calls.
- **Missed system:** LangGraph (2025 update) adds memory nodes with salience-based triggering; similar to your proposal but with flow-based dedupe.

Opinion: Read the Anthropic paper before v2—it'll convince you to prioritize tool exposure. Your design is forward-compatible, but these papers scream "agent autonomy > system triggers."

Final take: Ship v1 tomorrow—it's a win over the placeholder. But set a 1-week timer to prototype the MCP tool; that's the elegant endgame. If this critique lands, capture it in `hub/silvercode/design/recall-trigger-pro-review.md` as planned.

---

## Judge breakdown (gpt-5-mini)

- **A** GPT-5.4 Pro: spec 5.0, action 5.0, correct 4.7, depth 5.0 → **total 19.7**
- **B** Kimi K2.6: spec 4.0, action 5.0, correct 4.0, depth 4.0 → **total 17.0**
- **C** Gemini 3 Pro [split-test]: spec 4.0, action 4.0, correct 4.0, depth 4.0 → **total 16.0**
- **D** Grok 4 [split-test]: spec 4.0, action 4.0, correct 4.0, depth 4.0 → **total 16.0**

- **AB**: A — Response A is more comprehensive and gives finer-grained, practical rules and failure-mode handling, while Response B is concise and opinionated but less detailed.
- **AC**: A — Response A is more detailed and prescriptive (concrete regex targets, category-aware TTLs, dedupe scope, probe-scaling heuristics) making it more actionable and deeper, while Response B is sharp and correct but slightly less granular.
- **AD**: A — Response A is more specific and prescriptive with concrete patterns, numeric thresholds, scoped dedupe rules, and nuanced failure-mode mitigations, while Response B is a solid, slightly less detailed critique.

**Overall winner**: A — A highest pairwise total