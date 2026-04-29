---
id: "@km/silvery/public-copy-consistency"
aliases:
  - km-silvery.public-copy-consistency
  - km-silvery-public-copy-consistency
created_by: Bjørn Stabell
created_at: 2026-04-10T03:15:53Z
closed_at: 2026-04-10T06:39:35Z
close_reason: All public pages consistent with PPP positioning. 12 pages
  updated, meta synced, benchmarks 3-6x (17 scenarios), 10-20x output. Ink
  fact-checked for 7.0. Blog draft ready (internal). Pro review pending.
owner: bjorn@stabell.org
---

# [x] Public copy consistency pass — tagline, principles, ecosystem framing across home/README/about/Silvery Way/vs-ink @km/silvery #task #P2

Land a consistent framing and language across all public-facing Silvery surfaces — so every page tells the same story with the same words. Defined once, reused everywhere.

## Canonical copy (defined in vendor/internal/silvery/launch/chasm-positioning.md)

### Tagline
"Powerful apps, beautiful UIs — unapologetically terminal."
(Alt prose form: "whilst unapologetically terminal"; alt hero 3-beat: "Powerful apps. Beautiful UIs. Unapologetically terminal.")

### Positional line (paired with tagline)
"React for modern terminal apps."

### Three principles (short form for strips/cards)
1. Don't surprise experienced web devs. If you'd reach for it on the web, reach for it in Silvery.
2. Stay unapologetically terminal. Cells, screens, ANSI, scrollback — the terminal is front and center.
3. Strive for the quality plateau. Architecture, ergonomics, performance — no "good enough for now."

### Origin story (one-paragraph, F++ short form)
Ink proved React belongs in the terminal. But terminal apps have grown up — AI agents, code review tools, dashboards, editors — and their builders are web developers first. Silvery is what Ink would be if it had been architected around those instincts from day one. Cells, screens, ANSI, scrollback — unapologetically terminal. But layout-first pipeline, W3C flexbox, DOM-style events, focus scopes, 45+ components, Playwright-style testing — built in.

### Ecosystem (two tiers)
- **Silvery family**: silvery + @silvery/ink + @silvery/chalk + @silvery/test + @silvery/create + @silvery/theme + @silvery/commander + @silvery/headless + @silvery/ansi
- **Beorn terminal ecosystem**: Flexily + Termless + terminfo.dev + Loggily

### Commander dog-food one-liner
"Beautiful CLIs for free. @silvery/commander styles its help text through Silvery itself — your CLI looks like your app because it is your app."

## Pages to update (ordered by priority)

1. **Home page** (`vendor/silvery/docs/index.md`) — hero tagline + principles strip + two-tier ecosystem
2. **README** (`vendor/silvery/README.md`) — header tagline + principles block + two-tier ecosystem
3. **About** (`vendor/silvery/docs/about.md`) — intro tagline + "How It Started" closing (three principles crystallized) + two-tier ecosystem
4. **The Silvery Way** (`vendor/silvery/docs/guide/the-silvery-way.md`) — add "three foundations" section before the 10 practical principles
5. **Silvery vs Ink** (`vendor/silvery/docs/guide/silvery-vs-ink.md`) — add "Why Silvery exists" section (origin story + three principles callout) between opening and Highlights

## Secondary pages (lower priority)

- FAQ — sync "What is Silvery?" and "vs Ink" answers
- Migrate from Ink guide — one-line tagline + link-out
- Quick Start — tagline at top
- vs BubbleTea / vs Textual / vs Blessed — only "stay terminal" + "quality plateau" apply
- `docs/.vitepress/config.ts` description field
- package.json description (silvery repo root)
- GitHub repo description
- `docs/guide/index.md` if it exists

## Consistency checklist

After the edits, these phrases should appear consistently:

- "Powerful apps, beautiful UIs — unapologetically terminal." → home hero, README header, About intro
- "React for modern terminal apps" → home hero text, README title, About intro
- "Don't surprise experienced web devs" → all 5 primary pages
- "Stay unapologetically terminal" → all 5 primary pages
- "Strive for the quality plateau" → all 5 primary pages
- "Cells, screens, ANSI, scrollback — not pixels, viewports, DOM" → About, Silvery Way, vs-Ink
- "What Ink would be if architected around those instincts from day one" → About, vs-Ink, launch blog
- "Beautiful CLIs for free" / "your CLI looks like your app because it IS your app" → Home ecosystem, README ecosystem, About ecosystem
- Two-tier ecosystem split (Silvery family / Beorn terminal ecosystem) → Home, README, About

## Plan

1. Workshop home page + README together to nail the shared wording
2. Apply to About (origin story pivot)
3. Apply to Silvery Way (foundations preamble)
4. Apply to vs-Ink (why-section before Highlights)
5. Pro review the result
6. Sync secondary pages (FAQ, quick-start, migrate, vs-others, config)

## Related

- @km/silvery/launch-blog — the blog post uses the same canonical copy as source of truth
- vendor/internal/silvery/launch/chasm-positioning.md — canonical source; all page copy pulls from here

## Done when

- All 5 primary pages landed and consistent
- Pro review passes on home page + vs-Ink
- Secondary pages synced at least for tagline/description
- chasm-positioning.md update-log entry notes the public pages are now consistent with the internal positioning