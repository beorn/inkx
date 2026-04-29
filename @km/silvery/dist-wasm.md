---
id: "@km/silvery/dist-wasm"
aliases:
  - km-silvery.dist-wasm
  - km-silvery-dist-wasm
created_by: claude:e4e70c9a
created_at: 2026-03-11T07:32:08Z
owner: bjorn@stabell.org
---

# [ ] WASM distribution: run Silvery apps in browsers @km/silvery #feature #P4

Package Silvery apps to run in browsers via WebAssembly or existing multi-target rendering:

- 'Try this CLI in your browser' experience (like Textual-web)
- Embeddable in VS Code terminal panel or web IDE
- xterm.js integration for web-hosted TUIs
- Potential for Deno/WASM plugin distribution

Multi-target rendering (terminal, Canvas 2D, DOM) already exists in Silvery. This bead is about packaging and distribution — making it easy to deploy a Silvery app as a web experience.