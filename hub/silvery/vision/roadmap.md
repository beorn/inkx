# Silvery Roadmap

Implementation phasing, positioning, and prior art.

See also: [architecture.md](../design/v10-terminal/architecture.md) | [packages.md](ref/packages.md)

## What Silvery Is

Silvery helps teams build keyboard-first, data-dense apps that work in terminal and browser from one React-oriented stack, with owned layout/text and interaction primitives where browser defaults break down.

Terminal is the proof. Canvas is the expansion. The same components, same layout, same tests. The moat is the combination: owned layout (Flexily) + owned text (Pretext) + terminal + canvas + React ecosystem.

### Modular Adoption

The stack is modular -- packages like @silvery/headless, silvery-tea interaction primitives, and Pretext utilities are independently useful. But the primary story is the full-stack experience, not individual pieces. The individual pieces grow organically as the stack matures.

## Recommended Phasing

Dogfood drives priority. Every item should be defined before it is built. De-prioritize DOM standalone (under-specified, low-value), multi-framework bindings (keep architecture clean but don't pay API tax early), remote streaming, and docily/textily-heavy work (until canvas/input/semantics path is proven).

| Phase                                 | Focus                                          | What to ship                                                                                                           | Status                       |
| ------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **0. Dogfood app + contracts**        | Start immediately, in parallel with everything | Pick a serious keyboard-first app (km canvas?). Define style resolution, commit pipeline, semantics concept.           | Active (km canvas)           |
| **1. Text subsystem**                 | First real build step                          | TextLayoutService, three measurers, resolveTextStyle(), conformance tests.                                             | Shipped (flexily v0.5.0)     |
| **2. Browser input bridge spike**     | Pull the hard risk forward                     | Hidden textarea, focus sync, keyboard routing, minimal hit test. This is where canvas apps break -- discover it early. | Shipped (ag-react/ui/canvas) |
| **3. Display list**                   | With metadata                                  | save/restore, resource IDs, nodeId->op spans. Canvas consumes first.                                                   | Planned                      |
| **4. Semantics + interaction basics** | Interleaved, not separate                      | Minimal semantics for actual shipped widgets. Minimal hit-test/focus/scroll for the dogfood app.                       | Planned                      |
| **5. Signals optimization**           | Only with profiling data                       | Requires invalidation boundaries.                                                                                      | Future                       |
| **6. Export surfaces**                | SVG/image/snapshot                             | PDF later.                                                                                                             | Future                       |
| **7. Second framework binding**       | Only after real pressure                       | Architecture hygiene, not product priority.                                                                            | Future                       |

## Prior Art

Silvery sits at the intersection of several existing approaches. No single system combines all the same pieces, but each validates part of the architecture.

| System                              | What it proves                                                                                                                                                                    | Where silvery differs                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flutter**                         | Full stack ownership works (widget -> render -> layer -> semantics tree). Closest architectural comparison.                                                                       | Flutter is C++/Dart/WASM, much more complete in text shaping, compositor, platform embedding. Silvery is pure JS, terminal-first, React-ecosystem.                                          |
| **Google Docs** (canvas mode, 2021) | Canvas rendering + custom text engine + semantic a11y layer is production-viable for text-heavy apps.                                                                             | Docs is a single product, not a framework. Silvery extracts this into reusable packages.                                                                                                    |
| **PDF.js**                          | Canvas + text layer + annotation layer is the canonical FOSS reference for canvas + DOM mirror.                                                                                   | PDF.js is a viewer, not an interactive UI framework.                                                                                                                                        |
| **tldraw**                          | Hierarchical statechart interaction architecture. Best open-source reference for tool-driven pointer state machines, persistent/transient state split, composable tool semantics. | tldraw is an infinite-canvas app framework, not a general UI layout engine. Uses DOM/SVG/React, not custom rendering. silvery-tea's state machines align with tldraw's statechart approach. |
| **dnd-kit**                         | Proves custom pointer DnD beats browser DnD for in-app sorting. Sensors + collision detection architecture separates geometry from drag logic.                                    | dnd-kit is React-specific, DOM-only. Silvery's interaction index generalizes the sensor pattern across terminal/canvas/DOM.                                                                 |
| **Monaco**                          | Proves hidden-input + full-control strategy works for text editors. Owns selection, cursor, scroll, viewport, focus -- browser is just a keyboard/IME pipe.                       | Monaco is a code editor, not a general UI framework. Silvery's docily/textily layer will use the same hidden-input pattern for cross-surface text editing.                                  |
| **ProseMirror**                     | Proves model-driven contentEditable hybrid works for rich text. Transactions + DOM sync + plugin architecture is the most robust rich-text foundation.                            | ProseMirror is DOM-only. Silvery's textily layer targets terminal + canvas + DOM from the same editing model.                                                                               |
| **React Native**                    | Reconciler-agnostic host tree, platform-native accessibility.                                                                                                                     | RN targets native mobile views. Silvery targets canvas/terminal/export from one tree.                                                                                                       |
| **Ink**                             | React reconciler for terminal. The clearest immediate alternative in the terminal niche.                                                                                          | Ink is terminal-only. Silvery is terminal + canvas + export from the same components.                                                                                                       |
| **PixiJS**                          | Accessibility plugin (DOM overlays for canvas objects) shows generic a11y overlay is possible.                                                                                    | PixiJS is a 2D scene graph, not a layout/component framework.                                                                                                                               |

Flutter's architecture is the closest analog. Flutter has five trees: widget, element, render object, layer, semantics. Silvery has: AgNode tree, layout tree (Flexily), display list, semantics tree, interaction index. The correspondence is intentional. The difference: Flutter is a full platform runtime with native embedding, mature text shaping (HarfBuzz), and production compositor. Silvery is pure JS, React-first, and proves itself through the terminal -- a target Flutter can't reach.

## Naming & Terminology

The industry has no established term for what silvery is. Reference for consistent language.

| Term                        | Used by                    | Why it doesn't fit silvery                                                    |
| --------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| **Canvas-based rendering**  | Google (Docs announcement) | Too narrow -- excludes terminal, SVG, PDF, remote.                            |
| **Custom rendering engine** | Flutter, Figma             | Better, but implies a single runtime. Silvery is a composable library stack.  |
| **Non-DOM rendering**       | General web discourse      | Defines by negation. Silvery's DOM standalone target IS DOM.                  |
| **Retained-mode UI**        | Graphics/game programming  | Too low-level, implies scene graph. Silvery has a component model above that. |
| **Owner-draw**              | Win32 / native UI          | Right concept (the app controls painting), wrong era.                         |
| **GPU-accelerated UI**      | Marketing                  | Silvery works fine without a GPU (terminal, PDF, image export).               |

**What silvery should say:** "Apps that own their rendering pipeline." The unifying property is **pipeline ownership** -- whether the app or the browser/platform controls positioning and painting.

**The three-projections test:** Display list + semantics tree + interaction index. If you only produce pixels, you have a rendering library. If you produce all three projections from one tree, you have a UI engine.

## The Unique Combination

No single system combines: pure JS layout (Flexily) + pure JS text measurement (Pretext) + React reconciler + terminal + canvas + interaction state machines + document editing -- from one codebase, one component tree, framework-agnostic.

The best wedge: **keyboard-first, data-dense productivity tools that work in browser/Electron and terminal**. The broader vision (cross-framework, universal render target) may follow, but the immediate value is one React app that runs in terminal and canvas, with owned layout and real typography.

## References

- [pretext-integration.md](../design/v05-layout/pretext-integration.md) — Pretext + Flexily integration details
- [rendering-targets.md](../design/v20-canvas/rendering-targets.md) — Surface adapter matrix + DOM mirror + prior art
- [design/v10-terminal/](../design/v10-terminal/) — silvery-tea signals/commands architecture
- km docs: [tea.md](../../../docs/design/tea.md) — TEA principle
- km docs: [universal-editor.md](../../../docs/future/universal-editor.md) — docily/textily vision
- Beads: km-silvery.engine (vision), km-silvery.engine.text (text subsystem), km-silvery.tea (signals), km-silvery.pro-review-vision
