---
mentions:
  - km
id: "@km/inkx/css-select"
aliases:
  - km-inkx.css-select
  - km-inkx-css-select
created_at: 2026-02-04T11:24:01Z
closed_at: 2026-02-04T12:37:00Z
---

# [x] Discuss replacing custom selector with css-select @km/inkx #task #P4

## Context

inkx currently has a custom CSS selector implementation (~150 lines) in vendor/beorn-inkx/src/testing/locator.ts that supports:

- ID selectors: #id
- Attribute selectors: [attr], [attr="value"], [attr^="prefix"], etc.
- Compound selectors: #id[attr="value"]
- Combinators: descendant (space), child (>), adjacent sibling (+)

## Alternative: css-select

css-select is a popular library (45M weekly downloads, 592 GitHub stars) that provides full CSS3/4 selector support.

**Pros:**

- Comprehensive: supports pseudo-classes (:nth-child, :not(), :has(), etc.)
- Battle-tested: used by cheerio, htmlparser2, and many others
- Well-maintained: active development, good documentation

**Cons:**

- Requires custom adapter (~12 functions: getChildren, getParent, getName, getAttributeValue, etc.)
- External dependency (adds to bundle size)
- Overkill for current test needs (tests only use basic selectors)

## Trade-offs

**Code size comparison:**

- Custom implementation: ~150 lines total
- css-select approach: ~50-100 lines adapter + library dependency

**When to consider switching:**

- If tests need pseudo-classes or advanced selectors
- If maintenance burden of custom code becomes high
- If multiple projects need the same selector engine

## Recommendation

**Keep custom implementation for now** unless:

1. Tests start requiring advanced selectors
2. Bugs in custom implementation become frequent
3. Community requests pseudo-class support

## Resources

- css-select npm: https://www.npmjs.com/package/css-select
- css-select GitHub: https://github.com/fb55/css-select
- Custom implementation: vendor/beorn-inkx/src/testing/locator.ts

