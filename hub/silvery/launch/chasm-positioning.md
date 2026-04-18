# Crossing the Chasm Positioning

**Internal document. Not published.**

Geoffrey Moore's _Crossing the Chasm_ framework applied to the beorn ecosystem. Each product gets its own positioning sheet: target segment, compelling reason, whole product, competitive frame, value claim.

**Rule:** One target, one reason, one whole product per package. Discipline matters more than breadth — a target that's too broad fails the chasm crossing.

## The ecosystem

| Product                          | Stage                | Primary target (pragmatist)                              | Chasm status     |
| -------------------------------- | -------------------- | -------------------------------------------------------- | ---------------- |
| **[Silvery](#silvery)**          | Early market → Chasm | Developers building interactive terminal apps with React | Pre-chasm        |
| **[Termless](#termless)**        | Early market         | CI/CD engineers testing terminal apps                    | Pre-chasm        |
| **[terminfo.dev](#terminfodev)** | Early market         | Terminal framework authors + CLI tool builders           | Pre-chasm        |
| **[Loggily](#loggily)**          | Early market         | Node.js/Bun service developers                           | Pre-chasm        |
| **KM**                           | Not yet released     | Agentic knowledge workers                                | Pre-early-market |

## The positioning template

For each product, fill in the Moore positioning statement:

> **For** (target customer)
> **who** (statement of need or opportunity)
> **the** (product name) **is a** (product category)
> **that** (key benefit, compelling reason to buy).
> **Unlike** (primary competitive alternative)
> **our product** (primary differentiation).

Then define the **whole product** — everything the pragmatist needs to say yes: the core product, plus docs, examples, integrations, support, community, tooling, proof points.

---

## Silvery

### Tagline

> **Powerful apps with beautiful UIs, whilst unapologetically terminal.**

### Guiding principles

Silvery is built on three principles. They compound — each one makes the others work.

#### 1. Don't surprise experienced web devs

Silvery brings the proven ideas from thirty years of web UI experimentation into the terminal (flexbox, scroll containers, sticky positioning, DOM event bubbling, focus scopes, Playwright-style testing, design tokens). If you'd reach for it on the web, reach for it in Silvery — same names, same semantics, same instincts. Web developers shouldn't have to learn a new mental model to build a terminal app.

#### 2. Stay unapologetically terminal-based

But we're not trying to be a browser, and we don't pretend terminals are something they're not. We talk about **cells**, **screens**, **buffers**, **ANSI**, **terminal protocols**, **scrollback**. Not "pixels," not "viewport," not "DOM." The terminal is front and center, not hidden behind a web-compat shim. When a Silvery feature maps cleanly onto a terminal protocol (Kitty keyboard, OSC 52, DEC mode 2026), we expose it honestly — not as a polyfill, but as a first-class capability.

**Scope note**: Principles 1 and 2 apply at least to `@silvery/ag-term` — the terminal rendering target. Silvery's pluggable architecture supports other surfaces (ag-canvas, ag-dom are experimental), but `ag-term` is unapologetically terminal-first. Canvas and DOM targets can borrow web semantics more literally since they actually ARE web surfaces; ag-term stays native to the medium it runs in.

#### 3. Always strive for the quality plateau

In architecture, developer ergonomics, and performance — no "good enough for now," no ad-hoc affordances bolted on, no accumulating half-solutions. When a feature lands, it's architected from the start: composable, tested, typed, and fast enough that you never want to replace it. The quality plateau is the point where the next feature you add has the same ergonomics as the first; where you stop thinking "I should rewrite this" and start thinking "what should I build next?"

This is what separates Silvery from a Minimum Viable Terminal Framework. We'd rather ship one thing at the plateau than ten things you'll regret.

### The origin-story framing (F++)

This is the narrative version — good for blog posts, launch copy, and HN discussions. It anchors the whole ecosystem story.

> Ink proved React belongs in the terminal. But terminal apps have grown up — AI agents, code review tools, dashboards, editors, TUI IDEs — and their builders are web developers first. They want responsive layout, scroll containers, mouse events, focus scopes, a component library, and Playwright-style tests. Not because terminals are secretly browsers, but because these ideas have been tested across thirty years of web UI development and are what people reach for without thinking.
>
> **Silvery is what Ink would be** if it had been architected around those affordances from day one. React the same way. Cells, screens, ANSI, scrollback — unapologetically terminal. But layout-first pipeline, W3C flexbox, DOM-style events, focus scopes, 45+ built-in components, and multi-backend testing, built in.
>
> And the principle extends across the whole ecosystem:
>
> - **silvery** — the core framework. Layout-first, cell-level, React.
> - **@silvery/ink** / **@silvery/chalk** — drop-in compat layers for migration. 99% of Ink tests, 100% of Chalk tests.
> - **@silvery/test** — Playwright-style locators, `press()`, bounding-box assertions. Test terminal UIs like you test web apps.
> - **@silvery/create** — composable app builder (`pipe()` providers). React + state + focus + mouse + find + copy-mode, assembled from small pieces.
> - **@silvery/theme** — 84 color schemes, semantic tokens (`$primary`, `$success`, `$muted`). Auto-detects terminal background, WCAG-compliant contrast.
> - **@silvery/commander** — type-safe Commander.js with Standard Schema validation. Styles its help output **through Silvery itself**. Your CLI looks like your app because it IS your app. _Beautiful CLIs for free._
> - **@silvery/headless** — pure state machines (SelectList, Readline). No React. Portable, testable, embeddable.
> - **@silvery/ansi** — everything terminal: styling primitives, truecolor, SGR, detection, theme derivation.
>
> Surrounding that core, the larger **beorn terminal ecosystem** fills in the gaps web developers take for granted:
>
> - **Flexily** — pure-TS flexbox layout engine (Yoga-compatible, W3C spec, 2.5× faster than Yoga WASM). Powers Silvery's layout.
> - **Termless** — headless terminal testing against 10+ real parser backends (xterm.js, vt100, Ghostty, Kitty, Alacritty, WezTerm, libvterm). The "Playwright for terminal apps."
> - **terminfo.dev** — the caniuse.com for modern terminal emulators. 161 features × 19 terminals, empirically probed. When you're about to reach for Sixel, OSC 52, or text sizing, terminfo.dev tells you what's safe.
> - **Loggily** — structured logging + span tracing + metrics in one library. Zero dependencies. For when your terminal app goes to production.
>
> Each package follows the same principle: don't surprise experienced web devs, stay unapologetically terminal-based, strive for the quality plateau. They compose into one coherent story — **powerful apps with beautiful UIs, whilst unapologetically terminal.**

### Positioning statements (multiple — one is ⭐ golden)

**⭐ Golden (current leading candidate):**

> **For** React developers whose terminal app has outgrown Ink
> **who** keep reaching for web-platform affordances — responsive layout, scroll containers, mouse events, focus scopes, composable components — and finding gaps,
> **Silvery is a** React framework for modern terminal apps
> **that** brings the proven ideas from web UI — layout-first rendering, flexbox, scroll containers, DOM-style events, focus scopes, a component library, Playwright-style testing — into an architecture designed for them from day one, without pretending terminals are browsers.
> **Unlike** Ink, a minimal renderer that accumulates features ad-hoc,
> **Silvery** made the architectural commitment up front: cell-level buffer, layout-first pipeline, W3C flexbox, composable providers, 45+ built-in components, multi-backend testing. Unapologetically terminal-based — cells, screens, ANSI — but every familiar web pattern works where you'd expect it.

**Alternative 1 — "Don't surprise web devs" as principle:**

> **For** React developers building interactive terminal apps
> **Silvery is a** React framework
> **that** follows one guiding principle: don't surprise experienced web devs. If you'd reach for it on the web — `overflow="scroll"`, `position="sticky"`, `onClick`, flexbox, focus scopes, container queries — it works the same way in Silvery. Same names, same semantics, same instincts. Plus everything the terminal does best: cell-level rendering, ANSI compositing, synchronized output, Kitty keyboard, multi-backend testing.
> **Unlike** Ink, which is minimalist by design and leaves most of these affordances to you or the ecosystem,
> **Silvery** ships them as core, architected for from the start — because web developers are the ones building sophisticated terminal apps today, and they shouldn't have to learn a new mental model.

**Alternative 2 — The "grew up" origin story:**

> Ink proved React belongs in the terminal. But terminal apps have grown up — AI agents, code review tools, dashboards, editors — and their builders are web developers first. They want responsive layout, scroll containers, mouse events, focus scopes, and a component library, not because terminals are secretly browsers, but because these ideas have been tested across thirty years of web UI development and are what people reach for without thinking.
>
> **Silvery is what Ink would be** if it had been architected around those affordances from day one. React the same way. Cells, screens, ANSI, scrollback — unapologetically terminal. But layout-first pipeline, W3C flexbox, DOM-style events, focus scopes, 45+ built-in components, multi-backend testing built in.
>
> When your CLI grows into an app, your framework should grow with it.

**Alternative 3 — The terse version:**

> **Silvery**: React for modern terminal apps. Web-dev ergonomics, terminal-native architecture. If you'd reach for it on the web, reach for it in Silvery — but you're writing a terminal app, and we don't hide that.

**Alternative 4 — The tagline version (homepage hero / npm):**

> **Silvery** — powerful apps with beautiful UIs, whilst unapologetically terminal.
>
> React framework for modern terminal apps. Layout-first rendering, 45+ components, Playwright-style testing. Ink-compatible. Pure TypeScript, no WASM.

### Rotation notes

- **Golden** is the current consensus — use for positioning-2026.md, vs-ink page intro, and external "about" copy.
- **Alternative 1** works well when the conversation is about DX (design reviews, API debates, "why X name").
- **Alternative 2 (origin story)** is the F++ narrative — use for the launch blog post, HN discussion, and anywhere that needs the "grew up" framing. The expanded ecosystem version lives in [The origin-story framing (F++)](#the-origin-story-framing-f) above.
- **Alternative 3** is the one-liner for npm descriptions or short bios.
- **Alternative 4 (tagline)** is the homepage hero — "powerful apps with beautiful UIs, whilst unapologetically terminal."

Refine the golden candidate as the product evolves. Keep alternatives around — they're each useful in different contexts.

### Target segment (be specific)

**Primary pragmatist**: "I built a CLI tool with Ink that grew into an interactive app. Now I'm fighting the framework — manual scroll virtualization, no mouse, every interactive pattern feels like a workaround."

Pain:

- Scroll containers open since 2019 ([Ink #222](https://github.com/vadimdemedes/ink/issues/222))
- Mouse support needs manual protocol handling
- Layout feedback requires `useBoxMetrics` + `useEffect` dance (returns `{width: 0}` on first render)
- Component library means hunting through 50+ third-party packages

**NOT the target**: simple one-shot CLI prompts (Ink is better), CLIs where React is overkill (use Chalk or plain stdout), Python developers (use Textual), Go developers (use BubbleTea).

### Compelling reason to buy

**"When your CLI grows into an app, you shouldn't have to rewrite it."**

Silvery gives you the next rung of the terminal UI ladder without leaving React. Ink users can migrate via `@silvery/ink` (99% test compat), keep their existing code, and opt into silvery-native APIs as they hit Ink's ceilings.

### Whole product

| Layer                        | Status                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Core framework               | ✅ silvery@0.11.0 on npm                                                                                                        |
| Ink compat layer             | ✅ @silvery/ink passes 918/931 Ink 7.0 tests                                                                                    |
| Chalk compat layer           | ✅ @silvery/chalk passes 32/32 Chalk tests                                                                                      |
| Component library            | ✅ 45+ components (VirtualList, Table, CommandPalette, TreeView, Toast, Tabs, SplitView, ModalDialog, TextInput, TextArea, ...) |
| Theming                      | ✅ @silvery/theme — 84 color schemes, semantic tokens                                                                                |
| Testing                      | ✅ @silvery/test — Playwright-style locators, press(), buffer assertions                                                        |
| Multi-backend verification   | ✅ Termless integration (10+ parsers)                                                                                           |
| Layout engine                | ✅ Flexily — pure TS, W3C spec, Yoga-compatible                                                                                 |
| Documentation site           | ✅ silvery.dev                                                                                                                  |
| Migration guide              | ✅ docs/getting-started/migrate-from-ink                                                                                        |
| Reproducible benchmarks      | ✅ beorn/silvery/benchmarks                                                                                                     |
| Example apps                 | 🟡 Examples exist but need polish (Phase 4)                                                                                     |
| AI chat demo                 | ❌ Not built (Phase 4 gating)                                                                                                   |
| Tape recordings of key flows | ❌ Not recorded (Phase 4 gating)                                                                                                |
| Public blog post             | ❌ Not published (draft exists, pending fact-check)                                                                             |

**Chasm gate**: Silvery crosses the chasm when a pragmatist Ink user can land on silvery.dev, see their use case represented in a demo tape, follow the migration guide, and ship in a day.

### Competitive frame

- **Primary alternative**: Ink 7.0 (same React, different architecture)
- **Secondary**: BubbleTea (Go), Textual (Python), Blessed (unmaintained Node.js)
- **Cross-category**: Electron (if you're willing to ship a 100MB+ binary)

### Value claim (one sentence)

> **React for modern terminal apps — when your CLI grows into an app, your framework should grow with it.**

---

## Termless

### Positioning statement (draft)

> **For** CI/CD engineers and terminal app developers
> **who** need to test TUI apps without a real terminal,
> **Termless is a** headless terminal testing library
> **that** runs your terminal app through 10+ real emulator backends (xterm.js, vt100, Ghostty, Kitty, Alacritty, WezTerm, ...) in-process, so you can matrix-test ANSI output, record tape files, and verify rendering across parsers.
> **Unlike** node-pty or manual ANSI parsing,
> **Termless** gives you a Playwright-like API for terminals with deterministic output and cross-backend verification.

### Target segment

**Primary pragmatist**: "I built a terminal app. My CI runs on Linux, but users run macOS Terminal, iTerm2, Alacritty, Ghostty. Rendering differs between them and I have no way to test it."

**NOT the target**: unit testing React components (use `@silvery/test` or ink-testing-library), shell script testing (use `bats`), regression testing without matrix needs (use snapshot tests).

### Compelling reason to buy

**"Test your terminal app the way your users will run it — in real parsers, not mocks."**

Most terminal test tools either mock the terminal (too lenient) or require a real pty (too slow, too flaky). Termless runs real parsers in-process — deterministic, fast, and catches cross-terminal bugs before users do.

### Whole product

| Layer                              | Status                                 |
| ---------------------------------- | -------------------------------------- |
| Core library                       | ✅ @termless/core@0.6.0                |
| xterm.js backend                   | ✅ @termless/xtermjs                   |
| vt100/vt220 backends               | ✅                                     |
| libvterm backend                   | ✅                                     |
| Ghostty/Kitty/Alacritty/WezTerm    | ✅                                     |
| Recording + playback (tape format) | ✅                                     |
| GIF/PNG/SVG output                 | ✅                                     |
| CLI tool                           | ✅ `termless play foo.tape -o out.gif` |
| Documentation                      | ✅ termless.dev                        |
| Integration with @silvery/test     | ✅ createTermless()                    |
| Integration with jest/vitest       | ✅ custom matchers                     |
| Example test suites                | 🟡                                     |

### Value claim

> **Headless terminal testing — like Playwright for terminal apps.**

---

## terminfo.dev

### Positioning statement (draft)

> **For** terminal framework authors, CLI tool builders, and people who need to know "does this terminal support X?"
> **who** currently hunt through scattered docs, source code, and trial-and-error,
> **terminfo.dev is a** terminal feature compatibility database
> **that** documents 161+ features across 19+ terminals with empirical test results, version history, and cross-references — like caniuse.com for terminal emulators.
> **Unlike** the traditional `terminfo` database (which documents capabilities but not modern features like Kitty graphics, synchronized output, OSC 52 clipboard, Sixel, hyperlinks, text sizing),
> **terminfo.dev** uses Termless-driven empirical probes against real emulators to produce an authoritative, continuously-updated compatibility matrix.

### Target segment

**Primary pragmatist**: "I'm building a terminal app. I want to use Sixel images / OSC 52 clipboard / text sizing / synchronized output. Which terminals support it? What fallback should I use? How do I detect?"

**NOT the target**: people who only care about legacy terminfo capabilities (`vt100`, `xterm-256color`), people who don't need modern features.

### Compelling reason to buy

**"Stop guessing. Probe the terminal first, adopt features with confidence."**

Every modern terminal has different levels of support for Kitty graphics, Sixel, OSC 8 hyperlinks, OSC 52 clipboard, text sizing (OSC 66), synchronized output (DEC 2026), Kitty keyboard, etc. terminfo.dev gives you a queryable matrix + capability-detection code snippets.

### Whole product

| Layer                                  | Status                |
| -------------------------------------- | --------------------- |
| Database (161 features × 19 terminals) | ✅                    |
| Docs site                              | ✅ terminfo.dev       |
| JSON API                               | 🟡                    |
| Feature-specific deep dives            | ✅ (partial coverage) |
| Termless-driven probes (CI)            | ✅                    |
| Detection code snippets                | 🟡                    |
| Historical version tracking            | 🟡                    |
| Community submissions                  | ❌                    |

### Value claim

> **The caniuse.com for terminal emulators — empirical, continuously verified, queryable.**

---

## Loggily

### Positioning statement (draft)

> **For** Node.js and Bun service developers
> **who** want structured logging with distributed tracing without pulling in OpenTelemetry's complexity or Winston/Pino's feature sprawl,
> **Loggily is a** structured logger with spans and metrics
> **that** gives you log levels, namespace filtering, span tracing (W3C traceparent compatible), head-based sampling, and a metrics API in a single focused library with zero dependencies.
> **Unlike** Winston/Pino (feature-rich but no tracing) or OpenTelemetry (full-featured but heavyweight),
> **Loggily** is the middle ground — structured + traced + metered, simple enough to adopt in an afternoon.

### Target segment

**Primary pragmatist**: "I'm building a Node/Bun service. I want decent structured logs AND basic span timing AND simple metrics, but I don't want to learn OpenTelemetry's 400 concepts. I just want to know what's slow and why."

**NOT the target**: enterprise observability (use OpenTelemetry), zero-overhead production logging (use Pino), one-off scripts (use `console.log`).

### Compelling reason to buy

**"Structured logs + span traces + metrics in one library, zero dependencies, works with Bun."**

### Whole product

| Layer                                   | Status                    |
| --------------------------------------- | ------------------------- |
| Core logger                             | ✅ loggily@0.5.0          |
| Span tracing (W3C)                      | ✅                        |
| Head-based sampling                     | ✅                        |
| Metrics API                             | ✅ (just shipped)         |
| Context propagation (AsyncLocalStorage) | ✅                        |
| JSON output format                      | ✅                        |
| Console output format                   | ✅                        |
| Documentation site                      | ✅ loggily.dev            |
| Framework integrations                  | ❌ (Express/Fastify/Hono) |
| Example apps                            | 🟡                        |
| Monitoring dashboards                   | ❌                        |

### Value claim

> **Structured logs + tracing + metrics in one library. Zero dependencies. Bun-first.**

---

## KM (not yet released)

### Positioning statement (very draft — to refine as product matures)

> **For** knowledge workers who use AI assistants daily
> **who** want their notes, tasks, and calendar in one place — queryable by AI, editable by humans, synced via markdown files — instead of scattered across Notion, Linear, Google Calendar, and chat threads,
> **KM is a** terminal-first workspace for agentic knowledge workers
> **that** unifies notes, tasks, and calendar with full history, bidirectional markdown sync, and AI agent drivability.
> **Unlike** Obsidian (notes only), Linear (tasks only), or Roam (notes + links but no tasks/calendar),
> **KM** treats the workspace itself as an AI-drivable surface — state machines for every view, serializable actions, replay, and a CLI that an agent can operate directly.

### Target segment

**Primary pragmatist** (speculative): "I have an AI assistant. I want it to actually manage my notes and tasks and calendar, not just draft text I paste into Notion. I want one workspace that's a) a first-class TUI for me b) a first-class API for my agent."

**NOT the target**: people who love Notion's GUI, people who don't use AI agents, people who want a pure note-taking app (use Obsidian).

### Compelling reason to buy

_(TBD — KM isn't ready for chasm positioning yet. Focus on early-market discovery first: who are the 10 people who would pay for this today?)_

### Whole product

_(TBD)_

### Value claim

_(TBD — "Your workspace, driven by agents, stored as markdown"? "The first AI-native PIM"? Needs user research.)_

---

## Cross-cutting notes

### The ecosystem is the whole product

Individual products position separately, but the ecosystem story is cumulative:

- **Silvery** proves the architecture works
- **Termless** lets you test what Silvery produces
- **terminfo.dev** lets you decide which features to adopt
- **Loggily** lets you debug what Silvery apps do in production
- **KM** is the flagship app built on all of the above

A pragmatist adopting Silvery gets Termless + terminfo.dev + Loggily in the bargain. That's a competitive moat vs Ink (which leaves testing, capability detection, and observability to the ecosystem).

### Chasm-crossing dependencies

**Silvery crosses the chasm when:**

- 3-5 visible production apps run on Silvery (not just demos)
- Documentation is complete (examples, migration guide, API reference)
- Whole product is compelling enough that a pragmatist can say yes without asking
- A clear "here's who uses it" section exists on silvery.dev

**What Silvery is blocked on today:**

- AI chat demo + tape recordings (Phase 4)
- Blog post finalized and published
- 2-3 real-world example apps polished for the showcase
- Public launch (Phase 5)

### Don't chase the wrong segment

Each product has a temptation to broaden:

- **Silvery**: tempted to say "React for ALL terminal apps." Don't. It's for sophisticated interactive apps. Simple CLIs stay with Ink, and that's fine.
- **Termless**: tempted to say "all terminal testing." Don't. It's specifically about headless matrix testing across parsers.
- **terminfo.dev**: tempted to say "THE terminal database." Don't. It's specifically about modern features where the traditional terminfo database is silent.
- **Loggily**: tempted to say "replace Pino/Winston." Don't. It's for developers who want tracing too, without OpenTelemetry's weight.
- **KM**: tempted to say "replace Notion." Don't. It's for agentic knowledge workers — a specific, small, growing segment.

### Chasm-crossing order

1. **terminfo.dev** crosses first (it's a database, low commitment, immediate value)
2. **Termless** crosses second (specialized tool, clear use case)
3. **Silvery** crosses third (framework-level, higher commitment, needs Termless + terminfo.dev as whole product)
4. **Loggily** crosses fourth (independent of the terminal stack)
5. **KM** crosses last (flagship app, built on everything above)

## References

- Geoffrey Moore, _Crossing the Chasm_ (1991, revised 2014)
- [positioning-2026.md](positioning-2026.md) — Silvery's narrative positioning
- [launch-strategy.md](launch-strategy.md) — two-launch phasing (Flexily first, then Silvery+Pretext)
- [public-launch-checklist.md](public-launch-checklist.md) — operational gates

## Update log

- **2026-04-10** — Created. Silvery, Termless, terminfo.dev, Loggily sections populated. KM section is speculative — refine as the product matures.
- **2026-04-10** — Added three guiding principles (don't surprise web devs / stay unapologetically terminal / strive for quality plateau). Added tagline: "Powerful apps with beautiful UIs, whilst unapologetically terminal." Added F++ origin-story framing showing how the principles extend across the silvery family (@silvery/test, @silvery/commander, @silvery/theme, @silvery/headless, ...) and the larger beorn terminal ecosystem (Flexily, Termless, terminfo.dev, Loggily). Added Alternative 4 (tagline version) to the rotation. @silvery/commander called out as the dog-food proof point — beautiful CLIs for free because help text renders through Silvery itself.
