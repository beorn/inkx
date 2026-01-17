# OpenTUI Bug Severity and Upstream Assessment

## Overview

This document assesses the 3 known OpenTUI bugs with 5 alternative resolution approaches for each.

**OpenTUI Version**: 0.1.74 (latest as of 2026-01-16)
**Activity Level**: Very active - multiple releases per week
**Stars**: 7,510

---

## Bug 1: Color Rendering (Issue 002) - BLOCKING

**Summary**: When both `color` and `backgroundColor` props are set on a `<text>` element, the `color` prop is completely ignored. All text renders as white.

**Impact**: Selection highlighting broken - can't show black text on cyan background.

**Upstream Status**: Not yet filed; no matching issues found in search.

### Resolution Approaches

#### Approach 1: Use inverse Styling

**Concept**: Use `inverse` prop which swaps foreground/background.

```typescript
// Instead of:
<text backgroundColor="cyan" color="black">Selection</text>

// Use:
<text inverse>Selection</text>
```

**Assessment**:

- **Pros**: Works today; simple change
- **Cons**: Can't control exact colors; elements within selection (icons) can't have different colors; doesn't work for colored status icons on selection background
- **Verdict**: Partial workaround - breaks for complex content

#### Approach 2: ANSI Escape Sequences Directly

**Concept**: Bypass OpenTUI styling, embed ANSI codes in text content.

```typescript
const cyan_bg_black_fg = '\x1b[48;5;14m\x1b[30m';
const reset = '\x1b[0m';

<text>{cyan_bg_black_fg}Selection{reset}</text>
```

**Assessment**:

- **Pros**: Full control over colors
- **Cons**: Bypasses OpenTUI's styling system; may conflict with renderer; ugly code; defeats purpose of using JSX
- **Verdict**: Hack - not a real solution

#### Approach 3: File Upstream Issue and Wait

**Concept**: Report bug to anomalyco/opentui, wait for fix.

**Assessment**:

- **Pros**: Proper fix at the source; benefits everyone
- **Cons**: Unknown timeline; OpenTUI is active but this is a core renderer bug; could take weeks/months
- **Verdict**: Should do this regardless, but can't rely on timeline

#### Approach 4: Contribute Fix to OpenTUI

**Concept**: Investigate Zig renderer source, submit PR.

**Assessment**:

- **Pros**: Control over timeline; contributes to open source
- **Cons**: Zig expertise required; OpenTUI renderer is complex; significant time investment (1-2 weeks); may not be accepted
- **Verdict**: High effort, uncertain outcome

#### Approach 5: Avoid backgroundColor for Selection

**Concept**: Use different visual indicator for selection.

```typescript
// Instead of background color, use:
<text bold underline>Selection</text>
// or
<text>▶ Selection</text>
```

**Assessment**:

- **Pros**: Works with current OpenTUI
- **Cons**: Violates design system (cyan bg = selection); less visible; inconsistent with TUI1
- **Verdict**: UX regression - not acceptable

### Conclusion for Bug 1

**Severity**: BLOCKING
**Best approach**: File upstream + use inverse as temporary workaround
**Self-fix effort**: 1-2 weeks (Zig renderer knowledge required)
**Risk**: High - core rendering bug in upstream dependency

---

## Bug 2: Bracket/Space Rendering (Issue 003) - BLOCKING

**Summary**: Text containing brackets followed by JSX expression spaces `{" "}` may not render correctly. `[P1] ` renders as `[P1` (missing `]` and space).

**Impact**: Priority badges broken; spacing between elements broken.

**Upstream Status**: Not yet filed; no matching issues found.

### Resolution Approaches

#### Approach 1: Concatenate into Single String

**Concept**: Avoid JSX expressions for whitespace, use single strings.

```typescript
// Instead of:
<text>[{priority}]{" "}</text>

// Use:
<text>{`[${priority}] `}</text>
```

**Assessment**:

- **Pros**: Works around the bug; simple change
- **Cons**: Less readable JSX; harder to style individual parts; may not work if issue is character clipping
- **Verdict**: Try first - may solve it

#### Approach 2: Use Explicit Spacer Elements

**Concept**: Use separate text elements for spacing.

```typescript
<box flexDirection="row">
  <text>[{priority}]</text>
  <text> </text>
  <text>{title}</text>
</box>
```

**Assessment**:

- **Pros**: Explicit structure; each element styled separately
- **Cons**: More verbose; may have same bug if it's width calculation issue
- **Verdict**: Worth testing

#### Approach 3: Use Unicode Non-Breaking Space

**Concept**: Use `\u00A0` instead of regular space.

```typescript
<text>[{priority}]\u00A0</text>
```

**Assessment**:

- **Pros**: Different character might avoid bug
- **Cons**: May affect text selection; could have other rendering issues
- **Verdict**: Unlikely to help if it's a width issue

#### Approach 4: Investigate Width Calculation

**Concept**: Debug OpenTUI's text measurement to find root cause.

**Assessment**:

- **Pros**: Understanding root cause enables proper fix
- **Cons**: Time consuming; may be in Zig code (harder to debug)
- **Verdict**: Good for upstream contribution

#### Approach 5: Use Padding Instead of Trailing Space

**Concept**: Use marginRight or paddingRight on container.

```typescript
<box marginRight={1}>
  <text>[{priority}]</text>
</box>
```

**Assessment**:

- **Pros**: Avoids text content issue
- **Cons**: Adds complexity; may not work in all layouts
- **Verdict**: Possible workaround

### Conclusion for Bug 2

**Severity**: BLOCKING (but may have workaround)
**Best approach**: Try string concatenation first (Approach 1)
**Self-fix effort**: Unknown - depends on root cause
**Risk**: Medium - may be fixable with workaround

---

## Bug 3: borderStyle Segfault (Issue 001) - WORKED AROUND

**Summary**: Using invalid `borderStyle` value causes segmentation fault instead of error.

**Impact**: Development friction - typos cause crashes.

**Upstream Status**: Filed as [anomalyco/opentui#543](https://github.com/anomalyco/opentui/issues/543), assigned to maintainer.

### Resolution Approaches

#### Approach 1: Use Valid Values (Current Workaround)

**Concept**: Only use documented borderStyle values.

```typescript
// Good: "single", "double", "rounded", "heavy", "none"
<box borderStyle="single">...</box>

// Bad: typos
<box borderStyle="round">...</box> // Crash!
```

**Assessment**:

- **Pros**: Works; simple
- **Cons**: Fragile; easy to make typos; no TypeScript protection
- **Verdict**: Current solution - acceptable

#### Approach 2: TypeScript Type Guard

**Concept**: Create type that only allows valid values.

```typescript
type BorderStyle = "single" | "double" | "rounded" | "heavy" | "none";

function Box({ borderStyle }: { borderStyle?: BorderStyle }) {
  return <box borderStyle={borderStyle} />;
}
```

**Assessment**:

- **Pros**: Compile-time safety; IDE autocomplete
- **Cons**: Need to wrap OpenTUI components; maintenance overhead
- **Verdict**: Good improvement

#### Approach 3: Runtime Validation Wrapper

**Concept**: Validate props before passing to OpenTUI.

```typescript
const VALID_BORDERS = ["single", "double", "rounded", "heavy", "none"];

function SafeBox({ borderStyle, ...props }) {
  if (borderStyle && !VALID_BORDERS.includes(borderStyle)) {
    console.warn(`Invalid borderStyle: ${borderStyle}`);
    borderStyle = "single";
  }
  return <box borderStyle={borderStyle} {...props} />;
}
```

**Assessment**:

- **Pros**: Prevents crash; logs warning; graceful degradation
- **Cons**: Extra code; performance overhead (minimal)
- **Verdict**: Good defensive approach

#### Approach 4: Wait for Upstream Fix

**Concept**: Issue is already filed and assigned.

**Assessment**:

- **Pros**: Proper fix; no maintenance burden
- **Cons**: Unknown timeline
- **Verdict**: Will happen eventually; workaround sufficient for now

#### Approach 5: Contribute Zig Validation

**Concept**: Add input validation to Zig renderer.

**Assessment**:

- **Pros**: Fixes for everyone; proper solution
- **Cons**: Zig expertise needed; PR review process
- **Verdict**: Good contribution if skilled in Zig

### Conclusion for Bug 3

**Severity**: Low (worked around)
**Best approach**: Keep using valid values + add TypeScript types
**Self-fix effort**: 0 (workaround works)
**Risk**: Low - non-blocking

---

## Upstream Activity Assessment

### Release Cadence

Based on [GitHub releases](https://github.com/anomalyco/opentui/releases):

| Version | Date         | Notes                  |
| ------- | ------------ | ---------------------- |
| 0.1.74  | Jan 16, 2026 | CI improvements        |
| 0.1.73  | Jan 15, 2026 | Multiple fixes         |
| 0.1.70  | Jan 14, 2026 | Alpha/transparency fix |
| 0.1.67  | Jan 13, 2026 | Cursor visibility fix  |

**Conclusion**: Very active - multiple releases per week.

### Issue Responsiveness

- Issue #543 (borderStyle segfault) was assigned to maintainer
- 7,510 stars indicates significant community interest
- Used by OpenCode (Anomaly's own product)

**Conclusion**: Issues likely to be addressed, but timeline uncertain.

### Related Upstream Issues

| Issue | Title                   | Status         | Relevance                  |
| ----- | ----------------------- | -------------- | -------------------------- |
| #543  | borderStyle segfault    | Open, assigned | Our issue 001              |
| #5295 | Text selection contrast | Open           | Similar to our color issue |
| #3731 | System theme support    | Open           | Theme-related rendering    |

**Conclusion**: Color/theme issues are known patterns in OpenTUI.

---

## Summary Table

| Bug                   | Severity | Workaround Available  | Upstream Filed | Self-Fix Effort |
| --------------------- | -------- | --------------------- | -------------- | --------------- |
| Color rendering (002) | BLOCKING | Partial (inverse)     | No             | 1-2 weeks       |
| Bracket/space (003)   | BLOCKING | Maybe (concatenation) | No             | Unknown         |
| borderStyle (001)     | Low      | Yes (valid values)    | Yes (#543)     | N/A             |

## Overall Assessment

OpenTUI has **two blocking bugs** that prevent production use:

1. **Color rendering bug** - No reliable workaround for styled content within selection
2. **Bracket/space bug** - Workaround may exist but untested

### Timeline Estimate

- **If workarounds work**: 1-2 days to implement and test
- **If self-fix required**: 2-4 weeks (Zig expertise, PR process)
- **If waiting for upstream**: Unknown - weeks to months

### Recommendation

1. **File both bugs upstream** immediately
2. **Test workarounds** for bracket/space issue
3. **Re-evaluate** after workaround testing
4. **Do not proceed** with TUI2 for production until color bug is fixed

The color rendering bug alone is sufficient to block TUI2 adoption since selection highlighting is a core UX feature.
