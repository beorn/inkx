# Rendering Targets (platforms)

Silvery's architecture separates layout (Flexily) from rendering (rendering targets / platforms). The laid-out tree produces three projections — visual (display list), semantic (accessibility tree), and interaction (hit-test/focus/selection) — each consumed by different subsystems. See [architecture.md](../v10-terminal/architecture.md) for the full architecture.

This document covers the visual projection: rendering targets that consume the display list. The DOM accessibility mirror is covered separately below — it consumes the semantics tree, not the display list.

## Visual Surface Matrix

| Surface         | Text Measurement          | Rendering                             | Layout Units            | Status                  | Use Case                          |
| --------------- | ------------------------- | ------------------------------------- | ----------------------- | ----------------------- | --------------------------------- |
| Terminal        | MonospaceMeasurer         | ANSI escape sequences to stdout       | Cell (cols x rows)      | Shipping                | SSH, CLI, dev tools               |
| Canvas          | PretextMeasurer           | CanvasRenderingContext2D              | Pixel                   | Shipping (proportional) | Browser apps, Electron/Tauri      |
| DOM standalone  | Browser native            | Real DOM elements + CSS               | Pixel (browser-managed) | Future (de-prioritized) | Web apps where DOM is the target  |
| SVG             | PretextMeasurer           | SVG elements (text, rect, g)          | Pixel                   | Planned                 | Export, docs, static renders      |
| PDF             | PretextMeasurer           | PDF draw commands                     | Point                   | Planned                 | Print, reports, export            |
| Image snapshot  | PretextMeasurer           | OffscreenCanvas -> PNG/JPEG           | Pixel                   | Planned                 | Testing, thumbnails, social cards |
| Remote stream   | PretextMeasurer           | Serialized display ops over WebSocket | Pixel                   | Future                  | Remote display                    |
| Test (headless) | DeterministicTestMeasurer | Virtual buffer                        | Fixed grapheme widths   | Shipping                | CI, unit tests, snapshots         |
| WebGL/WebGPU    | PretextMeasurer           | GPU text atlas + draw calls           | Pixel                   | Future                  | High-performance, large scenes    |

## Text Measurement Rule

**If silvery owns positioning, Pretext measures. If the browser owns positioning, let it.**

- Canvas, SVG, PDF, image, remote, WebGL, DOM mirror: silvery positions everything -> Pretext measures text
- Terminal: silvery positions in cell grid -> monospace measurer
- DOM standalone: browser positions text -> browser's own text engine
- Test: silvery positions -> deterministic measurer (reproducible, no canvas dependency)

## Display List

Target-neutral draw ops. The universal output format between layout and rendering targets.

```typescript
type DisplayOp =
  // Structure + compositing
  | { op: "save" }
  | { op: "restore" }
  | { op: "transform"; matrix: Mat3 }
  | { op: "clipRect"; rect: Rect }
  | { op: "clipPath"; path: PathData }
  | { op: "pushLayer"; opacity?: number; blendMode?: BlendMode }
  | { op: "popLayer" }

  // Semantic UI ops (terminal renders directly via box chars / monospace text)
  | { op: "drawBox"; rect: Rect; background?: Brush; border?: BorderSpec; radii?: CornerRadii; shadow?: ShadowSpec[] }
  | { op: "drawParagraph"; paragraph: ParagraphRef; origin: Point }
  | { op: "drawImage"; image: ImageRef; dest: Rect }

  // Vector ops (terminal approximates with braille/block chars, or skips)
  | { op: "drawLine"; p1: Point; p2: Point; stroke: StrokeSpec }
  | { op: "drawPath"; path: PathData; fill?: Brush; stroke?: StrokeSpec }
```

Two kinds of ops: **semantic** (drawBox, drawParagraph — terminal renders these natively) and **vector** (drawPath, drawLine — canvas/WebGL only, terminal approximates or skips). This enables capability-based degradation without if/else per surface.

Flat, no traversal API. The scene graph owns the spatial model; the display list is one-way output. `save`/`restore` and `pushLayer`/`popLayer` provide explicit stack/compositing semantics.

**Metadata side tables** (not in the ops themselves): `nodeId → [startOp, endOp)` mapping, per-op bounds, resource IDs. Enables dirty repaint, signal-driven partial updates, remote diffs, and devtools inspection.

Each visual rendering target consumes the same display ops:

| Adapter  | How it consumes DisplayOps                                                   |
| -------- | ---------------------------------------------------------------------------- |
| Terminal | Rasterize to cell grid (char + fg + bg + attrs per cell), emit ANSI diff     |
| Canvas   | Execute on CanvasRenderingContext2D (fillRect, fillText, save/restore, clip) |
| SVG      | Emit SVG elements (rect, text, g with transform)                             |
| PDF      | Emit PDF draw commands (via pdf-lib or similar)                              |
| Image    | Render to OffscreenCanvas, export as PNG/JPEG                                |
| Remote   | JSON-serialize ops, send over WebSocket                                      |
| Test     | Capture to virtual buffer for assertions                                     |

The DOM accessibility mirror is NOT a display-list consumer — it consumes the semantics tree. See the next section.

## DOM Accessibility Mirror (semantic projection)

**This is NOT a visual rendering target.** The DOM mirror consumes the **semantics tree**, not the display list. It is documented here because it shares the same canvas-app context, but it is architecturally a semantics consumer alongside test automation and AI agents.

For custom-rendered apps that need screen reader support and browser input integration. Same pattern as Google Docs (canvas mode, 2021), Figma, Flutter web (CanvasKit), PDF.js, xterm.js.

Screen readers can't derive roles/labels from draw ops. The mirror should only contain semantically meaningful elements — decorative nodes are omitted. A 1:1 AgNode mirror would create junk DOM and poor accessibility.

The mirror is driven by a `SemanticsNode` model (see [architecture.md](../v10-terminal/architecture.md) for the full type). DOM mirror, tests, and AI agents all consume the same semantic source of truth. Decorative nodes are excluded; logical structure may differ from visual z-order.

### Architecture

Two layers occupy the same space:

```html
<div style="position: relative">
  <!-- Visual layer: what the user sees -->
  <canvas style="position: absolute; inset: 0" />

  <!-- Semantic layer: what screen readers and browsers see -->
  <div style="position: absolute; inset: 0; pointer-events: none">
    <!-- Invisible elements positioned from Flexily computed bounds -->
    <button
      style="position: absolute; left: 20px; top: 100px;
                   width: 80px; height: 32px; opacity: 0"
      aria-label="Save"
    />
    <div role="listbox" style="position: absolute; ..." aria-label="File list">
      <div role="option" aria-selected="true">main.ts</div>
      <div role="option">utils.ts</div>
    </div>
    <!-- Hidden textarea for text input -->
    <textarea style="position: absolute; opacity: 0" aria-label="Search" />
  </div>
</div>
```

### How It Works

1. After each Flexily layout pass, silvery knows every node's computed bounds.
2. The DOM mirror walks the **SemanticsNode tree** (not the AgNode tree) and updates `left/top/width/height` on corresponding invisible DOM elements. Not every AgNode produces a SemanticsNode — decorative nodes are omitted, and some semantics nodes correspond to composite/derived structures.
3. This is cheap — absolutely positioned elements are out of normal flow, so updates are more localized than full document reflow. They still participate in style/paint/compositing, but the cost is low for invisible elements.
4. The DOM mirror is a **write-only projection**. We write positions and ARIA attributes. We never read measurements.

### What Each Layer Handles

| Concern                | Canvas                            | DOM mirror                               |
| ---------------------- | --------------------------------- | ---------------------------------------- |
| Visual rendering       | Yes                               | No (opacity: 0)                          |
| Mouse/pointer events   | Yes (hit-test via Flexily bounds) | No (pointer-events: none)                |
| Keyboard input         | Via hidden textarea               | Textarea captures keystrokes             |
| Screen readers         | No                                | Yes (ARIA roles, labels, tree structure) |
| Focus order            | Silvery's focus manager           | Mirrored via tabindex                    |
| Text selection visuals | Painted on canvas                 | Not used                                 |
| IME/clipboard          | No                                | Hidden textarea handles it               |
| Browser find-in-page   | No (canvas is opaque)             | Could expose text content                |

### When to Use

The DOM mirror is for canvas-rendered apps that need production accessibility. It's not needed for:

- Terminal apps (terminal has its own accessibility model)
- Internal tools where accessibility requirements are lighter
- Export/snapshot targets (no interaction)

It IS needed for:

- Public-facing canvas apps
- Apps with accessibility compliance requirements
- Apps where users need screen reader support, browser autofill, or native clipboard

### Implementation Notes

- Each SemanticsNode gets a corresponding DOM element — not every AgNode produces a SemanticsNode
- Only interactive and labeled elements get mirrored; decorative nodes are omitted
- Semantics derivation rules TBD — see `SemanticsNode` type in [architecture.md](../v10-terminal/architecture.md) for the target shape
- Focus synchronization: silvery's focus manager and DOM tabindex must agree
- Hidden textarea: positioned at the cursor location when a TextInput is focused, captures IME composition, clipboard paste, spellcheck suggestions
- Cost: updating `style.left/top` and `aria-*` attributes on absolutely positioned elements is low — they are out of normal flow, so updates are localized

## DOM Standalone — Future (de-prioritized)

A separate adapter where silvery creates real DOM elements and lets the browser handle text layout. This is NOT the DOM mirror — it's a full DOM rendering target.

- Flexily computes box layout (positions, sizes)
- Text within boxes uses browser's own layout engine (no Pretext)
- Real DOM elements with real CSS for text styling
- Full browser accessibility, selection, input for free
- Trade-off: less deterministic, less control, no terminal parity

Under-specified. Flexily needs text intrinsic sizes to size boxes, so this requires either a DOM-measurement feedback loop, approximation, or accepting layout drift. Contract TBD.

## Prior Art & References

The canvas + DOM mirror pattern is the architecture of every serious custom-rendered web application. The industry has converged on a common shape: custom-render the visual scene, keep the app shell in DOM, use active DOM overlays for text editing, and add as much semantic mirror as the product can afford.

### Three Sub-Patterns

Production apps use one of three DOM bridge strategies, depending on how much text/semantics they need:

| Pattern                   | Description                                                                                                                             | Examples                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Minimal bridge**        | One hidden textarea/contenteditable for keyboard/IME/clipboard. No semantic mirror.                                                     | Figma, Canva, most design/whiteboard tools                                                                             |
| **Active-editor overlay** | When editing text, create a real DOM element positioned over the canvas object. On commit, write back to model and re-render to canvas. | Excalidraw, Konva (official guidance), Fabric.js IText                                                                 |
| **Full semantic mirror**  | Maintain a transparent/offscreen DOM tree mirroring text/structure for accessibility, selection, find-in-page.                          | PDF.js (text layer + annotation layer), Google Docs (canvas mode), Flutter web (CanvasKit semantics overlay), xterm.js |

### Production Apps

| App                         | Visual Surface                  | DOM Bridge Style                                                         | Key Detail                                                                                  |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **Google Docs**             | Canvas 2D (since 2021)          | Custom text engine + hidden input + semantic a11y layer                  | Moved from DOM to canvas for performance/consistency. Warned extensions about DOM breakage. |
| **PDF.js**                  | Canvas per page                 | Full text layer (positioned spans) + annotation layer (real links/forms) | The canonical FOSS reference architecture for canvas + DOM mirror.                          |
| **xterm.js**                | Canvas/WebGL/DOM renderers      | Hidden textarea + accessibility tree                                     | Proves the pattern applies beyond documents to any custom-rendered text surface.            |
| **Flutter web** (CanvasKit) | Skia via WASM/WebGL             | Framework-managed semantics tree projected as DOM overlay                | Formalizes the pattern at the framework level: rendering tree != semantics tree.            |
| **Figma**                   | Custom rendered scene           | Minimal bridge (hidden input, custom hit-test)                           | Design canvas has limited semantic mirroring due to arbitrary geometry.                     |
| **Excalidraw**              | Canvas                          | Active textarea overlay + clipboard bridge                               | Open-source, easiest to study. Classic active-editor overlay.                               |
| **tldraw**                  | Mostly DOM/SVG/React            | Not a strict canvas mirror app                                           | Useful contrast: scene-graph UX without the mirror problem.                                 |
| **PixiJS**                  | WebGL/canvas                    | Accessibility plugin creates DOM overlays for canvas objects             | One of the best FOSS generic a11y overlay approaches.                                       |
| **Word web**                | More DOM-centric than Docs      | Custom model over DOM, strong ARIA                                       | No public canvas migration; relies more on native browser a11y.                             |
| **Excel/PowerPoint web**    | Hybrid (virtualized grid/scene) | Native input for active cell/text box + custom rendering                 | Standard hybrid approach.                                                                   |
| **iWork web**               | Likely hybrid/custom from start | Custom model + native input overlays                                     | Little public architecture info; Apple published no renderer deep-dive.                     |

### Key Standards

- **EditContext** (WICG/Chromium): The most important standards development for custom-rendered editors. Gives a cleaner path for IME, composition, text services, and caret geometry without hidden textarea hacks. Not yet cross-browser.
- **AOM (Accessibility Object Model)**: Virtual accessibility nodes without DOM. Promising but not broadly available.
- **WAI-ARIA Graphics Module**: Semantics for graphics content. Limited adoption/support.

### Industry Trends

- Advanced editors increasingly use custom rendering + custom selection/layout + custom collaboration overlays, but still need the browser for IME, mobile keyboards, composition, accessibility, and clipboard.
- No end-to-end "build a fully accessible canvas editor" FOSS library exists -- the hard integration (text input, semantics, selection, clipboard, screen-reader model) is still custom work. This is the gap silvery fills.
- The practical winning pattern is hybrid: custom-render the heavy scene, DOM for shell, active overlays for text editing, semantic mirror as budget allows.

### References

- Bead: km-silvery.pretext (vision), km-silvery.pretext-prototype (concrete first step), km-silvery.pro-review-vision
- Pretext integration: [pretext-integration.md](../v05-layout/pretext-integration.md)
- Full stack vision: [architecture.md](../v10-terminal/architecture.md)
