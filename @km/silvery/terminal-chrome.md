---
mentions:
  - km
id: "@km/silvery/terminal-chrome"
aliases:
  - km-silvery.terminal-chrome
  - km-silvery-terminal-chrome
created_by: claude:4929065a
created_at: 2026-04-02T17:43:58Z
owner: bjorn@stabell.org
---

# [ ] TerminalChrome component: styled terminal frame for React, Vue, MDX, SVG @km/silvery #feature #P2

A framework-agnostic styled terminal container — window bar (traffic light dots), padding, border radius, themed background. Wraps any content.

## Four implementations, one concept

1. SVG renderer (termless) — screenshotSvg() options (done — padding, borderRadius, windowBar)
2. React component (silvery) — <TerminalChrome> for TUI apps and renderString
3. Vue component (VitePress) — <TerminalChrome> for silvery.dev, termless.dev docs
4. MDX component — <TerminalChrome> for Docusaurus/Next.js docs

## React (silvery)

```tsx
<TerminalChrome theme="dracula" windowBar="colorful" padding={20} borderRadius={12}>
  <TapePlayer file="demo.tape" />
</TerminalChrome>

// Static content for docs/screenshots
<TerminalChrome theme="nord" windowBar="rings">
  <Text>$ npm install silvery</Text>
  <Text color="green">added 3 packages</Text>
</TerminalChrome>
```

## Vue (VitePress docs)

~~~~vue
<TerminalChrome theme="dracula" windowBar="colorful">

```bash
$ npm install silvery
added 3 packages in 0.4s
~~~~

</TerminalChrome>
```

CSS-only for web — no SVG needed. Wraps markdown code fences in terminal chrome.

## MDX

Same as Vue but for React-based doc frameworks.

## Design

TerminalChrome knows nothing about terminals — it's a styled container:

- Props: theme, windowBar, padding, borderRadius, margin, marginFill, title
- Renders: outer frame (margin/fill), window bar (dots + optional title), padded content area
- Compose with TapePlayer, TerminalView, or static Text content

TapePlayer is separate — executes tape commands, produces terminal state.
TerminalView is separate — renders live terminal cell grid.

## Implementation plan

Phase 1: React component in silvery (renders to terminal via silvery pipeline)
Phase 2: VitePress plugin for silvery.dev + termless.dev (CSS-based)
Phase 3: Export as @silvery/terminal-chrome for standalone use

