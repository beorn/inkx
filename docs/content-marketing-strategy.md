# Content Marketing Strategy: Developer Tool Ecosystem

## Overview

Content marketing plan for four developer tool websites. All content is AI-generated with human editorial review. Goal: establish thought leadership, drive organic search traffic, and build community around the silvery ecosystem.

**Sites:**
- **silvery.dev** — React TUI framework (primary)
- **termless.dev** — Headless terminal testing
- **terminfo.dev** — Terminal feature compatibility database
- **beorn.codes/flexily** — Pure JS flexbox layout engine

## Content Strategy Principles

### AI-Generated Content Best Practices

1. **Human editorial review** — Every article reviewed for accuracy before publishing. AI drafts, human approves.
2. **Code examples must run** — Every code snippet tested against current package versions. Broken examples destroy credibility.
3. **Unique angles** — Don't regurgitate docs. Each article should teach something the docs don't cover: patterns, architecture decisions, real-world debugging, ecosystem comparisons.
4. **Evergreen over news** — Prioritize content that stays relevant for 1-2 years. Avoid "what's new in v1.2.3" posts that age instantly.
5. **Show, don't tell** — Terminal recordings (asciinema/svg), screenshots, interactive demos where possible.
6. **Attribution** — Articles state "Written with AI assistance" in footer. Transparent, not deceptive.
7. **SEO-first titles** — Title matches what developers actually search for. "How to build a CLI dashboard in React" not "Introducing Our New Dashboard Component."
8. **Depth over breadth** — 1500-3000 word articles that fully answer the question. No thin 500-word SEO bait.

### Content Pillars (per site)

Each site publishes content in 4 categories:

| Pillar | Purpose | Example |
|--------|---------|---------|
| **Tutorials** | Step-by-step guides | "Build a Git TUI in 100 lines" |
| **Deep Dives** | Architecture/internals | "How incremental rendering works" |
| **Comparisons** | Honest evaluations | "Silvery vs Ink: 2026 benchmark" |
| **Ecosystem** | Community/integrations | "Using silvery with Zustand" |

### Voice & Tone

- **Technical but approachable** — Write for a senior developer, but don't assume framework familiarity
- **Honest about limitations** — "Silvery doesn't support X yet" builds more trust than omission
- **Show the journey** — "We tried X, it didn't work, here's why Y is better" resonates with developers
- **No marketing speak** — "Blazingly fast" is banned. Show benchmarks instead.

---

## Technical Platform

### Recommendation: VitePress Blog Extension

Since all four sites already use VitePress for docs, add blogging to the existing setup rather than migrating to Astro/Docusaurus. This minimizes maintenance overhead.

**Setup per site:**
- Add `/blog/` directory with markdown posts
- Use `vitepress-plugin-blog` or custom VitePress theme extension
- RSS via `feed` package (generate on build)
- Sitemap via `vitepress-plugin-sitemap`
- Open Graph meta tags in frontmatter

**If VitePress blog proves insufficient**, migrate to Astro Starlight (best docs+blog hybrid, purpose-built for this use case, excellent SEO).

### Post Frontmatter Template

```yaml
---
title: "How to Build a CLI Dashboard with React"
description: "Step-by-step guide to building an interactive terminal dashboard using silvery's Box, Text, and useboxRect components."
date: 2026-04-15
author: "Silvery Team"
tags: [tutorial, react, tui, dashboard]
canonical: "https://silvery.dev/blog/cli-dashboard-react"
image: "/blog/images/cli-dashboard-og.png"
readingTime: 12
---
```

### Build & Deploy

- **CI**: GitHub Actions builds on push to `main`
- **Hosting**: Cloudflare Pages (already used for terminfo.dev)
- **Domain**: `/blog/` path on each `.dev` domain
- **Analytics**: Plausible (privacy-friendly, no cookie banner needed)

### Cross-Posting Pipeline

1. Publish to own site (canonical URL established, indexed first)
2. Day 1: Auto-post to dev.to + Hashnode (via RSS import or API, with canonical back-link)
3. Day 3-5: Manual HN/Reddit submissions for high-value articles
4. Ongoing: Twitter/X threads for key articles

---

## Publishing Schedule

### Phase 1: Launch (Months 1-2)

Publish **2 articles/week per site** (8 total/week) to build initial corpus. Prioritize high-SEO-value tutorials and comparisons.

### Phase 2: Sustain (Months 3+)

Drop to **1 article/week per site** (4 total/week). Focus on depth and quality.

### Cadence

| Day | Site | Content Type |
|-----|------|-------------|
| Monday | silvery.dev | Tutorial or Deep Dive |
| Tuesday | termless.dev | Tutorial or Ecosystem |
| Wednesday | terminfo.dev | Deep Dive or Comparison |
| Thursday | beorn.codes/flexily | Tutorial or Deep Dive |

### Seasonal Content

- **Conference season** (spring/fall): "Talk" format articles — slides-as-blog-posts
- **Year-end**: "State of Terminal UIs" annual roundup
- **Major releases**: Launch blog posts (not changelog — focus on "what you can build now")

---

## SEO Strategy

### Keyword Clusters

**silvery.dev** (high-competition, broad developer audience):
- Primary: "react terminal ui", "tui framework", "node cli framework"
- Secondary: "ink alternative", "terminal components react", "build cli app react"
- Long-tail: "how to build terminal dashboard react", "react terminal scrollable list"

**termless.dev** (low-competition, niche audience):
- Primary: "terminal testing", "tui testing", "headless terminal"
- Secondary: "test terminal app", "ansi testing framework", "terminal automation"
- Long-tail: "how to test terminal application", "vitest terminal testing"

**terminfo.dev** (medium-competition, reference audience):
- Primary: "terminal capabilities", "terminal emulator comparison", "ansi escape sequences"
- Secondary: "terminal feature support", "kitty keyboard protocol", "osc sequences"
- Long-tail: "which terminals support truecolor", "terminal hyperlink support"

**beorn.codes/flexily** (low-competition, framework author audience):
- Primary: "flexbox layout engine", "yoga alternative", "javascript layout"
- Secondary: "pure js flexbox", "layout engine no wasm", "flexbox tui"
- Long-tail: "flexbox layout engine without yoga", "css flexbox javascript library"

### Link Building Strategy

- **Internal cross-linking**: Each ecosystem site links to related articles on sibling sites
- **GitHub README**: Link to blog from each project's README
- **Stack Overflow**: Answer terminal/TUI questions, link to relevant blog posts
- **Awesome lists**: Get listed on awesome-react, awesome-nodejs, awesome-tui
- **Conference talks**: CFPs reference blog posts

---

## silvery.dev — 50 Article Ideas

### Tutorials (20)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 1 | Build a Git Status TUI in 50 Lines of React | Minimal git status viewer using Box, Text, and useInput. Shows how little code silvery needs vs raw ANSI. | tutorial, react, git, beginner |
| 2 | Interactive CLI Dashboard with Real-Time Data | Fetch API data, display in auto-updating panels with useboxRect for responsive layout. | tutorial, dashboard, api, intermediate |
| 3 | Build a Markdown Previewer for the Terminal | Parse markdown with remark, render with silvery Text/Box components. Side-by-side source + preview. | tutorial, markdown, react |
| 4 | Terminal File Explorer with Keyboard Navigation | SelectList + directory traversal. Covers focus system, keyboard shortcuts, file icons. | tutorial, file-browser, keyboard |
| 5 | Build a TODO App with Undo/Redo | useState + history stack pattern. Shows silvery's TEA-compatible state approach without requiring TEA. | tutorial, todo, state-management |
| 6 | Streaming AI Chat Interface in the Terminal | Connect to OpenAI/Anthropic API, stream responses with TextArea, show typing indicator. | tutorial, ai, streaming, chat |
| 7 | Multi-Pane Terminal Layout with SplitView | Build a tmux-like split interface. Resize panes, focus management, nested layouts. | tutorial, layout, splitview |
| 8 | Build a Log Viewer with VirtualList | Handle 100k+ log lines efficiently. Filtering, search, syntax highlighting for JSON logs. | tutorial, virtuallist, performance |
| 9 | Terminal Table with Sorting and Filtering | Table component with column sorting, text filter, pagination. Real database query results. | tutorial, table, data |
| 10 | Build a Terminal Form with Validation | TextInput, SelectList, Toggle composed into a multi-step form with validation feedback. | tutorial, forms, input |
| 11 | Command Palette: Fuzzy Search in Your CLI | CommandPalette component tutorial. Register commands, fuzzy match, keyboard shortcuts. | tutorial, command-palette, search |
| 12 | Toast Notifications in Terminal Apps | ToastStack usage, progress bars, auto-dismiss, action buttons. Error/success/warning patterns. | tutorial, toast, ux |
| 13 | Build a REST API Tester (Postman for Terminal) | TextInput for URL, SelectList for method, formatted JSON response display. | tutorial, api, http |
| 14 | Terminal Music Player UI | Progress bar, playback controls, playlist with VirtualList. ASCII art visualizer. | tutorial, music, creative |
| 15 | Build a Docker Dashboard | Real-time container list, logs viewer, start/stop controls. Uses child_process. | tutorial, docker, devops |
| 16 | Interactive Git Commit Browser | VirtualList of commits, diff viewer, branch selector. Full keyboard navigation. | tutorial, git, viewer |
| 17 | Terminal Kanban Board | Columns with drag-like keyboard reordering. Task cards with status, assignee, priority. | tutorial, kanban, productivity |
| 18 | Build a Database Query Tool | Connect to SQLite/PostgreSQL, run queries, display results in Table. Query history. | tutorial, database, sql |
| 19 | Real-Time System Monitor | CPU, memory, disk, network stats with auto-refresh. Sparkline-style mini charts. | tutorial, monitoring, system |
| 20 | Package.json Editor with Schema Validation | Parse, display, edit package.json fields with smart defaults and validation. | tutorial, npm, tooling |

### Deep Dives (15)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 21 | How Silvery's Incremental Renderer Achieves 100x Faster Updates | 7 dirty flags, cell-level compositing, skip-tree optimization. With benchmarks. | deep-dive, performance, rendering |
| 22 | The React Reconciler Nobody Told You About | How silvery's custom React reconciler maps JSX to terminal cells. HostConfig deep dive. | deep-dive, react, reconciler |
| 23 | Layout Feedback: The Feature Ink Can't Have | Why useboxRect() requires layout-before-render inversion. Architectural constraint analysis. | deep-dive, layout, architecture |
| 24 | Zero Native Dependencies: How We Eliminated WASM | Pure TypeScript layout engine, string-based ANSI rendering, no yoga. Trade-offs and benchmarks. | deep-dive, architecture, wasm |
| 25 | Terminal Protocol Negotiation: 100+ Sequences Auto-Detected | How silvery discovers what your terminal supports without manual configuration. | deep-dive, protocols, terminal |
| 26 | Building a Theme System with 38 Palettes | Semantic tokens, palette detection, auto dark/light mode. Design token architecture. | deep-dive, theming, design |
| 27 | Focus Management in Terminal UIs | Scoped focus, directional navigation, click-to-focus. How silvery solves focus without a DOM. | deep-dive, focus, accessibility |
| 28 | Scrollable Containers Without a DOM | overflow="scroll" implementation: measurement, clipping, scroll position tracking. | deep-dive, scroll, rendering |
| 29 | Dynamic Scrollback: Rendering Into Terminal History | How silvery renders (and re-renders) into scroll history, not just alternate screen. | deep-dive, scrollback, terminal |
| 30 | The Anatomy of a Silvery Component | From JSX → reconciler → ag node → layout → cells → ANSI. Full pipeline walkthrough. | deep-dive, internals, pipeline |
| 31 | Mouse Support in Terminal Apps: A Complete Guide | SGR mouse protocol, click handling, drag events, wheel scrolling. Cross-terminal compatibility. | deep-dive, mouse, input |
| 32 | Kitty Keyboard Protocol: Why It Matters | Disambiguation, modifiers on every key, release events. What silvery exposes that others don't. | deep-dive, keyboard, kitty |
| 33 | OSC Hyperlinks: Clickable Links in Your TUI | Terminal hyperlink support detection, rendering, fallback strategies. | deep-dive, hyperlinks, osc |
| 34 | Synchronized Output: Eliminating Terminal Flicker | How synchronized rendering works, which terminals support it, silvery's auto-negotiation. | deep-dive, rendering, flicker |
| 35 | Measuring Terminal App Performance | Profiling silvery apps: render time, layout time, ANSI output size. Tools and techniques. | deep-dive, performance, profiling |

### Comparisons (10)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 36 | Silvery vs Ink: Honest Benchmark Comparison (2026) | Fair, reproducible benchmarks. What Ink does better, what silvery does better. | comparison, ink, benchmark |
| 37 | Silvery vs Blessed: Different Eras of Terminal UI | Blessed's imperative model vs silvery's React declarative model. Migration guide. | comparison, blessed, migration |
| 38 | Silvery vs Bubbletea: React vs Go for TUIs | Cross-language comparison. When to choose each. Ecosystem, performance, DX trade-offs. | comparison, bubbletea, go |
| 39 | Silvery vs Raw ANSI: When You Need a Framework | When plain escape sequences suffice vs when silvery saves you weeks. Decision framework. | comparison, ansi, decision |
| 40 | React Terminal Libraries Compared: Ink, Silvery, react-blessed | Feature matrix, bundle size, component count, protocol support, maintenance status. | comparison, react, overview |
| 41 | Terminal UI Frameworks in 2026: The Complete Landscape | Survey of every active TUI framework across languages. Where silvery fits. | comparison, landscape, survey |
| 42 | Migrating from Ink to Silvery: A Step-by-Step Guide | @silvery/ink compat layer, what changes, what doesn't, common gotchas. | comparison, ink, migration |
| 43 | Silvery vs Textual (Python): Cross-Language TUI Showdown | Feature parity analysis. CSS-like styling in both. Performance, ecosystem, community. | comparison, textual, python |
| 44 | Do You Need a TUI Framework? Decision Guide | Flowchart: stdout printing → prompts → simple TUI → complex TUI → full app. | comparison, decision, beginner |
| 45 | Component Libraries: Silvery's 30+ vs Ink's 5 | What you get out of the box. Which components matter most for real apps. | comparison, components, dx |

### Ecosystem (5)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 46 | Using Silvery with Zustand for State Management | Zustand store → silvery components. Selectors, subscriptions, devtools. | ecosystem, zustand, state |
| 47 | Testing Silvery Apps with Termless | Headless testing setup, locator API, visual regression, CI integration. | ecosystem, testing, termless |
| 48 | Embedding Silvery in an Existing CLI (Commander/Yargs) | Add interactive TUI screens to traditional CLI tools. Gradual adoption pattern. | ecosystem, cli, integration |
| 49 | Silvery + Claude Code: Building AI-Powered TUIs | How Claude Code uses silvery. Patterns for AI-driven terminal interfaces. | ecosystem, ai, claude |
| 50 | Publishing a Silvery Component to npm | Package a reusable component. TypeScript, ESM, peer deps, testing, docs. | ecosystem, npm, publishing |

---

## termless.dev — 50 Article Ideas

### Tutorials (20)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 1 | Your First Terminal Test in 5 Minutes | Install termless, write a test that launches a TUI app and asserts screen content. | tutorial, quickstart, beginner |
| 2 | Testing a Silvery App End-to-End | Full test for a real silvery app: launch, navigate, assert, screenshot. | tutorial, silvery, e2e |
| 3 | Testing Terminal Colors and Themes | Assert resolved colors (not escape codes). Verify theme tokens render correctly. | tutorial, colors, visual |
| 4 | Screenshot Testing for Terminal Apps | SVG/PNG screenshots, visual diffing, baseline management. CI integration. | tutorial, screenshots, visual-regression |
| 5 | Testing Keyboard Input: From Keys to Assertions | press(), type(), chord sequences. Testing Vim-style bindings. | tutorial, keyboard, input |
| 6 | Testing Scroll Behavior in Terminal UIs | Scrollable containers, viewport assertions, scroll position verification. | tutorial, scroll, viewport |
| 7 | Testing with Multiple Terminal Backends | Same test, different backends (xterm.js, vt100, ghostty). Cross-terminal confidence. | tutorial, backends, compatibility |
| 8 | Testing Terminal Mouse Events | Click, drag, wheel scroll. SGR mouse protocol in tests. | tutorial, mouse, interaction |
| 9 | Testing Terminal Cursor Position and Shape | Cursor state inspection, blink mode, visibility. Assert cursor is where it should be. | tutorial, cursor, state |
| 10 | Testing Terminal Hyperlinks (OSC 8) | Verify clickable links render with correct URLs and text. | tutorial, hyperlinks, osc |
| 11 | Testing Focus Navigation | Tab order, focus scope, directional navigation assertions. | tutorial, focus, accessibility |
| 12 | Debugging Failed Terminal Tests | Reading termless output, understanding cell dumps, using SVG screenshots for debugging. | tutorial, debugging, troubleshooting |
| 13 | Continuous Integration for Terminal Tests | GitHub Actions setup, headless testing, artifact collection, parallel runs. | tutorial, ci, github-actions |
| 14 | Testing Terminal Apps That Spawn Processes | PTY support, testing apps that shell out, process lifecycle assertions. | tutorial, pty, process |
| 15 | Property-Based Testing for Terminal UIs | Random input sequences, resize fuzzing, invariant checking. | tutorial, fuzzing, property-based |
| 16 | Testing Ink Apps with Termless | Using termless with Ink applications (not just silvery). Framework-agnostic approach. | tutorial, ink, framework-agnostic |
| 17 | Testing Rich Text Rendering | Bold, italic, underline, strikethrough. Cell attribute assertions. | tutorial, text, styling |
| 18 | Testing Terminal Notifications and Toasts | Timed assertions, waiting for elements, toast lifecycle testing. | tutorial, toast, timing |
| 19 | Testing Responsive Terminal Layouts | Resize terminal during test, assert layout adapts. Breakpoint testing. | tutorial, responsive, resize |
| 20 | Snapshot Testing for Terminal Output | Record/replay terminal state. Detecting unintended rendering changes. | tutorial, snapshot, regression |

### Deep Dives (15)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 21 | How Termless Works: Headless Terminal Architecture | Virtual TTY, backend abstraction, screen buffer inspection. Full architecture tour. | deep-dive, architecture, internals |
| 22 | Terminal Emulator Backends: A Comparison | xterm.js vs vt100 vs ghostty vs alacritty. Speed, correctness, features, trade-offs. | deep-dive, backends, comparison |
| 23 | The Locator Pattern: Playwright-Inspired Terminal Testing | Auto-refreshing locators, retry strategies, element resolution. Design decisions. | deep-dive, locators, design |
| 24 | ANSI-Aware Screen Assertions | Why string matching fails for terminal testing. Cell-level inspection vs text matching. | deep-dive, ansi, assertions |
| 25 | Testing Terminal Modes: Alternate Screen, Raw Mode, and More | How terminal modes affect testing. Mode inspection, mode-aware assertions. | deep-dive, modes, terminal |
| 26 | Building Custom Terminal Backends for Termless | Interface contract, implementing TerminalBackend, registering custom backends. | deep-dive, backends, extensibility |
| 27 | Performance of Headless Terminal Testing | Benchmark: termless vs Playwright for equivalent test suites. Orders of magnitude faster. | deep-dive, performance, benchmark |
| 28 | The Selector System: Composable Screen Regions | screen(), scrollback(), buffer(), viewport(), cell(), row(), range(). Design philosophy. | deep-dive, selectors, api |
| 29 | Visual Regression Testing Without Chromium | Terminal visual testing vs browser visual testing. No puppeteer, no headless chrome. | deep-dive, visual-regression, architecture |
| 30 | Unicode and Emoji in Terminal Tests | Width calculation, ZWJ sequences, regional indicators. How termless handles Unicode. | deep-dive, unicode, emoji |
| 31 | Termless MCP Server: AI-Driven Terminal Testing | How Claude Code uses termless MCP for terminal automation. Architecture and protocols. | deep-dive, mcp, ai |
| 32 | Testing Terminal Clipboard (OSC 52) | Clipboard read/write testing without actual system clipboard. | deep-dive, clipboard, osc |
| 33 | The Art of Waiting in Terminal Tests | Timing, polling, event-driven assertions. Avoiding flaky tests. | deep-dive, timing, reliability |
| 34 | Scrollback Buffer Testing: Beyond the Visible Screen | Testing what scrolled off-screen. History assertions, scrollback size verification. | deep-dive, scrollback, buffer |
| 35 | Terminal Test Fixtures: Reusable Test Environments | Factory patterns, shared setup, teardown. Keeping test suites DRY. | deep-dive, fixtures, patterns |

### Comparisons (10)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 36 | Termless vs ink-testing-library: Terminal Testing Compared | Feature comparison, DX, assertion power, backend support. | comparison, ink, testing |
| 37 | Termless vs Playwright: When to Use Which | Browser testing vs terminal testing. Overlap and differences. | comparison, playwright, decision |
| 38 | Terminal Testing in 2026: The State of the Art | Survey of all terminal testing approaches. Manual, snapshot, headless, visual. | comparison, landscape, survey |
| 39 | Should You Test Your CLI? A Decision Framework | When terminal testing pays off. ROI analysis for different app types. | comparison, decision, roi |
| 40 | Unit Tests vs Integration Tests vs E2E for TUIs | Test pyramid for terminal apps. What to test at each layer. | comparison, testing-strategy, layers |
| 41 | Testing Go TUIs vs TypeScript TUIs | Bubbletea testing vs termless. Different ecosystems, similar problems. | comparison, go, bubbletea |
| 42 | Terminal Testing: Pure vs PTY Backends | When to use in-memory emulation vs real PTY. Trade-offs and recommendations. | comparison, backends, pty |
| 43 | Termless vs expect/pexpect for Terminal Automation | Line-by-line matching vs structured screen testing. Modernizing test suites. | comparison, expect, automation |
| 44 | Testing React TUIs vs Imperative TUIs | How the testing approach differs for declarative vs imperative terminal frameworks. | comparison, react, imperative |
| 45 | CI Terminal Testing: GitHub Actions vs GitLab CI vs Circle | Setup guides and performance comparison for each CI platform. | comparison, ci, platforms |

### Ecosystem (5)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 46 | Termless + Vitest: The Perfect Terminal Testing Stack | Configuration, watch mode, parallel tests, reporter integration. | ecosystem, vitest, setup |
| 47 | Adding Terminal Tests to an Existing CLI Project | Incremental adoption. Testing the riskiest flows first. | ecosystem, adoption, incremental |
| 48 | Termless for Terminal Emulator Developers | Using termless to validate your terminal emulator's spec compliance. | ecosystem, terminal-dev, compliance |
| 49 | Terminal Testing in Monorepos | Shared backends, test utilities, CI matrix across packages. | ecosystem, monorepo, ci |
| 50 | Contributing a Terminal Backend to Termless | Step-by-step guide to adding support for a new terminal emulator. | ecosystem, contributing, open-source |

---

## terminfo.dev — 50 Article Ideas

*Includes vt100.js and vterm.js content*

### Terminal Knowledge Base (20)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 1 | The Complete Guide to ANSI Escape Sequences | Every CSI, OSC, DCS sequence explained with examples. The definitive reference. | reference, ansi, escape-sequences |
| 2 | Terminal Truecolor: Which Terminals Support It? | 24-bit color support matrix. Detection, fallback strategies, best practices. | reference, truecolor, color |
| 3 | Kitty Keyboard Protocol Explained | What it is, why it exists, which terminals support it, how to use it. | reference, kitty, keyboard |
| 4 | OSC 8 Hyperlinks: The Complete Guide | Clickable terminal links. Support matrix, implementation guide, edge cases. | reference, hyperlinks, osc |
| 5 | Terminal Underline Styles: Beyond Simple Underline | Curly, dotted, dashed, double. Which terminals support which styles. | reference, underline, sgr |
| 6 | Mouse Tracking in Terminals: Protocols and Support | X10, normal, SGR, urxvt mouse modes. What each protocol provides. | reference, mouse, protocols |
| 7 | Synchronized Output: Eliminating Terminal Flicker | Mode 2026. Which terminals support it, how to use it, fallback strategies. | reference, sync-output, rendering |
| 8 | Terminal Color Palettes: 16, 256, and Truecolor | How terminal color systems work. Palette customization, theme implications. | reference, color, palettes |
| 9 | Bracketed Paste Mode: Protecting Your Terminal | What it prevents, which terminals support it, how to implement. | reference, paste, security |
| 10 | Terminal Focus Reporting: Knowing When You're Active | Focus in/out events. Support matrix, use cases, implementation. | reference, focus, events |
| 11 | Alternate Screen Buffer: When and How to Use It | Fullscreen TUI mode. Enter/exit, content preservation, terminal support. | reference, alt-screen, terminal |
| 12 | Terminal Cursor Shapes and Modes | Block, underline, bar. Blinking vs steady. DECSCUSR support matrix. | reference, cursor, modes |
| 13 | Scroll Regions (DECSTBM): Efficient Terminal Scrolling | Defining scroll regions, performance implications, terminal support. | reference, scroll, regions |
| 14 | Terminal Text Sizing (OSC 133) | Semantic prompt support. Which terminals use it, shell integration. | reference, osc, prompts |
| 15 | Sixel Graphics in Terminals | Image display in terminals. Support matrix, libraries, alternatives (iTerm inline images, Kitty graphics). | reference, sixel, graphics |
| 16 | Terminal Clipboard Access (OSC 52) | Read/write system clipboard from terminal. Security implications, support. | reference, clipboard, osc |
| 17 | Terminal Notifications (OSC 9, OSC 777) | Desktop notifications from terminal apps. Cross-platform support. | reference, notifications, osc |
| 18 | DEC Private Modes: The Complete List | Every DECSET/DECRST mode and what it does. Which ones matter for modern apps. | reference, dec-modes, terminal |
| 19 | Terminal Capability Detection at Runtime | How to probe what your terminal supports without a terminfo database. | reference, detection, capability |
| 20 | The History of Terminal Emulation: VT100 to Modern | From DEC VT100 hardware to xterm.js. How we got here. | reference, history, terminal |

### vt100.js & vterm.js (15)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 21 | Building a Terminal Emulator in TypeScript | Architecture walkthrough of vt100.js. Parser, state machine, screen buffer. | deep-dive, vt100, architecture |
| 22 | vt100.js: A Zero-Dependency Terminal Emulator | Why pure TypeScript matters. Use cases: testing, CI, web terminals. | tutorial, vt100, introduction |
| 23 | From vt100 to vterm: Covering the Full Terminal Spec | What vt100.js handles (90%), what vterm adds (remaining 10%), when to use each. | comparison, vt100, vterm |
| 24 | Implementing SGR (Select Graphic Rendition) | How terminal text styling works under the hood. Color, bold, italic, underline parsing. | deep-dive, sgr, parsing |
| 25 | Building a Web Terminal with vt100.js | Embed a terminal emulator in a browser. Canvas or DOM rendering from vt100 buffer. | tutorial, vt100, web |
| 26 | Terminal State Machines: Parsing Escape Sequences | How vt100.js parses ANSI sequences. State machine design, edge cases. | deep-dive, parser, state-machine |
| 27 | Implementing Scroll Regions in a Terminal Emulator | DECSTBM, smooth vs jump scroll, screen buffer management. | deep-dive, scroll, implementation |
| 28 | Unicode in Terminal Emulators: The Hard Parts | Wide characters, combining marks, emoji, ZWJ sequences. Width calculation. | deep-dive, unicode, terminal |
| 29 | Testing Your Terminal Emulator Against the Spec | Using terminfo.dev's test suite to validate conformance. | tutorial, testing, conformance |
| 30 | vt100.js as a Termless Backend | How termless uses vt100.js for headless testing. Integration guide. | tutorial, termless, backend |
| 31 | Cursor Movement: Implementing CUP, CUU, CUD, CUF, CUB | Every cursor positioning sequence, with implementation details. | deep-dive, cursor, implementation |
| 32 | Alternate Screen Buffer Implementation | How to implement DECSET 1049/47. Content preservation, mode switching. | deep-dive, alt-screen, implementation |
| 33 | Performance Optimization in JavaScript Terminal Emulators | Parsing throughput, buffer operations, memory management. Benchmarks. | deep-dive, performance, optimization |
| 34 | vterm.js: Full ECMA-48 Compliance in TypeScript | What 100% coverage means. The long tail of terminal sequences. | deep-dive, vterm, compliance |
| 35 | How terminfo.dev Tests Terminal Emulators | Automated probe architecture, result collection, CI integration. | deep-dive, terminfo, testing |

### Terminal Ecosystem (10)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 36 | Terminal Emulators in 2026: Feature Comparison | Ghostty vs Alacritty vs WezTerm vs Kitty vs iTerm2. Feature matrix from terminfo.dev data. | comparison, terminals, overview |
| 37 | xterm.js vs vt100.js: JavaScript Terminal Emulators Compared | Bundle size, feature coverage, performance, use cases. | comparison, xterm, vt100 |
| 38 | The State of Terminal Standards in 2026 | terminal-wg progress, de facto standards, what's converging. | ecosystem, standards, survey |
| 39 | How Neovim Uses Terminal Capabilities | libvterm, TUI module, feature detection. Lessons for TUI frameworks. | ecosystem, neovim, case-study |
| 40 | ncurses vs Modern Alternatives | What ncurses got right, what's outdated, what replaces it. | comparison, ncurses, modernization |
| 41 | terminfo Database vs Runtime Detection | Static capability lookup vs dynamic probing. Pros, cons, hybrid approaches. | comparison, terminfo, detection |
| 42 | Terminal Emulator Conformance Testing at Scale | How terminfo.dev runs automated tests across 10 backends. Infrastructure deep dive. | ecosystem, testing, infrastructure |
| 43 | Contributing Terminal Test Results to terminfo.dev | How to add a new terminal emulator or feature test. Contribution guide. | ecosystem, contributing, open-source |
| 44 | The Future of Terminal Protocols | Proposals, experiments, what might standardize. terminal-wg roadmap analysis. | ecosystem, future, standards |
| 45 | Why Terminal Emulators Disagree on Edge Cases | Real examples from terminfo.dev where terminals handle the same sequence differently. | deep-dive, compatibility, edge-cases |

### Practical Guides (5)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 46 | Detecting Terminal Capabilities in Your App | Runtime detection patterns. DECRQM, DA responses, trial-and-error. | tutorial, detection, practical |
| 47 | Writing Cross-Terminal Compatible TUI Code | Graceful degradation strategies based on terminfo.dev data. | tutorial, compatibility, best-practices |
| 48 | Terminal Color Themes: A Developer's Guide | How to support light/dark mode, custom palettes, color accessibility. | tutorial, color, theming |
| 49 | Setting Up a Terminal Development Environment | Terminal emulators, fonts, tools, and configurations for TUI development. | tutorial, setup, environment |
| 50 | Debugging Terminal Rendering Issues | Tools and techniques for diagnosing escape sequence bugs. | tutorial, debugging, troubleshooting |

---

## beorn.codes/flexily — 50 Article Ideas

### Tutorials (20)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 1 | Getting Started with Flexily: Your First Layout | Install, create nodes, set flex properties, compute layout. Minimal example. | tutorial, quickstart, beginner |
| 2 | Migrating from Yoga to Flexily | Drop-in replacement guide. What changes, what doesn't, common gotchas. | tutorial, migration, yoga |
| 3 | Building a Terminal Layout with Flexily | Flexbox layout for a TUI: header, sidebar, main content, footer. | tutorial, terminal, layout |
| 4 | Responsive Layouts with Flexily | Measure callbacks, dynamic content sizing, breakpoint-like patterns. | tutorial, responsive, measure |
| 5 | Flexily for Canvas Games: UI Layout Without DOM | HUD elements, inventory grids, dialog boxes. Game UI with flexbox. | tutorial, canvas, games |
| 6 | Nested Flex Containers: Layout Composition | Container nesting patterns, alignment propagation, gap behavior. | tutorial, nesting, composition |
| 7 | Absolute Positioning in Flexily | Overlays, tooltips, modals. Combining flex and absolute positioning. | tutorial, absolute, positioning |
| 8 | Flex Wrap: Multi-Line Layouts | Wrap behavior, align-content, practical grid patterns with wrap. | tutorial, wrap, grid |
| 9 | Min/Max Constraints in Flexily | Preventing layouts from collapsing or overflowing. Constraint-based design. | tutorial, constraints, sizing |
| 10 | Building a Form Layout Engine | Label-input pairs, grid alignment, validation message placement. | tutorial, forms, layout |
| 11 | Flexily + React: Custom Layout Provider | Using flexily as the layout engine for a custom React renderer. | tutorial, react, renderer |
| 12 | RTL and Logical Edges in Flexily | Right-to-left layout support. Start/end vs left/right. Internationalization. | tutorial, rtl, i18n |
| 13 | Building a Print Layout Engine with Flexily | Fixed-size pages, margin boxes, pagination. Document layout. | tutorial, print, document |
| 14 | Flexily in Node.js: Server-Side Layout | PDF generation, email templates, image composition with flex layout. | tutorial, node, server |
| 15 | Performance Tuning: Layout Caching Strategies | Fingerprint caching, dirty flags, when to invalidate. Production patterns. | tutorial, performance, caching |
| 16 | Building a Diagram Renderer with Flexily | Flowchart boxes, connector routing, auto-sizing nodes. | tutorial, diagrams, creative |
| 17 | Aspect Ratio Layouts in Flexily | Image containers, video players, maintaining proportions in flex context. | tutorial, aspect-ratio, media |
| 18 | Testing Layouts with Flexily | Asserting positions, sizes, and alignment. Test patterns for layout code. | tutorial, testing, assertions |
| 19 | Flexily for Figma Plugin Development | Layout computation for design tools. Figma node → flexily node mapping. | tutorial, figma, design-tools |
| 20 | Building a Spreadsheet Layout Engine | Column sizing, row heights, frozen panes. Grid layout with flex. | tutorial, spreadsheet, grid |

### Deep Dives (15)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 21 | How Flexily's Zero-Allocation Algorithm Works | No heap allocation during layout. Stack-only computation. Memory pressure analysis. | deep-dive, algorithm, performance |
| 22 | Fingerprint Caching: Skipping Redundant Layout | How flexily detects when re-layout is unnecessary. Hash-based cache invalidation. | deep-dive, caching, fingerprint |
| 23 | The Flexbox Algorithm Explained | CSS Flexbox spec walkthrough. Main axis, cross axis, flex basis resolution, growth/shrink. | deep-dive, flexbox, algorithm |
| 24 | Flexily vs Yoga: Architectural Differences | Pure JS vs WASM. Sync vs async init. Memory model, debugging, extension points. | deep-dive, yoga, architecture |
| 25 | Implementing CSS Flexbox in 2000 Lines | How flexily keeps the implementation small. Algorithm structure, where complexity lives. | deep-dive, implementation, simplicity |
| 26 | Incremental Layout: Only Recompute What Changed | Dirty flag propagation, subtree invalidation, cache hit rates in real apps. | deep-dive, incremental, optimization |
| 27 | Measure Functions: Dynamic Content Sizing | Text measurement, image intrinsic size, custom content measurement callbacks. | deep-dive, measure, dynamic |
| 28 | Why We Diverge from Yoga on Three CSS Behaviors | flexDirection default, overflow shrinking, aspect-ratio stretch. Spec compliance vs Yoga compat. | deep-dive, css-spec, decisions |
| 29 | Differential Testing: Finding Layout Bugs Automatically | Oracle testing: cached layout vs fresh layout. How 1200 fuzz tests caught 3 bugs. | deep-dive, testing, differential |
| 30 | The Cost of WASM for Layout Engines | Boundary crossing overhead, memory growth, initialization time. Real numbers. | deep-dive, wasm, performance |
| 31 | Flexily's Node Pool: Memory Management Without GC Pressure | How pooling layout nodes reduces garbage collection pauses. | deep-dive, memory, gc |
| 32 | Baseline Alignment in Flexbox | How baseline alignment works, why it's tricky, flexily's implementation. | deep-dive, baseline, alignment |
| 33 | Gap Property: The Modern Flexbox Spacing | Row-gap, column-gap. How flexily implements CSS gap vs Yoga's approach. | deep-dive, gap, spacing |
| 34 | Layout Debugging Tools for Flexily | Visual debug mode, logging, asserting expected layouts, troubleshooting. | deep-dive, debugging, tools |
| 35 | The Evolution of JavaScript Layout Engines | css-layout → Yoga → Taffy → Flexily. History and design evolution. | deep-dive, history, landscape |

### Comparisons (10)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 36 | Flexily vs Yoga: 2026 Benchmark | Fair benchmarks: initial layout, re-layout, no-change, large trees. Methodology disclosed. | comparison, yoga, benchmark |
| 37 | Flexily vs Taffy (Rust): Cross-Language Layout | Rust WASM vs pure JS. When each is the better choice. | comparison, taffy, rust |
| 38 | Flexily vs css-layout: The Original and the Successor | Facebook's original JS layout library. What changed, what improved. | comparison, css-layout, history |
| 39 | JavaScript Layout Engines in 2026: Complete Overview | Every option: Yoga, Taffy, Flexily, css-layout, stretch. Feature/performance matrix. | comparison, landscape, overview |
| 40 | When to Use CSS (Browser) vs Flexily (Headless) | Decision framework: DOM available? Need server-side? Canvas? Terminal? | comparison, css, decision |
| 41 | Flexily vs Manual Layout Code | When handwritten x/y/w/h suffices vs when flexbox saves time. Break-even analysis. | comparison, manual, decision |
| 42 | Yoga's WASM Problem: Why Pure JS Wins for CLIs | 120GB RAM bug, async init, debugging opacity. Real incident analysis. | comparison, yoga, wasm-bugs |
| 43 | Layout Engine Bundle Size Comparison | gzipped sizes, tree-shaking, what you ship. Every option measured. | comparison, bundle-size, shipping |
| 44 | Flexbox Spec Compliance: Who Gets It Right? | CSS WPT test results for Yoga, Taffy, Flexily. Where each diverges from spec. | comparison, spec, compliance |
| 45 | Choosing a Layout Engine for Your Framework | Decision matrix: performance needs, platform, language, CSS compliance. | comparison, decision, framework |

### Ecosystem (5)

| # | Title | Description | Tags |
|---|-------|-------------|------|
| 46 | Flexily in Silvery: How a TUI Framework Uses Flexbox | Real-world integration: component measurement, incremental relayout, scrollable containers. | ecosystem, silvery, integration |
| 47 | Using Flexily with Pixi.js for Game UI | Canvas game HUD with flexbox layout. Setup, rendering loop integration. | ecosystem, pixi, games |
| 48 | Flexily for PDF Generation | Server-side layout for document generation. pdfkit + flexily integration. | ecosystem, pdf, server |
| 49 | Contributing to Flexily: Architecture Guide | Codebase tour, adding features, running differential tests, CI setup. | ecosystem, contributing, open-source |
| 50 | Flexily + Svelte: Custom Layout for Non-DOM Rendering | Using flexily as the layout backend for a Svelte custom renderer. | ecosystem, svelte, renderer |

---

## Distribution & Amplification

### Primary Channels

| Channel | Strategy | Frequency |
|---------|----------|-----------|
| **Own blog** | Canonical source, full SEO | 1/week per site |
| **dev.to** | Auto-cross-post via RSS, canonical back-link | Same day |
| **Hashnode** | Auto-cross-post via RSS, canonical back-link | Same day |
| **Twitter/X** | Thread with key takeaways + link | Same day |
| **HN** | Manual submission for high-value articles | 2-3/month total |
| **Reddit** | r/programming, r/typescript, r/terminal, r/cli | 2-3/month total |

### Subreddit Targeting

| Site | Subreddits |
|------|-----------|
| silvery.dev | r/reactjs, r/node, r/commandline, r/programming, r/typescript |
| termless.dev | r/programming, r/testing, r/commandline, r/typescript |
| terminfo.dev | r/commandline, r/terminal, r/linux, r/programming |
| beorn.codes/flexily | r/javascript, r/gamedev, r/webdev, r/programming |

### Content Repurposing

Each blog post becomes:
1. **Twitter/X thread** — 5-7 tweets with key insights
2. **Short-form video** — 2-3 min terminal recording (asciinema)
3. **GitHub discussion** — Post in silvery discussions for community engagement
4. **Conference CFP** — Deep dives → talk proposals

### Metrics to Track

| Metric | Tool | Goal (6 months) |
|--------|------|-----------------|
| Organic search traffic | Plausible | 5,000 visits/month across all sites |
| npm downloads | npm stats | 2x current downloads |
| GitHub stars | GitHub | 500+ for silvery |
| dev.to followers | dev.to | 200+ |
| Backlinks | Ahrefs/free alternative | 50 unique referring domains |

---

## Priority Order

Start with **silvery.dev** (broadest audience, most SEO competition to win). Then **terminfo.dev** (unique reference value, low competition). Then **termless.dev** and **beorn.codes/flexily** in parallel.

### First 10 Articles to Write

1. silvery.dev: "Silvery vs Ink: Honest Benchmark Comparison (2026)" — comparison content gets shares
2. silvery.dev: "Build a Git Status TUI in 50 Lines of React" — shows the DX advantage
3. terminfo.dev: "The Complete Guide to ANSI Escape Sequences" — definitive reference, massive SEO potential
4. silvery.dev: "How Silvery's Incremental Renderer Achieves 100x Faster Updates" — technical credibility
5. beorn.codes/flexily: "Flexily vs Yoga: 2026 Benchmark" — competitive positioning
6. termless.dev: "Your First Terminal Test in 5 Minutes" — getting started content
7. silvery.dev: "Migrating from Ink to Silvery: A Step-by-Step Guide" — capture Ink users
8. terminfo.dev: "Terminal Emulators in 2026: Feature Comparison" — high-value reference
9. silvery.dev: "Streaming AI Chat Interface in the Terminal" — trending topic (AI)
10. terminfo.dev: "Terminal Truecolor: Which Terminals Support It?" — frequently searched

---

## Programmatic SEO Strategy

### What terminfo.dev Already Has

terminfo.dev is already a programmatic SEO machine — it just doesn't know it yet:

- **~100 feature pages** generated at build time from `features.json` (e.g., `/sgr/sgr-1-bold`)
- **~19 terminal pages** generated from result JSON files (e.g., `/terminal/ghostty`)
- **~10 category pages** (e.g., `/sgr`, `/cursor`, `/modes`)
- **~11 standard/tag pages** (e.g., `/ecma-48`, `/kitty-extensions`)
- **Dynamic SEO meta tags** per page via `transformPageData()`
- **Auto-generated sitemap** via VitePress

That's ~140 indexed pages from structured data. But we're leaving massive SEO value on the table.

### New Programmatic Page Types to Generate

#### 1. Terminal Comparison Pages (HIGH PRIORITY)

**URL**: `/compare/{terminal1}-vs-{terminal2}`
**Example**: `/compare/ghostty-vs-kitty`, `/compare/alacritty-vs-wezterm`
**Data source**: Existing result JSON — diff support matrices
**Content**: Side-by-side feature grid, summary ("Ghostty supports 94% vs Kitty's 89%"), category-by-category breakdown, "Choose Ghostty if..." / "Choose Kitty if..." narrative
**SEO value**: Extremely high — "ghostty vs kitty" is a real search query with low competition
**Page count**: ~171 pages (19 terminals × 18 / 2 pairwise combinations)

#### 2. Feature Support Matrix Pages (HIGH PRIORITY)

**URL**: `/support/{feature-slug}`
**Enhancement to existing**: Current feature pages already exist but need richer narrative
**Add**: "Which terminals support {feature}?" as H1, support percentage badge, recommendation ("If you need {feature}, use one of: ..."), related features section, "Test it yourself" code snippet
**SEO value**: High — targets "[feature] terminal support" queries
**Page count**: Already ~100, but content quality improvement

#### 3. Terminal Use-Case Profile Pages (MEDIUM PRIORITY)

**URL**: `/best-for/{use-case}`
**Examples**: `/best-for/tui-development`, `/best-for/devops`, `/best-for/remote-ssh`, `/best-for/unicode-emoji`
**Data source**: Aggregate features by use-case category, rank terminals by category support %
**Content**: "Best terminals for TUI development" with ranked list, feature requirements table, recommendation
**SEO value**: High — targets "[use case] best terminal" queries
**Page count**: ~8-12 pages

#### 4. Standard Adoption Tracker Pages (MEDIUM PRIORITY)

**URL**: `/adoption/{standard}`
**Examples**: `/adoption/kitty-keyboard-protocol`, `/adoption/ecma-48`, `/adoption/osc-8`
**Data source**: Aggregate by tag, calculate % adoption across all terminals
**Content**: "Kitty Keyboard Protocol adoption: 7/19 terminals (37%)" with timeline, list of supporting/non-supporting terminals, what the standard provides
**SEO value**: Medium-high — targets "[protocol] support" queries
**Page count**: ~11 pages (one per standard/tag)

#### 5. Terminal Changelog / What's New Pages (LOW PRIORITY, HIGH RETENTION)

**URL**: `/changelog/{terminal}/{version}`
**Data source**: Diff between version result files (when we have multiple versions)
**Content**: "What Ghostty 1.3 added: curly underline, OSC 52 clipboard" with before/after
**SEO value**: Medium — targets "[terminal] [version] features" queries, but builds trust and return visits
**Page count**: Grows over time with each census run

### Programmatic SEO for Other Sites

#### silvery.dev — Component Gallery Pages

**URL**: `/components/{component-name}`
**Data source**: Generate from component metadata (props, examples, screenshots)
**Content**: Each component gets its own indexed page with live demo, props table, code example, related components
**SEO value**: Targets "react terminal [component]" queries
**Page count**: ~30 pages (one per component)

#### silvery.dev — Protocol Support Pages

**URL**: `/protocols/{protocol-name}`
**Data source**: Generate from silvery's protocol support code
**Content**: "Silvery's [protocol] support: what it does, how to use it, which terminals support it (link to terminfo.dev)"
**SEO value**: Cross-links to terminfo.dev, targets "terminal [protocol]" queries
**Page count**: ~15 pages

#### beorn.codes/flexily — CSS Property Support Pages

**URL**: `/properties/{css-property}`
**Data source**: Generate from flexily's test suite / supported properties
**Content**: "Flexily [property] support: CSS spec, flexily behavior, Yoga comparison, code example"
**SEO value**: Targets "flexbox [property] javascript" queries
**Page count**: ~20 pages

### Improving Existing terminfo.dev SEO

#### Quick Wins (Do First)

1. **Add robots.txt** — Currently missing
2. **Add JSON-LD structured data** — Schema.org `TechArticle` or `Dataset` markup per page
3. **Improve meta descriptions** — Current descriptions are functional but not click-optimized. Change "Ghostty terminal emulator feature support: 94% (85/90 features)" to "Ghostty supports 94% of terminal features. See which 85 features pass and which 5 don't — including curly underline, Kitty keyboard, and OSC 8 hyperlinks."
4. **Add canonical URLs** — Prevent any duplicate content issues
5. **Add breadcrumbs** — Both visual and schema.org BreadcrumbList markup
6. **Internal linking from feature pages to related features** — "If you need [feature], you probably also need [related feature]"
7. **"Last tested" dates prominent** — Google rewards freshness signals

#### Medium-Term Improvements

8. **Comparison page generation** — The 171 pairwise comparison pages are the single highest-ROI programmatic SEO opportunity
9. **FAQ schema on feature pages** — "Does [terminal] support [feature]?" as FAQ items with schema markup
10. **Search Console submission** — Submit sitemap, monitor impressions, find keyword gaps
11. **RSS feed for new test results** — Feeds are indexed by Google and show freshness
12. **Open Graph images** — Auto-generate comparison chart images for social sharing

### Estimated Page Count After Programmatic SEO

| Site | Current Pages | New Programmatic | Total |
|------|--------------|-----------------|-------|
| terminfo.dev | ~140 | ~200 (comparisons + use-cases + adoption) | ~340 |
| silvery.dev | ~50 (docs) | ~45 (components + protocols) | ~95 |
| beorn.codes/flexily | ~20 (docs) | ~20 (properties) | ~40 |
| termless.dev | ~15 (docs) | ~10 (backend pages) | ~25 |
| **Total** | **~225** | **~275** | **~500** |

500 indexed URLs from structured data — no manual writing needed. This is the Greg Isenberg "1000+ pages in 52 minutes" approach applied to our ecosystem.

---

## Prioritized Content Sequence

### Guiding Principles

1. **Programmatic pages first, editorial content second** — Structured data pages are cheaper, more defensible, and higher-ROI per hour
2. **terminfo.dev is the SEO engine, silvery.dev is the product engine** — terminfo drives traffic, silvery converts it
3. **Comparisons and migrations are highest-intent content** — People searching "X vs Y" or "migrate from X" are ready to act
4. **Build infrastructure once, then fill** — Blog setup, templates, RSS, structured data all pay dividends across every article
5. **Every editorial article must have a CTA** — docs, GitHub, npm install, or newsletter signup

### Phase 0: Infrastructure (Week 1-2)

Do this before writing any content.

| # | Task | Site | Type | Notes |
|---|------|------|------|-------|
| 0.1 | Add robots.txt | terminfo.dev | SEO | Basic allow-all + sitemap reference |
| 0.2 | Add JSON-LD structured data | terminfo.dev | SEO | TechArticle / Dataset schema per page |
| 0.3 | Improve meta descriptions | terminfo.dev | SEO | Click-optimized, specific features mentioned |
| 0.4 | Add breadcrumb schema | terminfo.dev | SEO | BreadcrumbList markup |
| 0.5 | Submit sitemap to Search Console | all 4 sites | SEO | Google + Bing |
| 0.6 | Add Plausible analytics | all 4 sites | Analytics | Privacy-friendly, no cookie banner |
| 0.7 | Set up blog infrastructure | silvery.dev | Platform | VitePress blog plugin or manual, RSS feed |
| 0.8 | Set up newsletter | ecosystem | Distribution | Beehiiv or Buttondown, "Silver Bulletin" or similar |
| 0.9 | Add canonical URLs | all 4 sites | SEO | Prevent duplicate issues |
| 0.10 | Add OG image generation | terminfo.dev | Social | Auto-generate comparison/feature support cards |

### Phase 1: Programmatic SEO Blitz (Week 3-5)

Generate hundreds of pages from existing data. No manual writing.

| # | Task | Site | Pages | SEO Target |
|---|------|------|-------|-----------|
| 1.1 | Generate terminal comparison pages | terminfo.dev | ~171 | "[terminal] vs [terminal]" |
| 1.2 | Enrich existing feature pages | terminfo.dev | ~100 | "[feature] terminal support" |
| 1.3 | Generate use-case profile pages | terminfo.dev | ~10 | "best terminal for [use case]" |
| 1.4 | Generate standard adoption pages | terminfo.dev | ~11 | "[protocol] adoption" |
| 1.5 | Add FAQ schema to feature pages | terminfo.dev | ~100 | Rich snippets in search results |

**Expected outcome**: ~290 new/improved indexed pages on terminfo.dev

### Phase 2: First Editorial Wave (Week 4-8)

The first 12 hand-crafted articles, sequenced for maximum impact. Mix of editorial + programmatic.

| Week | # | Title | Site | Type | SEO Intent |
|------|---|-------|------|------|-----------|
| 4 | 2.1 | Silvery vs Ink: Honest Benchmark (2026) | silvery.dev | Comparison | High-intent migration |
| 4 | 2.2 | Truecolor Support: Which Terminals Have It? | terminfo.dev | Reference | "[terminal] truecolor" |
| 5 | 2.3 | Migrating from Ink to Silvery | silvery.dev | Migration | "migrate from ink" |
| 5 | 2.4 | OSC 8 Hyperlinks: Complete Guide | terminfo.dev | Reference | "terminal hyperlinks" |
| 6 | 2.5 | Your First Terminal Test in 5 Minutes | termless.dev | Tutorial | "terminal testing" |
| 6 | 2.6 | Flexily vs Yoga: 2026 Benchmark | beorn.codes/flexily | Comparison | "yoga alternative" |
| 7 | 2.7 | Why Your Terminal Is 80 Characters Wide | terminfo.dev | History | Shareable/viral potential |
| 7 | 2.8 | Build a CLI Dashboard in 50 Lines of React | silvery.dev | Tutorial | "react terminal dashboard" |
| 8 | 2.9 | Runtime Terminal Capability Detection | terminfo.dev | Reference | "detect terminal features" |
| 8 | 2.10 | expect/pexpect vs Termless | termless.dev | Comparison | "expect alternative" |
| 8 | 2.11 | Terminal Emulators in 2026: Feature Comparison | terminfo.dev | Reference | "terminal comparison 2026" |
| 8 | 2.12 | Migrating from Yoga to Flexily | beorn.codes/flexily | Migration | "yoga replacement" |

### Phase 3: Origin Story + Deep Dives (Week 9-14)

Build authority and thought leadership. Alternate between silvery.dev narrative and terminfo.dev reference.

| Week | # | Title | Site | Series |
|------|---|-------|------|--------|
| 9 | 3.1 | Why We Built Our Own React Terminal Renderer | silvery.dev | Building Silvery (A1) |
| 9 | 3.2 | ANSI Escape Codes Aren't ANSI | terminfo.dev | Terminal History (B2) |
| 10 | 3.3 | How Silvery's Incremental Renderer Achieves 100x | silvery.dev | Deep Dive (#21) |
| 10 | 3.4 | One Person, 30 Years: The Thomas Dickey Story | terminfo.dev | Terminal History (B3) |
| 11 | 3.5 | From Monolith to Plugins | silvery.dev | Building Silvery (A2) |
| 11 | 3.6 | Your Terminal Talks Back: Device Status Reports | terminfo.dev | Esoteric (C1) |
| 12 | 3.7 | What Is Scrollback? Ring Buffers to Terminal History | silvery.dev | Scrollback (D1) |
| 12 | 3.8 | 13 Things You Didn't Know About Your Terminal | terminfo.dev | Terminal History (B8) |
| 13 | 3.9 | One Pipeline, Many Platforms: Decoupling Rendering | silvery.dev | Era 2 Architecture (E1) |
| 13 | 3.10 | The $TERM Deception: Why Every Terminal Pretends to Be xterm | terminfo.dev | Terminal History (B4) |
| 14 | 3.11 | Ctrl+I and Tab Have Been Identical Since the 1970s | terminfo.dev | Esoteric (C3) |
| 14 | 3.12 | Testing Silvery Apps with Termless | silvery.dev | Ecosystem (#47) |

### Phase 4: Sustained Cadence (Week 15+)

1 article/week, alternating sites. Priority order within each site:

#### silvery.dev (every other week)

**Tier 1** (publish first — high conversion):
1. Streaming AI Chat Interface in the Terminal (#6)
2. Terminal File Explorer with Keyboard Navigation (#4)
3. Embed Silvery in Commander/Yargs (#48)
4. Layout Feedback: The Feature Ink Can't Have (#23)
5. The 100x Rendering Optimization We Didn't Plan (A3)

**Tier 2** (next — authority building):
6. Zero Native Dependencies: How We Eliminated WASM (#24)
7. Three Levels of Framework, One Gradient of Adoption (E2)
8. Terminal Protocol Negotiation: 100+ Sequences (#25)
9. Five Graphs: How a TUI App Interconnects (E3)
10. The Silvery Way: 10 Principles That Emerged (A5)

**Tier 3** (ongoing — tutorials and ecosystem):
11-20. Remaining tutorials in priority order: Log Viewer (#8), Table (#9), Form (#10), TODO with Undo (#5), Docker Dashboard (#15), Git Browser (#16), System Monitor (#19), Multi-Pane Layout (#7), Command Palette (#11), Toast Notifications (#12)

**Tier 4** (defer — lower intent):
21-50. Music player, Kanban, Markdown previewer, REST tester, etc.

#### terminfo.dev (every other week)

**Tier 1** (publish first — reference + history):
1. The Great Terminal Renaissance: Why 2017 Changed Everything (B7)
2. Sixel Graphics: Terminal Images From 1983 (C4)
3. OSC 52: The Escape Sequence That Reads Your Clipboard (C2)
4. How a Game Created the Terminal Library Stack (B5)
5. Terminal Security: The Attack Surface You Forgot About (B9)

**Tier 2** (next — standards and compatibility):
6. terminfo: The 45-Year-Old Database That Can't Keep Up (B10)
7. From C to Zig: 40 Years of Terminal Emulator Languages (B6)
8. Synchronized Output: Mode 2026 (C10)
9. Bracketed Paste: The Security Feature (C9)
10. The Unicode Nightmare (C8)

**Tier 3** (ongoing — remaining reference articles):
11-30. Remaining ANSI reference, protocol deep dives, per-feature guides from original list

#### termless.dev (monthly)

1. CI Setup for Terminal Tests (#13)
2. Debugging Failed Terminal Tests (#12)
3. Testing with Multiple Backends (#7)
4. Testing Responsive Layouts (#19)
5. Property-Based Testing for TUIs (#15)

#### beorn.codes/flexily (monthly)

1. Architecture Differences: Flexily vs Yoga (#24)
2. Zero-Allocation Algorithm (#21)
3. CSS Spec Compliance (#44)
4. Fingerprint Caching (#22)
5. Differential Testing (#29)

### Full Timeline Summary

| Phase | Weeks | Output | Type |
|-------|-------|--------|------|
| **0: Infrastructure** | 1-2 | SEO foundations, blog setup, newsletter | Setup |
| **1: Programmatic Blitz** | 3-5 | ~290 generated pages on terminfo.dev | Programmatic |
| **2: First Editorial** | 4-8 | 12 hand-crafted articles | Editorial |
| **3: Origin + Deep Dives** | 9-14 | 12 articles (silvery narrative + terminfo reference) | Editorial |
| **4: Sustained** | 15+ | 1/week alternating sites | Ongoing |

**6-month total**: ~290 programmatic pages + ~36 editorial articles + infrastructure = **~330 new indexed URLs**

### Content Calendar Template (Steady State)

| Week | Monday | Notes |
|------|--------|-------|
| 1 | silvery.dev article | Tutorial or deep dive |
| 2 | terminfo.dev article | Reference or history |
| 3 | silvery.dev article | Architecture or origin |
| 4 | terminfo.dev article + termless/flexily article | Esoteric feature + monthly satellite |

**Cross-posting**: Each article → dev.to + Hashnode (day 1), HN/Lobsters (day 3-5 for best pieces), newsletter digest (monthly)

---

## GPT 5.4 Pro Review — Key Findings

*Full review: `/tmp/llm-f8196c1c-review-this-content-marketing-n1r1.txt` ($5.29, 36k tokens)*

**Overall verdict**: "A smart strategy trapped inside an over-scaled publishing plan."

### Critical Adjustments

1. **Cut volume dramatically**: 200 blog posts is unrealistic at quality. Target **24-40 truly strong pages in 6 months** + structured reference pages on terminfo.dev. Aim for "200 URLs over time" (docs, references, matrices, examples) not "200 blog posts."

2. **Make terminfo.dev co-first with silvery.dev**: terminfo has the clearest search intent, strongest linkability, best chance of becoming a reference site, and data competitors don't have. Recommended effort split: **terminfo 40%, silvery 35%, termless 15%, flexily 10%**.

3. **Shift from "AI-generated" to "expert-reviewed proof content"**: Developer audiences are allergic to generic AI copy. Better framing: "Drafted with AI assistance, reviewed and tested by the maintainers." Add: test status, versions, benchmark repo, reviewer name.

4. **Four blogs dilute authority**: Consider a shared editorial hub/newsletter for the ecosystem, with docs remaining on each product site.

5. **Missing distribution channels**: GitHub-native distribution (README links, Discussions, release notes), Lobsters, newsletters (JS/TS/React/testing), email capture/digest, Bluesky.

### Revised Priority Order (First 12 Articles)

1. terminfo: Truecolor support matrix
2. silvery: Silvery vs Ink benchmark
3. silvery: Migrate from Ink to Silvery
4. terminfo: OSC 8 hyperlinks support matrix
5. termless: Your first terminal test in 5 minutes
6. flexily: Flexily vs Yoga benchmark
7. terminfo: Runtime terminal capability detection
8. silvery: Build a CLI dashboard in React
9. termless: expect/pexpect vs termless
10. silvery: Testing Silvery apps with Termless
11. flexily: Migrating from Yoga to Flexily
12. terminfo: Terminal emulators feature comparison

### Recommended Content Mix (by site)

**silvery**: 35% comparison/migration, 30% tutorials, 20% deep dives, 15% ecosystem
**termless**: 35% pain-solving tutorials, 25% debugging/CI reliability, 25% comparisons, 15% internals
**terminfo**: 50% reference/data pages, 20% compatibility guides, 20% standards analysis, 10% deep dives
**flexily**: 40% comparison/migration, 30% headless-layout use cases, 20% internals, 10% ecosystem

### Missing High-Value Keywords

**silvery**: `ink alternative`, `migrate from ink`, `blessed alternative`, `inquirer alternative`, `cli dashboard nodejs`
**termless**: `cli testing`, `e2e testing cli`, `expect alternative`, `test terminal output`, `vitest terminal testing`
**terminfo**: `[terminal] [feature] support` (programmatic), `terminal support matrix`, `ghostty osc 8`, `windows terminal ansi support`
**flexily**: `yoga alternative`, `headless flexbox`, `server side flexbox`, `flexbox without wasm`

### Key Gaps to Address

- **No conversion architecture**: Every article needs primary CTA, secondary CTA, and destination (docs/GitHub/npm)
- **No refresh plan**: Benchmark and comparison pages need "last tested" dates, versions, owner, refresh interval
- **No Search Console / keyword validation loop**: Add Google Search Console + Bing Webmaster Tools
- **Better metrics**: Track article→docs CTR, article→GitHub CTR, article-assisted installs (not dev.to followers)
- **Hub-and-spoke architecture**: Prevent SEO cannibalization between overlapping comparison/migration articles

### 90-Day Target (Revised)

12-20 high-value assets total:
- terminfo: 6-8 reference pages/assets
- silvery: 5-6 pages
- termless: 2-3 pages
- flexily: 2-3 pages

---

## Greg Isenberg's Content Marketing Framework

*Research from Greg Isenberg (Late Checkout, Startup Ideas Podcast) — prolific content creator and startup advisor.*

### Core Philosophy: "Vibe Marketing"

Find content that's already winning (sort by bookmarks, comments, etc). Amplify with paid ads to lookalikes. Test one format per business day until finding what works. "If you're not shipping 10+ hooks a day and letting the algo tell you which one wins, you're leaving traction on the table."

### 7-Step AI Growth Framework

1. **Build a Lead Gen Machine**: Launch directories/tools people search for. Build microsites addressing niche pain points. Use Google Keyword Planner for keyword validation.
2. **Automate Repetitive Tasks**: Lindy AI for scheduling/outreach, Opus Clip for video repurposing, Zapier + ChatGPT for automation.
3. **Implement Vibe Marketing**: Analyze winning content, create "content triplets" (thread + blog + video), amplify with paid social.
4. **Become a Testing Machine**: Ship 10+ hooks/day, use Claude to summarize patterns across successful content, scrape trending content for inspiration.
5. **Deploy Lead Magnets**: 2+ per month — niche communities, databases, AI-powered reports, calculators.
6. **Repurpose Systematically**: "1 insight becomes a blog, video, tweet, template, and microsite." 72% engagement increase from cross-channel repurposing.
7. **Leverage AI to Amplify**: 80% AI-generated, 20% human editorial. "AI lets you do what used to take 10 people."

### Programmatic SEO (Most Relevant to Us)

Isenberg demonstrated creating **1000+ SEO pages in 52 minutes** using Claude Code + MCP + Cursor:
- **Research phase**: Cursor + Perplexity MCP for keyword research
- **Planning phase**: PRD for comparison page structure
- **Execution**: Claude Code generates implementation ("much more successful at getting to a working, completed project")
- **Deploy**: Vercel from terminal

**Direct application for terminfo.dev**: Generate per-terminal, per-feature support pages programmatically. Each page targets `[terminal] [feature] support` long-tail keywords. This aligns perfectly with the GPT Pro review's recommendation to make terminfo.dev reference/data pages the primary SEO moat.

### Isenberg's Recommended Stack

| Category | Tools |
|----------|-------|
| Keyword research | Google Keyword Planner, SEMrush Keyword Magic |
| Content optimization | Surfer SEO, MarketMuse |
| AI content | ChatGPT, Claude, Jasper |
| Automation | Make, n8n, Zapier, Lindy AI |
| Visual/Creative | Midjourney, Ideogram, ChatGPT-4o images |
| Video repurposing | Swell, Opus Clip, Blotato |
| Microsites | Typedream, Durable, Bolt |
| Lead magnets | Replit, Bolt, Lovable |
| Newsletter | Beehiiv |
| Scraping/research | Phantom Buster, ScraperAPI |

### Key Takeaway for Our Strategy

Isenberg's approach validates:
1. **Programmatic SEO as primary strategy** (not just blog posts) — generate hundreds of structured pages from data
2. **Lead magnets and interactive tools** as content — terminfo.dev's feature matrix IS the content
3. **Newsletter/email capture** — major gap in our current plan
4. **Repurposing every insight into 5+ formats** — thread, blog, video, template, tool
5. **Testing velocity over perfection** — ship many hooks, let the algorithm pick winners

Sources:
- [Greg Isenberg's AI Growth Framework](https://www.contentgrip.com/ai-startup-growth-greg-isenberg-framework/)
- [How to Boost Search Ranking — HubSpot](https://blog.hubspot.com/marketing/ai-seo-strategies)
- [1000+ SEO Pages in 52 min — Startup Ideas Podcast](https://podscan.fm/podcasts/the-startup-ideas-podcast/episodes/this-ai-agent-creates-1000-seo-pages-in-52-min-claude-mcp-cursor)
- [Greg Isenberg audience building framework](https://www.contentgrip.com/greg-isenberg-audience-building-framework/)
- [Vibe Marketing thread](https://x.com/gregisenberg/status/1903457220093972552)

---

## Additional Article Series

### Series A: "Building Silvery" — Origin Story (silvery.dev)

The story of building a TUI framework from scratch, told without exposing the driving application. Frame: "We were building a complex terminal app and kept hitting limitations."

| # | Title | Key Realization | Tags |
|---|-------|----------------|------|
| A1 | Why We Built Our Own React Terminal Renderer | Layout feedback is architectural — Ink's pipeline renders before layout, making responsive design impossible. 2016 Ink issue #5 was never solved because it requires inverting the pipeline. | origin, architecture |
| A2 | From Monolith to Plugins: When Your Renderer Outgrows Itself | Testing needed a virtual renderer. Desktop targets needed adapters. The monolith was good for one use case but brittle for others. | origin, refactoring |
| A3 | The 100x Rendering Optimization We Didn't Plan | Per-node dirty flags (7 independent flags) + cell-level compositing. Incremental rendering emerged from separating layout, render, and paint into three independent phases. | origin, performance |
| A4 | How Terminal Protocols Became Our Secret Weapon | We started with basic ANSI. Then discovered Kitty keyboard, SGR mouse, synchronized output, OSC hyperlinks — 100+ sequences that make terminal apps feel native. Auto-negotiation made it seamless. | origin, protocols |
| A5 | The Silvery Way: 10 Principles That Emerged From Building | Each principle solves a real failure mode we hit. SelectList vs manual cursor tracking. Theme tokens vs hardcoded ANSI. `using` cleanup vs memory leaks. | origin, principles |
| A6 | Framework Independence: The Day We Split React Out | The renderer doesn't care about React. Same node tree works for Svelte, Solid, even Canvas. Splitting into @silvery/ag + @silvery/ag-react + @silvery/ag-term unlocked everything. | origin, architecture |
| A7 | Pure State Machines: When Components Stopped Needing React | SelectList, TextInput, CommandPalette — all became pure `(action, state) → state` functions. Same machine works in React, DOM, headless servers, and AI agents. | origin, state-machines |
| A8 | Designing a Plugin System That Composes Like Unix Pipes | `pipe(create(), withAg(), withTerm(), withReact())` — each plugin wraps the previous apply(). No registration, no globals, no god objects. | origin, composition |

### Series B: Terminal History & Lore (terminfo.dev)

Deep historical research with surprising facts. The kind of content developers share because "I didn't know that!"

| # | Title | Hook | Tags |
|---|-------|------|------|
| B1 | Why Your Terminal Is 80 Characters Wide: A Story Starting in 1928 | Punch cards → IBM 3270 sonic delay lines → MOS shift registers → 80x24. The chain of causation from 1928 to every terminal today. | history, standards |
| B2 | ANSI Escape Codes Aren't ANSI: The Standard Was Withdrawn in 1994 | ECMA committee (European) and ANSI committee (American) produced "nearly identical" standards, merged into ISO 6429. ANSI withdrew its own standard. The name persists from 1979. | history, standards |
| B3 | One Person, 30 Years: The Thomas Dickey Story | Thomas Dickey has maintained xterm, ncurses, AND terminfo since 1996. The most extreme example of critical OSS infrastructure maintained by one individual. | history, people |
| B4 | The $TERM Deception: Why Every Terminal Pretends to Be xterm | When Ghostty experimented with a pure `ghostty` TERM value, too many apps broke because they string-search for "xterm". Every new terminal must pretend. | compatibility, standards |
| B5 | How a Game Created the Terminal Library Stack | curses was written at Berkeley ~1980 specifically to support Rogue. Bill Joy created termcap in 1978 to support vi. The entire terminal UI stack exists because of a dungeon crawler. | history, games |
| B6 | From C to Zig: 40 Years of Terminal Emulator Languages | xterm (C, 1984) → Kitty (C+Python, 2017) → Alacritty (Rust, 2017) → WezTerm (Rust, 2018) → Ghostty (Zig, 2024). What each language brought to terminal development. | history, languages |
| B7 | The Great Terminal Renaissance: Why 2017 Changed Everything | Alacritty proved GPU rendering could dramatically improve performance. Kitty invented new protocols. WezTerm replaced tmux. Then Ghostty arrived aiming for total spec compliance. More innovation in 7 years than the previous 20. | history, modern |
| B8 | 13 Things You Didn't Know About Your Terminal | Terminals use a 1978 protocol. The bell character still works. Most terminals disagree on emoji width. Windows had no ANSI support for 35 years. DEC Special Graphics from 1978 still draw boxes. Sixel graphics are from 1983 and making a comeback. | listicle, surprising |
| B9 | Terminal Security: The Attack Surface You Forgot About | Malicious escape sequences can inject commands, modify displayed text, or trigger code execution. Research goes back to 1999. Multiple CVEs filed as recently as 2023. | security, deep-dive |
| B10 | terminfo: The 45-Year-Old Database That Can't Keep Up | Static capability lookup vs dynamic probing. No mechanism for modern capabilities. SSH chicken-and-egg problem. Why many apps bypass terminfo and just string-match "xterm". | standards, critique |

### Series C: Esoteric Terminal Features (terminfo.dev)

The most surprising, magical, and forgotten terminal capabilities. Each article explores one feature family in depth.

| # | Title | Surprise Factor | Tags |
|---|-------|----------------|------|
| C1 | Your Terminal Talks Back: Device Status Reports and Mode Queries | 5/5 — Send `ESC [ 5 n` and the terminal responds "I'm OK." Send `ESC [ ? 2004 $ p` and it tells you if bracketed paste is on. Terminal introspection is real. | protocol, bidirectional |
| C2 | OSC 52: The Escape Sequence That Reads Your Clipboard Over SSH | 5/5 — Any terminal process can read/write your system clipboard. Magic for remote work. Terrifying for security. Most terminals now disable read access by default. | protocol, security |
| C3 | Ctrl+I and Tab Have Been Identical Since the 1970s (Kitty Keyboard Protocol) | 5/5 — Traditional terminal input is fundamentally broken. Same byte for Ctrl+I/Tab, Ctrl+M/Enter, Escape/escape-sequence-start. Applications use timing hacks. Kitty fixed it with opt-in progressive enhancement. | protocol, keyboard |
| C4 | Sixel Graphics: Terminal Images From 1983, Now Making a Comeback | 5/5 — DEC invented inline terminal graphics for the VT240. 6 vertical pixels per character. Designed for dot-matrix printers. Now revived in modern terminals. gnuplot has a Sixel driver with truecolor and TrueType. | protocol, graphics |
| C5 | OSC 133: How Your Terminal Knows Where Every Command Starts and Ends | 5/5 — Semantic prompt markers. Click-to-navigate between prompts, select entire command output, scroll by command boundaries, red indicators on failed commands. Feels like magic. | protocol, shell-integration |
| C6 | Redefining "Red": OSC 4 Palette Rewriting and Runtime Theming | 5/5 — Change palette entries at runtime. Every character using that color updates retroactively. Dark/light mode switching without redrawing. The entire screen updates by redefining what colors mean. | protocol, theming |
| C7 | GPU Blits in a Text Terminal: DEC Rectangular Area Operations (1990) | 5/5 — DECCRA (copy rectangle), DECFRA (fill rectangle), DECCARA (change attributes in rectangle). Terminal-level GPU blits from 1990. Microsoft Terminal added support in 2023. | protocol, forgotten |
| C8 | The Unicode Nightmare: When One "Character" Is 7 Codepoints and 2 or 8 Cells Wide | 5/5 — ZWJ emoji, variation selectors, regional indicators. Every terminal disagrees on edge cases. The family emoji is 25 bytes, 7 codepoints, and either 2 or 8 cells wide depending on your terminal. | unicode, compatibility |
| C9 | Bracketed Paste: The Security Feature That Stopped Your Terminal From Running rm -rf / | 4/5 — Without it, pasting text with newlines executes commands immediately. PuTTY 0.72 had a bug that completely defeated it. Most developers don't know it exists. | protocol, security |
| C10 | Synchronized Output: How Mode 2026 Eliminated Terminal Flicker | 4/5 — Buffer all output between two escape sequences, paint as one atomic frame. Without it, clearing and rewriting causes visible intermediate states. Added to the spec by terminal-wg. | protocol, rendering |

### Series D: Understanding Scrollback (silvery.dev)

From ring buffers to silvery's inline rendering innovation.

| # | Title | Description | Tags |
|---|-------|-------------|------|
| D1 | What Is Scrollback? From Ring Buffers to Terminal History | How terminal emulators maintain the history above the viewport. Ring buffers, line storage, ANSI preservation, ED3 clearing. The fundamentals every TUI developer should understand. | scrollback, fundamentals |
| D2 | Primary vs Alternate Screen: The Strategic Choice Every TUI Makes | Alternate screen: full control, no scrollback, output vanishes on exit. Primary screen: history preserved, but content management is exponentially harder. Why most frameworks force alternate screen. | scrollback, architecture |
| D3 | The Inline Mode Challenge: Why Full-Screen Apps Leave History Behind | Content displacement, read-only scrollback, resize reflow, CUP can't reach scrollback rows. The five fundamental problems that make inline rendering "exponentially harder." | scrollback, challenge |
| D4 | Silvery's Innovation: Interactive Apps That Belong in Scrollback | The three-zone model (static scrollback → dynamic scrollback → live screen). Item lifecycle: mounted → virtualized → gone. Pre-rendered caching. 28-192x fewer bytes than full re-render. | scrollback, silvery |

### Series E: Designing Era 2 — Architecture Blog (silvery.dev)

Technical architecture series explaining silvery's plugin-based composition system. Applicable beyond silvery — these are general software architecture patterns.

| # | Title | Description | Tags |
|---|-------|-------------|------|
| E1 | One Pipeline, Many Platforms: Decoupling Rendering from Frameworks | The plugin composition model. `pipe(create(), withAg(), withTerm(), withReact())`. Each plugin wraps dispatch/apply. Swap withReact() for withSvelte(), swap withTerm() for withWeb(). | architecture, composition |
| E2 | Three Levels of Framework, One Gradient of Adoption | Foundation → Rendering → App. Not every app needs signals or commands. Start with useState, upgrade when needed. Most frameworks are all-or-nothing; this isn't. | architecture, progressive |
| E3 | Five Graphs: How a TUI App's Architecture Interconnects | Plugin chain (Stack), Ag node tree (Tree), Reactive data graph (DAG), Command tree (Tree), Async scope tree (Tree). How a keypress traverses all five. | architecture, graphs |
| E4 | TextFrame: The Immutable Cell Grid That Tests Everything | Immutable snapshots of terminal output. Bridges rendering and testing. Same TextFrame works for terminal, canvas, and DOM. Simple idea, huge impact. | architecture, testing |
| E5 | Layout → Render → Paint: Three Phases That Change Everything | Decomposing monolithic pipeline into independent phases. Each can be specialized per platform. Skip layout if unchanged. Skip paint for testing. | architecture, rendering |
| E6 | Commands as Data: Decoupling Behavior from State | Commands are functions + optional args schema, not state-aware actions. Work with any state system (signals, Zustand, useState). Same commands for keyboard, menu, AI agent. | architecture, commands |
| E7 | The Framework × Platform Matrix: Rendering to Terminal, Web, or Canvas | One codebase, multiple targets. React + Terminal (today), React + Web (future), Svelte + Terminal (future). Closable gaps vs fundamental gaps. | architecture, composability |
| E8 | The Decision Log: 37 Architectural Choices and Why We Made Them | Append-only, numbered, cross-referenceable. alien-signals (D26), callable accessors (D29), state-agnostic commands (D30), era2a/era2b split (D37). Decision logs as living design artifacts. | architecture, process |
