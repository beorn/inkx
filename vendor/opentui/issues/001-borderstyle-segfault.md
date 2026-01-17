# Issue 001: Invalid borderStyle Causes Segfault

## Tracking

- **Upstream**: [anomalyco/opentui#543](https://github.com/anomalyco/opentui/issues/543)
- **Status**: Open (assigned to @msmps)
- **Filed**: 2025-01 by @beorn
- **Local bead**: None (fixed before beads existed)

## Summary

Using an invalid `borderStyle` value (e.g., `"round"` instead of `"rounded"`) causes
a segmentation fault in the native Zig library instead of showing an error or
falling back to a default style.

## Environment

- macOS (Apple Silicon) - Darwin arm64
- Bun 1.3.5
- @opentui/core 0.1.73
- @opentui/react 0.1.73

## Reproduction

```bash
bun run vendor/opentui/issues/001-repro.tsx 3  # crashes with segfault
```

```tsx
// Invalid "round" instead of "rounded" - crashes
<box border borderStyle="round" width={30} height={5}>
  <text>Crash!</text>
</box>
```

## Expected Behavior

- TypeScript error for invalid value (if using strict types)
- Runtime error message explaining the invalid value
- Or fallback to default border style

## Actual Behavior

- Segmentation fault (SIGSEGV)
- No error message
- Process terminates immediately

## Workaround

Use only valid borderStyle values: `"single"`, `"double"`, `"rounded"`, `"heavy"`, `"none"`

```tsx
// Good
<box border borderStyle="single">...</box>
<box border borderStyle="rounded">...</box>

// Bad - causes crash
<box border borderStyle="round">...</box>  // typo
```

## Root Cause

The Zig renderer doesn't validate borderStyle values and accesses invalid memory
when given an unrecognized value.

## Affected Code

- Previously used `borderStyle="round"` (typo) in TUI components
- Fixed by changing to `borderStyle="single"` (commit `092b891`)
