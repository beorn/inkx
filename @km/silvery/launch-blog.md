---
mentions:
  - km
id: "@km/silvery/launch-blog"
aliases:
  - km-silvery.launch-blog
  - km-silvery-launch-blog
created_by: Bjørn Stabell
created_at: 2026-04-10T03:07:16Z
owner: bjorn@stabell.org
---

# [ ] Draft Silvery launch blog post — philosophy, ecosystem, origin story @km/silvery #task #P2

Draft the Silvery launch blog post that explains the philosophy, ecosystem, and origin story. This will be the flagship "here's why Silvery exists and why you should care" piece published when we go public.

## Audience

React/web developers who have either (a) hit walls with Ink, or (b) are curious about terminal apps but assumed the tooling was primitive. They know flexbox, DOM events, Playwright, design tokens.

## Narrative arc

1. **Ink proved React belongs in the terminal** — credit where due. It was the right idea.
2. **But terminal apps have grown up** — AI agents, code review tools, dashboards, editors, TUI IDEs. These aren't one-shot CLI prompts anymore.
3. **Their builders are web developers first** — they reach for overflow: scroll, onClick, focus scopes, Playwright-style tests, design tokens. Not because terminals are secretly browsers, but because these ideas have been tested across thirty years of web UI.
4. **The guiding principle** — don't surprise experienced web devs, but stay unapologetically terminal-based. Cells, screens, ANSI, scrollback. Not pixels, viewports, DOM.
5. **The quality plateau principle** — always strive for the quality plateau in architecture and developer ergonomics. No "good enough for now" ad-hoc affordances.
6. **The ecosystem** — Silvery (the framework), @silvery/test (Playwright-style testing), @silvery/commander (beautiful CLIs for free), @silvery/theme (38 palettes), Termless (multi-backend testing), terminfo.dev (caniuse for terminals), Loggily (structured logging + tracing). Each package exemplifies the same principle.
7. **The commander dog-food** — commander styles its help through Silvery, so your CLI looks like your app because it IS your app.
8. **Proof points** — 3-5× faster than Ink on mounted workloads, 918/931 Ink tests pass via @silvery/ink, bundle-parity with Ink+Yoga, pure TypeScript/no WASM, works on Bun and Node.
9. **Powerful apps with beautiful UIs, whilst unapologetically terminal.**
10. **Call to action** — try it, read the migration guide, check the component catalog.

## Structure

- Hero hook + golden positioning statement
- "React for modern terminal apps" as the through-line
- Principles section (don't surprise / stay terminal / quality plateau)
- Ecosystem layered diagram (silvery core + silvery family + larger beorn ecosystem)
- Technical highlights (layout-first pipeline, cell-level buffer, direct-to-buffer rendering)
- Honest comparison vs Ink (link to silvery-vs-ink page)
- Migration story (link to migrate-from-ink guide)
- Where it goes next (canvas/DOM targets, @silvery/create state management)

## Done when

- Draft lives in vendor/internal/silvery/launch/blog-launch-post.md
- Pro review passes
- Fact-check against vs-ink page passes
- Ready to promote to vendor/silvery/docs/blog/ when public launch gate is met

## Related

- vendor/internal/silvery/launch/chasm-positioning.md (positioning sheet)
- vendor/silvery/docs/guide/silvery-vs-ink.md (comparison)
- vendor/silvery/docs/guide/the-silvery-way.md (principles)

