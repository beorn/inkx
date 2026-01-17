# Additional TUI Framework Survey

## Overview

Extended research into TUI frameworks beyond the initial survey, focusing on layout systems, constraint mechanisms, and implementation approaches.

---

## FTXUI (C++)

**Repository**: [github.com/ArthurSonzogni/FTXUI](https://github.com/ArthurSonzogni/FTXUI)

A functional-style C++ library for terminal UIs with proper flexbox support.

### Layout System

```cpp
// Horizontal/vertical arrangement
auto layout = hbox({
    text("left"),
    separator(),
    text("right") | flex  // flex decorator for flexible sizing
});

// Grid arrangement
auto grid = gridbox({
    {text("1,1"), text("1,2")},
    {text("2,1"), text("2,2")},
});
```

### Flexbox Configuration

FTXUI provides `FlexboxConfig` with:

- **Direction**: Row, column, row-reverse, column-reverse
- **Wrap**: No-wrap, wrap, wrap-reverse
- **Justify content**: Flex-start, flex-end, center, space-between, space-around, space-evenly
- **Align items/content**: Similar to CSS flexbox

### Key Features

- Pipe operator for decorators: `element | bold | color(Color::Red)`
- Responsive to terminal dimensions
- Cross-platform (Linux, macOS, Windows, WebAssembly)

### Assessment

**Pros**: Proper flexbox, functional style, performant
**Cons**: C++ only, different ecosystem
**Relevance**: Shows flexbox can work in terminal - Ink uses Yoga but doesn't expose computed sizes

---

## Dioxus-TUI / Rink (Rust)

**Repository**: [github.com/DioxusLabs/rink](https://github.com/DioxusLabs/rink) (archived, moved to dioxus)

React-like TUI framework for Rust, essentially a Rust port of Ink.

### Layout System

Uses flexbox-based layout with familiar web syntax:

```rust
rsx! {
    div {
        style: "display: flex; flex-direction: row;",
        div { style: "width: 50%;" }
        div { style: "flex: 1;" }
    }
}
```

### Key Features

- CSS-like inline styles
- HTML-like semantic structure
- No JavaScript runtime dependency
- Event handling similar to React

### Status

**Archived** in June 2023, moved to main Dioxus package. The README notes "some bugs in the flexbox implementation might be quirky at times."

### Assessment

**Pros**: Familiar React patterns, no JS runtime
**Cons**: Rust only, archived/moved, flexbox bugs
**Relevance**: Validates React-like approach works, but Rust ecosystem

---

## Cursive (Rust)

**Repository**: [github.com/gyscos/cursive](https://github.com/gyscos/cursive)

Widget-based TUI library with explicit size constraints.

### Layout System

Uses LinearLayout for horizontal/vertical arrangement:

```rust
let layout = LinearLayout::horizontal()
    .child(TextView::new("Label"))
    .child(EditView::new().fixed_width(20))
    .child(Button::new("OK", |s| s.quit()));
```

### Size Constraints via BoxView/ResizedView

```rust
// Fixed size
view.fixed_size((20, 5))

// Minimum size
view.min_width(10).min_height(5)

// Maximum size
view.max_width(50)

// Full width/height
view.full_width()

// Squishable (allows shrinking below preferred)
BoxView::new(view).squishable()
```

### Key Features

- Explicit constraint methods: `fixed_size`, `min_width`, `max_width`, `full_width`, etc.
- "Squishable" concept - allows views to shrink below preferred size when space is tight
- Event bubbling through view hierarchy

### Assessment

**Pros**: Explicit constraints, squishable concept useful
**Cons**: Rust only, widget-based (not declarative)
**Relevance**: `min_width`/`max_width`/`squishable` pattern could inform Ink wrapper design

---

## Notcurses (C)

**Repository**: [github.com/dankamongmen/notcurses](https://github.com/dankamongmen/notcurses)

Low-level, high-performance TUI library with thread-safe design.

### Layout System

Uses "planes" and "piles" rather than constraint-based layout:

```c
struct ncplane* plane = ncplane_create(parent, &options);
ncplane_move_yx(plane, y, x);  // Absolute positioning
ncplane_resize(plane, keepy, keepx, keepleny, keeplenx, ...);
```

### Key Concepts

- **Planes**: Rectangular regions with z-ordering
- **Piles**: Independent rendering contexts (thread-safe)
- **No automatic layout**: Manual positioning and sizing

### Assessment

**Pros**: Extremely performant, thread-safe, multimedia support
**Cons**: Low-level, manual layout, C only
**Relevance**: Different paradigm (immediate mode), not applicable to our needs

---

## Textual Lessons (Python)

From Will McGugan's blog post ["7 Things I've Learned Building a Modern TUI Framework"](https://www.textualize.io/blog/7-things-ive-learned-building-a-modern-tui-framework/):

### Key Technical Insights

1. **"Overwrite, don't clear"** - Write updates in single operations, use Synchronized Output protocol. Targets 60fps.

2. **DictView set operations** - Use Python's KeysView/ItemsView for efficient diff detection between render frames.

3. **LRU caching for layout** - Cache sizes of 1000-4000 entries. Layout calculations called thousands of times.

4. **Immutable data structures** - Tuples, NamedTuples, frozen dataclasses. Easier to cache and reason about.

5. **Fractions for layout precision** - Floating-point causes visible gaps. `Fraction(1, 10) + Fraction(1, 10) == Fraction(2, 10)` is exact.

6. **Unicode/emoji are problematic** - Multi-codepoint emoji render inconsistently. Stick to Unicode 9 emoji.

### Assessment

**Relevance**: These insights directly applicable to Ink constraint system:

- Cache layout calculations
- Use fractions/integers for width distribution
- Avoid floating point

---

## Yoga Layout (Used by Ink)

**Website**: [yogalayout.dev](https://www.yogalayout.dev/)
**Repository**: [github.com/facebook/yoga](https://github.com/facebook/yoga)

Ink already uses Yoga for flexbox. Understanding Yoga helps understand what's available.

### How Yoga Works

Three-pass algorithm (from ["How to Write a Flexbox Layout Engine"](https://tchayen.com/how-to-write-a-flexbox-layout-engine)):

1. **Pass 1 (Top-Down)**: Traverse tree, prepare queues
2. **Pass 2 (Bottom-Up)**: Resolve automatic sizes from content
3. **Pass 3 (Top-Down)**: Apply flex calculations, positioning, percentages

### What Yoga Provides

- Full flexbox: direction, wrap, justify, align
- Min/max constraints
- Percentage sizing
- Aspect ratios
- Performance optimizations (caching, minimal re-measurement)

### What Ink Exposes

Ink exposes Yoga's properties on `<Box>`:

- `flexDirection`, `flexGrow`, `flexShrink`, `flexBasis`
- `alignItems`, `alignSelf`, `justifyContent`
- `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`
- `padding`, `margin`

### What Ink Doesn't Expose

- **Computed dimensions**: Children can't query their calculated size
- **Layout callbacks**: No way to get notified when layout completes
- **measureElement timing**: Returns 0 until after first render

### Assessment

**Key Insight**: Yoga already does the hard work. Ink just doesn't expose the results.

A constraint system could potentially:

1. Hook into Yoga's output somehow, or
2. Implement a parallel constraint solver that mirrors Yoga's behavior

---

## Summary Table

| Framework  | Language | Layout Approach        | Constraint Types                | Computed Size Access |
| ---------- | -------- | ---------------------- | ------------------------------- | -------------------- |
| FTXUI      | C++      | Flexbox                | flex decorator, direction, wrap | Via callbacks        |
| Dioxus-TUI | Rust     | Flexbox (CSS-like)     | inline styles                   | Implicit             |
| Cursive    | Rust     | LinearLayout + BoxView | min/max/fixed/full              | Squishable concept   |
| Notcurses  | C        | Manual planes          | None (absolute)                 | Manual               |
| Textual    | Python   | CSS Grid + Flexbox     | fr units, grid-size             | Via CSS queries      |
| Yoga       | C++      | Flexbox                | Full CSS flexbox                | **Yes** (internally) |
| Ink        | JS       | Yoga (partial)         | Yoga props                      | **No**               |

---

## Key Takeaways for Ink Constraint System

### 1. Yoga Already Solves Layout

Yoga performs three-pass layout with caching. Ink uses Yoga. The problem is **exposure**, not algorithm.

### 2. Multiple Viable Approaches

- **Cursive style**: Explicit constraint methods (`min_width`, `max_width`, `squishable`)
- **Textual style**: CSS-like properties with `fr` units
- **Cassowary style**: Declarative constraints with solver (Ratatui)

### 3. Specific Techniques to Consider

- **Fractions over floats** for width distribution (Textual)
- **LRU caching** for layout calculations (Textual)
- **Squishable concept** for graceful degradation (Cursive)
- **Constraint priorities** for conflict resolution (Cassowary)

### 4. What We Actually Need

For Ink, we need a thin layer that:

1. Provides terminal dimensions to the component tree
2. Allows declaring constraints (min/max/flex/fixed)
3. Computes and distributes remaining space
4. Exposes computed dimensions to children via context

This doesn't require replacing Yoga - just wrapping it with dimension exposure.
