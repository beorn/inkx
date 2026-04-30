# Content Quality Review Workflow

Run a comprehensive GPT 5.4 Pro review of a developer documentation site's editorial content.

## When to Run

- After major content additions or restructuring
- Before a public launch or announcement
- Monthly quality check
- After fixing issues from a previous review

## Cost

~$5-15 per review (GPT 5.4 Pro deep research pricing). Budget for 2-3 review cycles per site.

## Steps

### 1. Build Context File

Collect the main content pages into a single context file. Include:
- All index/landing pages (home, features, standards, glossary, about, fundamentals)
- Content JSON files (baselines, frameworks, glossary — sample, not full)
- Analysis sample (first few entries)
- Any page-specific content that was recently changed

```bash
# Example for terminfo.dev:
cat > /tmp/content-review-context.md << 'EOF'
# Site Content Review Context

## Site: [site name] ([url])
## Date: [date]
## Recent changes: [what changed since last review]

---
[paste full content of each page]
EOF
```

### 2. Run Review

```bash
bun llm --deep --model gpt-5.4-pro -y --no-recover \
  --context-file /tmp/content-review-context.md \
  "[Review prompt — see below]"
```

### 3. Review Prompt (Generalized)

Use this prompt template, customizing the [site-specific] sections:

```
Review this developer documentation site for quality improvement.

CONTEXT: This is [site description]. The audience is [target audience].
The site uses [tech stack]. Recent changes: [what changed].

Evaluate across 10 dimensions:

1. CONSISTENCY
   - Terminology: same concepts named the same way everywhere?
   - Formatting: headings, code blocks, tables, links styled consistently?
   - Tone: confident but not arrogant? Technical but accessible?
   - Link styling: all internal links follow the same pattern?

2. CORRECTNESS
   - Factual errors, wrong dates, misleading claims?
   - Over-crediting (attributing inventions incorrectly)?
   - Oversimplified explanations that experts would flag?
   - Numbers in generated text that don't match data?

3. NARRATIVE FLOW
   - Does each page tell a coherent story?
   - Are sections in a logical order?
   - Do pages link to each other in a natural reading path?
   - Is there a clear "start here" → "go deeper" progression?

4. EDUCATIONAL VALUE
   - Would a beginner learn something on each page?
   - Would an expert find it useful (not just correct, but insightful)?
   - Are examples concrete and runnable?
   - Do callouts/asides add genuine value?

5. INTERESTINGNESS
   - Are there engaging historical tidbits?
   - Do origin stories make dry topics come alive?
   - Would someone share this on HN/Reddit/Twitter?
   - Is there a "I didn't know that!" moment on each page?

6. APPROPRIATENESS
   - Is anything oversold ("blazingly fast", "every major terminal")?
   - Is anything undersold (burying the lede)?
   - Bias toward own products vs competitors?
   - Dismissive of other projects/approaches?

7. TYPOGRAPHY & VARIETY
   - Good mix of: prose, tables, code blocks, callouts, examples, links?
   - Or is it monotonous walls of text?
   - Proper em-dashes (—) vs double hyphens (--)?
   - Consistent heading hierarchy?

8. SEO & LINKING
   - Do pages have descriptive meta titles and descriptions?
   - Internal links: are related pages cross-linked?
   - External links: are authoritative sources cited?
   - Are URLs clean and descriptive?

9. MISSING CONTENT
   - What would developers expect to find but can't?
   - What questions does the site raise but not answer?
   - What's conspicuously absent vs competitors?

10. SPECIFIC FIXES
    - Line-by-line suggestions where possible
    - Exact current text → suggested revision
    - Priority: P0 (factual), P1 (structural), P2 (polish)

[SITE-SPECIFIC INSTRUCTIONS — customize per site]

Be critical and specific. Organize findings by page, then by dimension.
Recommend the single most impactful improvement.
```

### 4. Site-Specific Instructions

#### terminfo.dev

```
SITE-SPECIFIC: This is terminfo.dev — a terminal feature compatibility database
("caniuse.com for terminal emulators"). 289 pages, 148 features tested across
7 app terminals and 7 headless backends.

Key content areas to review:
- /features: Terminal Features index (escape sequences, categories, examples)
- /standards: Terminal Standards timeline (ECMA-48 through Kitty, with history)
- /fundamentals: How Terminals Work (control chars, TTY architecture, stty, detection)
- /glossary: 107 terminal acronyms and concepts
- /about: Methodology, "Why not terminfo?", data sources
- /baseline/{core,modern,rich,unicode}: Compliance tiers
- /framework/{silvery,ink,textual,bubbletea,ratatui,blessed}: TUI frameworks
- /terminal/{ghostty,kitty,iterm2,...}: Terminal detail pages + historical terminals
- Auto-linking: glossary-links markdown-it plugin + linkify-content.ts

Previous review found: VT510 "final terminal" error (fixed), escape sequence overclaims (fixed),
xterm/Kitty over-crediting (fixed). Check if these are truly resolved.

Pay special attention to:
- The glossary auto-linking (dotted underline terms) — are they distracting or helpful?
- The analysis blocks — are the auto-generated commentaries accurate and useful?
- The character set / Unicode / Powerline section — is it engaging?
- The fundamentals section — is it the right depth?
- Tooltip popups — are they the right size, positioning, content?
```

#### silvery.dev
```
SITE-SPECIFIC: [customize for silvery.dev when reviewing that site]
```

### 5. Triage Findings

After receiving the review:

1. Classify as P0 (factual — fix immediately), P1 (structural — fix next), P2 (polish — track)
2. Create beads for P0/P1 items
3. Fix P0 items immediately
4. Schedule P1 items for next session
5. Add P2 items to backlog

### 6. Re-run After Fixes

After fixing P0/P1 items, re-run with a follow-up prompt:

```
This is a FOLLOW-UP review. Previous review identified [N] issues.
The following fixes were applied: [list fixes].
Please verify: Are the fixes adequate? Any remaining issues?
What P2 polish items remain? Any NEW issues introduced?
```

### 7. Update Tracker

Record in SKILL.md:
- Date of review
- Cost
- Findings count (P0/P1/P2)
- Items fixed
- Items remaining
