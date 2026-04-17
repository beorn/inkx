# Launch Strategy

Two separate launches. Flexily launches on its own merits (Yoga alternative). Pretext integration launches with silvery (multi-surface rendering).

## Launch 1: Flexily (standalone)

> "Pure JS Yoga replacement — 1.5x faster, 3.5x smaller, no WASM"

**Audience**: Framework authors, canvas developers, Yoga users hitting WASM pain (async init, memory leaks, debug opacity).

**Timing**: When npm package and docs site are polished. Independent of silvery.

**Story**: Developer infrastructure. Solves real Yoga problems (120GB memory leak in Claude Code, async init blocking CLIs, WASM debug opacity). Pure JS, synchronous, set a breakpoint and step through.

**Channels**:

- HN: "Show HN: Flexily — Pure JS flexbox layout engine, Yoga-compatible API, no WASM"
- Reddit r/javascript, r/typescript
- flexily.dev docs site live with benchmarks

**What NOT to mention**: Pretext, silvery, canvas text rendering, multi-surface. Keep it focused on the Yoga replacement story. The composable API (createFlexily, pipe) is fine to show but it's a feature, not the headline.

## Launch 2: Silvery + Pretext (together)

> "React components that render identically in terminal and canvas, with real typography"

**Audience**: TUI developers, CLI builders, dashboard creators, AI tool builders. Broader than Flexily.

**Timing**: When silvery has the canvas demo working. Flexily + Pretext is the engine story; silvery is the product story.

**Story**: Same React components render in terminal (monospace) and canvas (proportional fonts via Pretext). Shrinkwrap, content-aware sizing, variable-width line routing — things CSS can't do. Show a kanban board rendering side-by-side: terminal vs canvas.

**The demo IS the pitch**: A single page showing the same `<Board>` component in terminal (ANSI) and canvas (Pretext + proportional text). The visual contrast sells itself.

**Channels**:

- HN: "Show HN: Silvery — React for terminals and canvas, same components, real typography"
- silvery.dev with interactive demos
- Blog post: "The layout engine your canvas app is missing" (from horizons.md tagline)
- Twitter/X thread showing the terminal-vs-canvas side-by-side

### Cheng Lou outreach

**Before** public launch, reach out to Cheng Lou privately:

- Show him the demo: "We built a layout engine that uses Pretext as its text measurement backend — here's 1000 nodes rendering in 35ms on canvas"
- He's well-known in the React community (Reason creator, React team alumni)
- A retweet or mention from him is worth more than any blog post
- Be specific about what Pretext enables that nothing else does: shrinkwrap, content-aware intrinsic sizing, variable-width line routing
- Offer to contribute back: conformance tests, bug reports, edge cases found

**Channel**: GitHub issue on chenglou/pretext ("Pretext powering a layout engine — feedback"), or Twitter DM if possible.

### Blog post outline: "The layout engine your canvas app is missing"

1. **The problem**: Canvas apps roll their own layout. Konva, PixiJS, tldraw — all manual positioning. CSS can't help (no DOM). Yoga helps with boxes but not text.
2. **Flexily + Pretext**: Pure JS layout + pure JS text measurement. Same API, runs anywhere JS runs. No WASM, no Canvas dependency for layout.
3. **What CSS can't do**: Shrinkwrap (tightest width preserving line count — chenglou.me/pretext/bubbles/). Content-aware intrinsic sizing (min-content, max-content from actual text). Variable-width line routing (text around floated images — chenglou.me/pretext/masonry/).
4. **The demo**: Kanban board. Terminal and canvas. Same React components. Same layout engine. Different text measurers.
5. **How to use it**: `npm install flexily`, `createFlexily()`, `setTextContent()`. Or compose: `pipe(createBareFlexily(), withPretext(pretext))`.

## Sequencing

```
Now         → Polish flexily.dev, docs, benchmarks
Soon        → Launch 1: Flexily on HN (Yoga replacement story)
When ready  → Build silvery canvas demo (same Board in terminal + canvas)
Then        → Reach out to Cheng Lou privately
Then        → Launch 2: Silvery + Pretext on HN (multi-surface React story)
```

## What each launch proves

| Launch             | Proves                                 | Unlocks                                                      |
| ------------------ | -------------------------------------- | ------------------------------------------------------------ |
| Flexily standalone | External adoption of the layout engine | Confidence that the API is right before silvery builds on it |
| Silvery + Pretext  | Multi-surface rendering works          | Canvas developers adopt silvery, Pretext gets validation     |
