---
id: "@km/silvery/tint-inverse"
aliases:
  - km-silvery.tint-inverse
  - km-silvery-tint-inverse
created_by: Bjørn Stabell
created_at: 2026-04-06T17:31:11Z
owner: bjorn@stabell.org
---

# [ ] Color blending ('/ amount') + inverse prop — unified visual modifiers @km/silvery #feature #P2

# Color Expressions + Inverse

Extend silvery's color string props with blending, opacity, and color space selection. Add inverse as a style-context transform.

## API

Every color prop is a string. The string gains an optional modifier clause:

```ebnf
ColorExpr   := BaseColor ( '/' Modifier )?
Modifier    := BlendModifier | OpacityModifier
BlendModifier := Percent ( 'in' ColorSpace )?
OpacityModifier := 'opacity' Percent
ColorSpace  := 'srgb' | 'oklch'
Percent     := number '%'
```

```tsx
backgroundColor="$primary / 6%"              // blend 6% primary into inherited bg (oklch)
backgroundColor="$primary / 12% in srgb"     // explicit sRGB blending
color="$error / 30%"                         // blend 30% error into inherited fg
borderColor="$accent / 50%"                  // works on ANY color prop
backgroundColor="$primary / opacity 50%"     // opacity (backend-dependent)
<Box inverse>                                 // swap fg/bg in style context
```

## Semantics

### Blend Basis
Each prop blends against its own inherited computed value:
- `color` blends against inherited computed foreground
- `backgroundColor` blends against inherited computed background
- `borderColor` blends against inherited computed border color

Root fallback: theme fg/bg. Blending requires both colors resolvable to concrete RGB.

### Order of Operations
1. Parse color expression
2. Resolve $tokens against current theme
3. Compute node's explicit fg/bg/border from inherited context
4. Apply inverse (swap computed fg/bg) — affects this node and descendants
5. Apply blend (mix with inherited computed value in specified space)
6. Pass computed style to children
7. Lower to backend

### Inverse
Swaps fg/bg in the style context, not just SGR 7 emission. This ensures children doing blending use the correct (post-swap) inherited colors. Backend may use SGR 7 as an optimization where safe.

Inverse affects fg/bg only, not border/outline.

### Color Space
Default: oklch (perceptually uniform, better dark-theme blends).
Override: `in srgb` suffix for legacy matching.
Implementation: cache RGB-to-OKLCH conversions. Define interpolation method and gamut mapping strategy.

### Opacity
Parsed by shared code. Backend-dependent — validated via renderer capability matrix:
  ag-term: throws (terminals have no compositing)
  ag-canvas: alpha channel (native)
  ag-dom: rgba() color values (NOT CSS opacity — that's element-level)

Mark experimental until non-term backend ships.

## Parser

Rightmost top-level `/` scanner (paren-aware, not naive split). Output is discriminated union:

```ts
type ParsedColorExpr =
  | { color: string }
  | { color: string; modifier: { kind: 'blend'; amount: number; space?: 'srgb' | 'oklch' } }
  | { color: string; modifier: { kind: 'opacity'; amount: number } }
```

## Renderer Capability Validation

Shared validation step (not ad-hoc per backend):
```ts
{ blend: true, blendSpaces: ['srgb', 'oklch'], opacity: false }  // ag-term
{ blend: true, blendSpaces: ['srgb', 'oklch'], opacity: true }   // ag-canvas, ag-dom
```

## Naming

'Tint' in docs (industry standard: React Native tintColor, SwiftUI tint(), MD3 surfaceTintColor).
Technically this is color mixing (CSS color-mix). Documented: tint means blend/mix, not color-theory 'mix with white'.

## Composition

Multiple blends: nest Boxes. Tree structure = composition order.
```tsx
<Box backgroundColor="$primary / 6%">
  <Box backgroundColor="$accent / 5%">
```

## Use Cases

Selection tinting, hover states, drag-over feedback, error/warning containers, unfocused pane dimming, active/pressed states, editing indicators, elevation tinting (MD3 pattern).

## Implementation Phases

### Phase 1: @silvery/color
- RGB to OKLCH conversion (rgbToOklch, oklchToRgb)
- oklchBlend() with defined interpolation + gamut mapping
- Mixing tests (sRGB vs oklch comparison)

### Phase 2: Core Style System
- Color expression parser (grammar above)
- Discriminated union AST
- Renderer capability validation
- Inverse in style context (swap computed fg/bg)
- ag-term blending in render phase

### Phase 3: Migration + Docs
- km: delete selectedBg(), editingBg(), blend import from theme.ts
- km: replace 5 backgroundColor={computed} sites with string expressions
- km: replace computeNodeStyle inverse with <Box inverse>
- silvery CLAUDE.md: add @silvery/color to package table, common tasks section
- silvery docs/guide/styling.md: blending + inverse guide
- silvery docs/reference/: component prop reference
- silvery README: feature list

## Future (Not in Scope)

- Element-level opacity prop (separate from value-level opacity)
- fg/bg prop rename (color->fg, backgroundColor->bg) — add as aliases if desired
- Multiple blend syntax ("$primary 6%, $accent 5%" comma form) — nest Boxes instead
- TextInput/TextArea default editing bg tint (after blending ships)

## Review History

- GPT 5.4 Pro review #1: approved string syntax, flagged parser robustness, inverse style-context requirement, blend basis definition
- GPT 5.4 Pro review #2: approved overall design, added capability validation model, discriminated union, OKLCH spec requirements, DOM opacity correction