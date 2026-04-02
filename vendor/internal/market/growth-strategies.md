# Growth Strategies — Greg Isenberg Framework Applied to Silvery Ecosystem

Date: 2026-04-02
Source: Greg Isenberg "7 Growth Strategies" podcast (The Startup Ideas Podcast)

## Strategy 1: MCP Servers as Sales Team

**Status:** Not started
**Idea:** Ship an MCP server for terminal UI components — AI agents could use Silvery to build TUIs.

## Strategy 2: Programmatic SEO (10K pages)

**Status:** Active — terminfo.dev has 206+ pages from probe data
**Next:** Expand with use-case profile pages, standard adoption pages, FAQ schema on feature pages

## Strategy 3: Free Tools as Top of Funnel

**Status:** Partial — terminfo.dev exists, termless screen recorder exists

### Existing tools

1. **terminfo.dev** — terminal compatibility database (already live, 206+ pages)
2. **Termless screen recorder** — record terminal sessions, export GIF/SVG/cast
3. **Terminal capability checker** — already exists as terminfo.dev probes
4. **Theme explorer** — silvery.dev/themes (38 palettes, live preview)

### 10 more free tool ideas

5. **"Can my terminal...?"** — paste an escape sequence, see which terminals support it. Simple web tool on terminfo.dev
6. **Terminal color picker** — enter a hex color, see how it renders across 16/256/truecolor terminals, get the nearest safe fallback
7. **ANSI playground** — live editor: type escape sequences, see rendered output in a virtual terminal. Educational + shareable
8. **TUI component playground** — try Silvery components in the browser (silvery has a Canvas 2D renderer). Interactive sandbox
9. **Terminal font previewer** — paste code, see it rendered in popular monospace fonts (Iosevka, JetBrains Mono, Fira Code, etc.)
10. **Escape sequence decoder** — paste raw terminal output, get annotated breakdown of every escape sequence. Debug tool
11. **Terminal benchmark tool** — measure your terminal's rendering throughput, latency, protocol support. Generates a shareable scorecard
12. **Keyboard protocol tester** — press keys, see what your terminal sends (raw vs Kitty protocol vs legacy). Educational
13. **Migration assistant** — paste Ink code, get Silvery equivalent. Web tool that does AST transform
14. **TUI screenshot tool** — render a Silvery component to PNG/SVG for docs/README. CLI tool

## Strategy 4: Answer Engine Optimization (AEO)

**Status:** Active — llms.txt on all sites, FAQ schemas, comparison pages
**Next:** Convert more headings to question form, add FAQ pages to all sites

## Strategy 5: Viral Artifacts (Shareable Outputs)

**Status:** Partial — terminfo.dev badges exist

### Ideas for shareable artifacts

- **Terminal scorecard** — "My terminal supports 94% of features" shareable image from terminfo.dev
- **Component screenshots** — render any Silvery component to shareable PNG
- **Benchmark comparison cards** — "Silvery vs Ink: 122x faster interactive updates" shareable image
- **Theme preview cards** — share a Silvery theme palette as a styled card
- **"Built with Silvery" badge** — for READMEs
- **Terminal recording embeds** — termless recordings embeddable via URL (like asciinema)

## Strategy 6: Newsletter / Audience Capture

**Status:** Not started

### Buy a niche newsletter (Greg's advice)

Research existing terminal/TUI/CLI newsletters:

- TODO: search for existing newsletters in this space
- TODO: evaluate acquisition vs building from scratch

### 20 ideas for capturing our own audience

**Newsletter approaches:**

1. **"Terminal Weekly"** — curated terminal news, new tools, protocol updates, TUI releases. Weekly digest
2. **"TUI Dispatch"** — monthly deep dive on one terminal topic + ecosystem roundup
3. **terminfo.dev changelog** — email when new terminals/features are added to the database

**Community approaches:** 4. **Discord server** — terminal development community (Silvery + broader TUI development) 5. **GitHub Discussions** — enable on silvery repo, actively engage 6. **Reddit community** — create r/terminalui or actively participate in r/commandline 7. **"Office hours"** — monthly live session where you help people build TUIs

**Content-driven audience:** 8. **YouTube channel** — terminal rendering deep dives, TUI tutorials, "building X" series 9. **dev.to series** — "Terminal Internals" educational series, cross-posted from blog 10. **Conference talks** — submit to terminal/Rust/TypeScript conferences

**Product-driven audience:** 11. **terminfo.dev email alerts** — "your terminal just got Kitty keyboard support" notifications 12. **Silvery changelog RSS/email** — release notifications with migration notes 13. **"What's new in terminals"** monthly report — auto-generated from terminfo.dev data changes

**Integration-driven audience:** 14. **VS Code extension** — terminal capability checker in the editor 15. **GitHub Action** — test your TUI in CI against multiple terminal emulators (via termless) 16. **npm init silvery** — scaffolding tool that captures email for updates

**Partnership-driven audience:** 17. **Guest posts on terminal emulator blogs** — Ghostty, Kitty, WezTerm community blogs 18. **Co-marketing with terminal font makers** — Iosevka, JetBrains Mono 19. **Sponsor/feature in "awesome-tui" lists** — get listed prominently 20. **Terminal emulator "certified compatible" program** — test with terminfo.dev, issue a badge

## Strategy 7: AI Content Repurposing Engine

**Status:** Documented in Content Ops (vendor/internal/bearly/content-marketing-system.md)
**Next:** Set up Beehiiv, create X thread templates, establish repurposing workflow
