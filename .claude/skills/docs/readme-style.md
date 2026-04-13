# README & Landing Page Style

Rules for writing package READMEs, landing pages, and similar public-facing docs. These are communication design principles, not formatting rules.

## Core Principles

**Visual weight budget.** Every h2, table, code block, and bullet list costs attention. A README has a fixed budget. Spend it on what moves the reader forward. Each h2 adds visual clutter — use bold inline labels instead when the content is 1-3 sentences.

**Show the thing, not a description of it.** A 30-line commented code example communicates features faster than a 15-bullet feature list. Code is executable truth; bullets are claims.

**One thing, one place.** If a feature is demonstrated in code, don't also describe it in a bullet. Choose the best medium and commit.

**Density without clutter.** `**Bold inline labels**` are dense. `## H2 sections` are voluminous. Same information, different visual weight. Default to merging into existing sections, not splitting into new ones.

**Iterate prose, not structure.** Spend time on word choice and sentence flow. A well-crafted sentence replaces a paragraph. Many small iterations beat one big rewrite.

**Render-aware.** Don't include content that can't render in context — no "colorized output" blocks on GitHub (can't show colors), no interactive elements in static markdown.

**Links at curiosity peaks.** Don't dump links in a "Resources" section at the bottom. Place each link where the reader's curiosity about that topic peaks — comparison link right after a competitive claim, docs link right after a concept mention.

**Kill disclaimers.** "Early release (0.x)" adds doubt without information. The version badge already communicates status.

**Shorten everything, then shorten again.** `computeExpensiveState()` -> `expensiveFunc()`. `{ file: "/tmp/app.log", format: "json" }` -> `{ file: "...", format: "json" }`. Every character costs attention.

## Structure: Progressive Disclosure

The reader should be able to stop at any point having gotten value.

1. **Badges** above the title
2. **Title + tagline** — `# Name — Tagline` or tagline as bold standalone line below
3. **One-paragraph pitch** — what it replaces, why, size/deps
4. **Simple hero example** — 5-10 lines, zero config, hooks the reader
5. **Differentiator explanation** — bold inline paragraph, not an h2. The "aha" moment
6. **Getting Started** — install + full showcase example with comments demonstrating all features
7. **About** — one section combining origin, requirements, limitations, doc links with bold inline labels

## Code Examples

**The hero** — minimal: create the thing, use the thing, done. Zero config where possible. No imports beyond the main package.

**The showcase** — one code block that demonstrates all features through comments. The comments ARE the feature list. Follow with a `console` block (not `bash`) with `$` prompts showing env var / CLI usage.

**Alignment matters.** Align all inline comments to the same column. Misaligned comments create visual noise.

**Short identifiers.** Use `getState()` not `computeExpensiveState()`, `"..."` not `"/tmp/app.log"`.

## Prose

- Full sentences, proper English. No fragments ("Tired of..." "Wanted to...")
- Don't start sentences with numbers or symbols. "~22x faster" -> "In benchmarks, that's ~22x faster"
- Em-dash for asides, not double-hyphen
- One-line compatibility lists with bold label and dot separators: **Works with:** A . B . C . [See all ->](link)

## Keywords & Discoverability

Name competitors and compatible products — someone searching "pino alternative typescript" should find your package. But be confident without being combative. Have a strong opinion about your approach; don't sound over-eager to replace other products. Let the product speak for itself.

- **In the intro**: name categories, not competitors. "Replace `debug` + your JSON logger" not "Replace `pino`/`winston`" — the intro should invite, not provoke
- **In compatibility lines**: name every product you integrate with — respectful and keyword-rich. "Works with: Pino transports, OpenTelemetry, Sentry..."
- **In comparison pages**: this is where people expect head-to-head evaluation. The comparison page is the keyword magnet — link to it from the README
- **In "When not to use"**: name competitors and be honest about their strengths. "Pino's ecosystem is deeper" builds trust and captures search traffic
- **GitHub topics**: add competitor names, category names, and technology names (e.g., `logging`, `typescript`, `structured-logging`, `pino`, `winston`, `opentelemetry`, `observability`)
- **Tone**: confidence comes from showing what you do well, not from claiming others do it worse

## GitHub Repo Description

Different from the README tagline — optimized for scanning in search results. Include: language, key differentiator, what it replaces. End with the punchline.

## Landing Page / Docs Site

Same principles, adapted to the medium:

- **Hero**: name + tagline + CTA. Tagline should be the strongest single sentence from the README
- **Feature cards**: 4 is better than 7. Each card should be a distinct capability, not a restatement. Merge related features (workers + metrics + async context = one card about runtime capabilities)
- **Below the fold**: one showcase example matching the README's Getting Started. Don't duplicate the README's simple hero AND its showcase — pick the showcase
- **Install**: tabbed code group for package managers, not 4 separate blocks

## Process

### Step 1: Identify core messages

Before writing or restructuring, answer: what are the 3-5 things the reader must understand? For loggily these were:

1. One API replaces three tools (debug + JSON logger + timers)
2. The `?.` trick makes disabled logs free
3. One config array, six element types
4. Works everywhere (browser, server, OTel, Pino, etc.)
5. Tiny (3 KB, zero deps)

Write these down. They drive everything — structure, examples, emphasis.

### Step 2: Iterate the phrasing

Spend the most time here. Each core message needs a sentence that captures maximum value in minimum words. Expect 5-10 iterations per sentence. Techniques:

- Generate 10-30 phrasings, pick the best
- Try different framings: feature ("supports OTel"), benefit ("sends anywhere"), contrast ("unlike X")
- Read aloud — awkward transitions, run-on sentences, and weak openings become obvious
- Test at different scales: does it work as a tagline? A feature card? A paragraph opener?

### Step 3: Organize content around messages

Now structure the document so each section serves one or more core messages. Don't organize by "what I know" (reference tables, API surface) — organize by "what the reader needs next" (hook, understand, try, adopt).

### Step 4: Iterate structure

Expect 10-30 small edits, not one perfect draft. Each pass:
1. Compress — can two sections become one? Can a paragraph become a sentence?
2. Elevate — is the best content buried? Move it up
3. Cut — does this earn its visual weight? If not, merge or delete
4. Polish — read aloud. Does it flow? Fix awkward transitions

## Anti-Patterns

- Feature bullet lists longer than 6 items (use the showcase example instead)
- Duplicate examples showing the same thing in different forms
- Reference tables in the README when a docs site exists (env vars, types, API surface)
- Separate h2 sections for 1-3 sentences of content
- Status disclaimers ("early release", "WIP", "beta")
- `bash` language tag for shell invocations (use `console` with `$` prompts)
- Pretty-printed JSON that wastes 5 lines on what fits in 1
- Unaligned comments in code examples
- Links dumped in a bottom "Resources" section instead of placed inline
