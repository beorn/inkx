---
mentions:
  - km
  - claude
id: "@km/silvery/design-review-method"
aliases:
  - km-silvery.design-review-method
  - km-silvery-design-review-method
created_by: claude:491faf6c
created_at: 2026-03-26T06:12:50Z
closed_at: 2026-03-29T02:33:48Z
close_reason: "Superseded by km-silvery.demos.design-pipeline. Research done,
  create.md workflow exists. Next: prototype with non-OpenAI models."
owner: bjorn@stabell.org
assignee: claude:491faf6c
---

# [x] Design review method — scientific approach to 10/10 screenshots @km/silvery #feature #P2 @claude:491faf6c

## Problem

During silvery.dev showcase screenshot iteration, Claude repeatedly missed fundamental rendering bugs (content overflow, text overlapping borders) visible in TTY text output but invisible in PNG thumbnails. Current approach (fix → screenshot → GPT review → repeat) is slow, expensive ($0.02/review), and misses basic issues. o3 rated final screenshots 8/10 (dashboard) and 7/10 (components) — need 10/10.

## Root cause analysis

1. Claude's Read tool shows PNGs as tiny thumbnails — can't see 1-char overflow
2. External LLMs (GPT-4o, o3) see same small images — hallucinate "2px misalignment" but miss actual overflow
3. TTY text output catches everything but isn't used systematically
4. No verification step between code change and screenshot generation
5. Manual width calculations were the #1 source of overflow bugs (now eliminated)

## Goal

Research, experiment with, and document the best method for AI-driven visual design iteration. Target: o3 rates both dashboard and components screenshots 10/10.

## Approach: scientific experimentation

### Research phase

- Web search: AI-driven UI review workflows, visual regression for terminal UIs, best vision models for UI critique
- Study v0.dev, Vercel design QA processes
- Survey available vision models: Gemini Pro Vision, Claude vision, qwen2.5-vl:32b/72b, specialized UI models

### Experiment: test multiple approaches, measure effectiveness

**Approach A: TTY text verification (free, instant)**
Run demo in mcp__tty at screenshot dimensions, programmatically scan for overflow (content past │ border chars)

**Approach B: Claude vision via Read (free, built-in)**
Read PNG with Read tool, apply full 47-point checklist from /design-review

**Approach C: Larger local models (free, ~30s)**
Pull qwen2.5-vl:32b (or 72b — 128GB RAM available), compare vs 7b

**Approach D: Higher-resolution screenshots**
Generate at 2x resolution for review, downscale for production

**Approach E: Structured diff review**
After each change, diff TTY output vs previous — review only changed regions

**Approach F: Composite tiered method**
TTY text scan → Claude Read → o3 (final QA only) — document cost/quality tiers

### Scoring methodology

For each approach, run against dashboard + components screenshots:

- Detection rate: % of o3's findings caught
- False positive rate: non-issues flagged
- Cost per review ($)
- Speed (seconds)
- Actionability: does feedback map to specific code changes?

### Deliverable

Update `.claude/skills/design-review/SKILL.md` with proven best method, benchmarks, model recommendations.

## Priority 2: Fix remaining screenshot issues

Using the winning method, iterate dashboard + components to o3 10/10.

### Current state (as of commit a0649be)

- Dashboard: o3 8/10 — no overflow, all flexbox, ProgressBar auto-sized
- Components: o3 7/10 — 2x2 grid, no overflow, equal-width boxes
- Both use ProgressBar everywhere (no manual bar calculations)
- useContentRect fix landed (returns inner content dimensions)
- Viewport: 1100x700, settle: 5s

### o3's remaining dashboard issues (8→10)

1. CPU percentage column not right-aligned (ragged edge)
2. Aggregate sparkline under CPU looks like a glitch (unlabeled)
3. Memory swap bar crowded against section above
4. Network throughput numbers not right-aligned
5. Process table columns drift slightly

### o3's remaining components issues (7→10)

1. Border Styles and Design Tokens boxes visually collide
2. Progress bar labels slightly misaligned
3. Search field underline extends past label column
4. Modal "Esc to close" crowds border
5. Deploy/Cancel button spacing uneven

### Files

- `.claude/skills/design-review/SKILL.md`
- `vendor/silvery/examples/layout/dashboard.tsx`
- `vendor/silvery/examples/apps/components.tsx`
- `vendor/silvery/scripts/generate-screenshots.ts`

### Key commits this session

- `4275ae3` — useContentRect fix (returns inner content dimensions)
- `a0649be` — eliminate all content overflow, zero manual calculations
- Multiple screenshot iteration commits (see silvery git log)

