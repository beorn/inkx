---
mentions:
  - km
id: "@km/inbox/ldsg"
aliases:
  - km-ldsg
  - "@km/_orphan/ldsg"
created_at: 2026-01-20T07:43:58Z
closed_at: 2026-01-20T10:15:39Z
---

# [x] Flexx: Add getter methods for style properties @km/_orphan #feature #P1

## Problem

Flexx Node class has setters for all style properties but no corresponding getters.

**File**: `vendor/beorn-flexx/src/node.ts`

**Has setters** (lines 197-396):

- setWidth, setHeight, setMinWidth, setMaxWidth, etc.
- setMargin, setPadding, setBorder
- setFlexGrow, setFlexShrink, setFlexBasis
- setAlignItems, setAlignSelf, setJustifyContent
- etc.

**Has getters for computed layout** (lines 157-171):

- getComputedLeft, getComputedTop, getComputedWidth, getComputedHeight

**Missing getters for style properties**:

- getWidth, getHeight, getMinWidth, etc.
- getMargin, getPadding, getBorder
- getFlexGrow, getFlexShrink, etc.
- getAlignItems, getJustifyContent, etc.

## Impact

Users cannot introspect node style properties after setting them - needed for debugging and dynamic layout.

## Solution

Add getter methods for all style setters, reading from the internal Style object.

