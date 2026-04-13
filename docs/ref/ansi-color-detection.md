# ANSI Color Detection

Technical reference for terminal color support auto-detection in km's vendored tools.

## The Problem

When outputting colored text to a terminal, you need to know whether the destination supports ANSI escape codes. Sending raw ANSI codes to:

- Non-TTY destinations (pipes, files) → visible escape codes `[32m·[0m`
- CI environments → cluttered logs
- Text editors → garbled display

## Standard Conventions

The ecosystem has converged on this precedence order:

```
1. Explicit option (--no-color, --color)
2. FORCE_COLOR env var (force colors on)
3. NO_COLOR env var (force colors off)
4. TTY detection (process.stdout.isTTY)
```

### Reference Implementations

- **chalk**: Respects NO_COLOR, FORCE_COLOR, isTTY
- **commander**: `--no-color` → `options.color = false`
- **jest**: Detects CI environments, respects NO_COLOR
- **tap**: Follows same conventions

## Implementation

### @beorn/tap (and km tools)

```typescript
const supportsColor =
  options.color !== undefined // 1. Explicit CLI option
    ? options.color
    : process.env.FORCE_COLOR // 2. Force on
      ? true
      : process.env.NO_COLOR // 3. Force off
        ? false
        : "isTTY" in output && // 4. Auto-detect
          output.isTTY === true
```

### CLI Integration

Commander's `--no-color` option creates a gotcha:

```typescript
interface Options {
  color?: boolean // ❌ Wrong - Commander sets to `true` by default
}

// ✅ Correct - only pass when explicitly set
const consumer = createConsumer({
  color: options.color === false ? false : undefined,
})
```

**Why**: Commander's negated options (`--no-X`) default to `true` when not provided. We must detect "not provided" vs "explicitly false" to allow env var auto-detection.

## Testing

```bash
# Auto-detect (TTY) - shows colors in terminal
bun tap --dots tests/**

# Piped output - no colors
bun tap --dots tests/** | cat

# Force colors even when piped
FORCE_COLOR=1 bun tap --dots tests/** | less -R

# Disable colors in terminal
NO_COLOR=1 bun tap --dots tests/**

# Explicit flag (highest precedence)
bun tap --dots --no-color tests/**
```

## Edge Cases

### 1. Bun's stdout.isTTY

In Bun, `process.stdout.isTTY` is `undefined` (not `false`) when piped:

```typescript
// ❌ Wrong - treats undefined as falsy
const supportsColor = process.stdout.isTTY

// ✅ Correct - explicit true check
const supportsColor = "isTTY" in output && output.isTTY === true
```

### 2. Environment Variable Inheritance

Env vars don't propagate through all shell contexts:

```bash
# ❌ Wrong - NO_COLOR not inherited by piped command
NO_COLOR=1 bun tap --dots | cat

# ✅ Correct - export first
export NO_COLOR=1
bun tap --dots | cat
```

### 3. TypeScript Types

`Writable` doesn't include `isTTY`, need type guard:

```typescript
// ❌ Error: Property 'isTTY' does not exist on type 'Writable'
const isTTY = output.isTTY

// ✅ Correct - check property existence first
const isTTY = "isTTY" in output ? output.isTTY : undefined
```

## Related

- [TAP consumer](../../vendor/tap/src/consumer.ts) - Full implementation
- [NO_COLOR standard](https://no-color.org/)
- [FORCE_COLOR convention](https://force-color.org/)

## Lessons Learned

**Don't trust Commander defaults** - Negated options (`--no-X`) default to `true`, not `undefined`. Must handle this explicitly.

**Check property existence before access** - TypeScript won't catch runtime issues with `stdout.isTTY` on different runtimes.

**Follow ecosystem conventions** - NO_COLOR and FORCE_COLOR are widely supported. Respecting them improves interoperability.

**Env vars vs CLI flags** - Explicit flags should take precedence over env vars for principle of least surprise.
