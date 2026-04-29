---
id: "@km/_orphan/1wnsi"
aliases:
  - km-1wnsi
created_by: claude:2ce3230f
created_at: 2026-03-10T06:25:20Z
closed_at: 2026-03-10T22:57:52Z
close_reason: Work completed and committed as 73de145 in silvery submodule.
  Closing during grooming.
owner: bjorn@stabell.org
---

# [x] Phase 4: Reduce claim repetition across all 7 docs @km/_orphan #task #P2

Reduce claim repetition. Each major claim should appear in full detail on max 2 pages; elsewhere, mention briefly or link.

## Repetition map (current → target)

### "100x faster interactive updates"
- Currently: README, homepage tagline, homepage feature card, why-silvery, silvery-vs-ink (5+)
- Target: Homepage feature card (brief) + silvery-vs-ink (full detail with methodology). README: show benchmark table without the "100x" headline claim. why-silvery: "significantly faster interactive updates" with link to benchmarks.

### "Layout feedback / useContentRect"
- Currently: every page
- Target: Homepage (feature card), getting-started (tutorial), silvery-vs-ink (deep explanation). Other pages: brief mention + link.

### "Scrollable containers"
- Currently: homepage, why-silvery, silvery-vs-ink, getting-started, README
- Target: Homepage (card), getting-started (tutorial), silvery-vs-ink (comparison). README: one sentence. why-silvery: brief mention.

### "30+ components" + full component list
- Currently: full list on README, homepage (twice: feature card + "What's Inside"), why-silvery, silvery-vs-ink, getting-started
- Target: Full list on ONE page (components guide or README). Everywhere else: "30+ built-in components including TextArea, VirtualList, Table, and more — see the component catalog."

### "Zero dependencies / pure TypeScript / no WASM"
- Currently: README, homepage, why-silvery, silvery-vs-ink (4+)
- Target: README (once), homepage (once). Other pages: implied or brief.

### "Drop-in replacement / change your imports"
- Currently: homepage hero, homepage callout, why-silvery, silvery-vs-ink, migration
- Target: Homepage callout (once) + migration guide (once). Other pages can say "Ink-compatible API" without the "drop-in" pitch.

### "Ink's #1 issue / #1 feature request"
- Currently: homepage (2x), why-silvery
- Target: Remove entirely. Let the features speak for themselves. silvery-vs-ink can reference the GitHub issues as factual context without the "#1" framing.

### Claude Code 120GB memory reference
- Currently: why-silvery, silvery-vs-ink
- Target: silvery-vs-ink ONLY (in Real-World Impact section, with factual framing)