---
description: README narrative analysis framework for project audits
---

# Narrative Analysis

Framework for evaluating and improving a project's README and public-facing documentation.

## The 10-Second Test

Open the README cold. After 10 seconds of scanning:

1. Do you know what this project IS? (framework, library, tool, app)
2. Do you know who it's FOR? (audience)
3. Do you know WHY you'd use it over alternatives? (differentiation)

If any answer is "no," the narrative needs work.

## Tagline Patterns (from top frameworks)

| Framework | Tagline | Pattern |
|-----------|---------|---------|
| Vite | "Next Generation Frontend Tooling" | Aspirational + scope |
| tRPC | "Move fast and break nothing" | Catchy + value prop |
| Astro | "The web framework for content-driven websites" | Audience-first |
| Drizzle | "Headless ORM for Node.js, TypeScript and JavaScript" | Descriptive + stack |
| Bun | Lists what it IS, then bold value statement | Component list + pitch |

### Tagline rules

1. **Signal scope** — "framework" not "utility." "Terminal UI" not "layout hook."
2. **One differentiator** — Pick the ONE thing that makes you different. Not three.
3. **Don't name competitors** — "Next-gen" implies you're replacing something. Let the reader figure out what.
4. **Under 10 words** — If it needs a sentence, it's a subtitle, not a tagline.

## README Structure (recommended order)

```
1.  Tagline + badges
2.  The Problem (2-3 sentences — what pain exists?)
3.  Why <project>? (3-5 bullets — why this solves it better than alternatives)
4.  Built for [audience] (audience-first section, if applicable)
5.  Quick Start (prerequisites, install, minimal example)
6.  Key Features (grouped by theme, not a flat list)
7.  Architecture at a Glance (brief, link to docs for depth)
8.  Trade-offs (honest, 1-2 paragraphs)
9.  Compatibility / Migration (if replacing something)
10. Status (what's stable, what's experimental, what's planned)
11. Documentation links
12. Community & Contributing (optional — link to CONTRIBUTING.md, support channels)
13. License
```

### Prerequisites check

Does the Quick Start clearly state:
- Required runtime and version (e.g., "Node.js 18+" or "Bun 1.0+")
- Platform constraints (if any)
- Required external services (if any)

A user should know "Can I use this?" before they run `npm install`.

**Critical ordering**: "Why?" comes BEFORE "How to install." Bun and Astro both hook you before asking you to install anything. Most weaker READMEs reverse this.

## Feature Organization

### Bad: Flat list
```
- useBoxRect()
- Five-phase pipeline
- Flexture layout engine
- No WASM memory growth
- CJK support
- Incremental output
...30 more bullets...
```

### Good: Themed groups with benefits

```
### Layout & Rendering
- `useBoxRect()` — components query their own dimensions (solves Ink's oldest issue)
- Five-phase pipeline — only changed nodes re-render (200x+ faster interactive updates)
- Flexture layout engine — pure TS, 7KB, zero native deps

### Production Stability
...
```

Each group tells a story. Each bullet connects feature → benefit. Bold the feature name, explain why it matters in one clause.

### Feature count guidance

- **README**: 3-4 groups, 3-4 items each (12-16 total). Link to docs for the rest.
- **Comparison page**: Exhaustive is fine — that's what it's for.
- **Blog/launch post**: 3-5 headline features, deep dive on 2-3.

## Trade-off Transparency

### Why include trade-offs?

1. **Builds credibility** — Developers distrust projects that claim to be better at everything
2. **Preempts criticism** — Better you say it than a competitor's blog post
3. **Guides users to the right tool** — If your project isn't right for their use case, you want them to know before they're frustrated

### Examples from top projects

- **Bun**: Links to "things that don't work yet" right in the README
- **Astro**: "If you need [dynamic features], Astro is not the right choice"
- **Prisma vs Drizzle**: Prisma published where Drizzle falls short — Drizzle should have said it first

### Format

One short section after features:

```markdown
## Trade-offs

<project> optimizes for X. For Y, <alternative> may be a better fit.
See [detailed comparison](link) for benchmarks.
```

Keep it to 2-3 sentences. Confident, factual, not apologetic.

## Audience Targeting

### The niche-first strategy

Astro: "content-driven websites." Redwood: "startups." tRPC: "TypeScript developers."

A focused audience statement:
- **Attracts** your ideal early adopters (they feel personally addressed)
- **Doesn't exclude** others (they see the niche as an example, not a barrier)
- **Creates identity** (community forms around shared use case)

### How to frame it

```
Designed for [primary audience] building [primary use case].
Equally at home in [broader use case].
```

Example: "Designed for AI tool builders creating interactive CLIs. Equally at home in any terminal application that needs rich layouts and modern protocol support."

## Competitive Analysis Process

Before rewriting any README:

1. **Identify 3-5 direct competitors** — same language/ecosystem
2. **Identify 3-5 best-in-class READMEs** — any ecosystem (Vite, Bun, Astro, tRPC, Drizzle are strong examples)
3. **Send to `/deep`** (background) with specific questions:
   - Which tagline pattern fits best?
   - How do competitors position themselves?
   - What narrative angle would differentiate most?
4. **Draft based on research** — not intuition
5. **Iterate with user** — tagline and narrative are subjective; present options

## Iteration Process

README narratives rarely nail it on the first try. Plan for 2-3 rounds:

1. **Round 1**: Structure and content (does it cover the right things in the right order?)
2. **Round 2**: Voice and polish (does it sound confident, specific, not generic?)
3. **Round 3**: External review via `/deep` (how does it compare to best-in-class?)

Each round should produce a concrete diff, not vague suggestions.
