# Monorepo Module Resolution

How different tools resolve workspace packages in this monorepo.

## TL;DR

- **Bun runtime**: Internal workspace resolution - just works
- **TypeScript (tsc)**: Needs `paths` in tsconfig.json OR symlinks in node_modules
- **Vite/Vitest**: Needs `vite-tsconfig-paths` plugin OR symlinks in node_modules

To use native resolution (no paths, no plugins), add workspace packages to root `package.json` devDependencies with `workspace:*` - Bun will create symlinks.

---

## The Players

### 1. Bun Runtime

**How it resolves**: Bun has internal knowledge of workspace packages. When you run `bun run file.ts`, it resolves `@silvery/ansi` directly to `vendor/silvery/packages/ansi` without needing symlinks.

```bash
# Works - Bun knows about workspaces internally
echo 'import { createTerm } from "@silvery/ansi"' | bun run -
```

**Symlink behavior**: Bun only creates symlinks in a package's `node_modules` when that package explicitly depends on another workspace package via `workspace:*`.

Example: `apps/km-cli/package.json` has:

```json
{
  "dependencies": {
    "Silvery": "workspace:*",
    "@silvery/ansi": "workspace:*"
  }
}
```

So `apps/km-cli/node_modules/Silvery` exists as a symlink to `vendor/silvery`.

But root `node_modules/@silvery/ansi` does NOT exist because the root `package.json` doesn't depend on it.

### 2. TypeScript (tsc)

**How it resolves**: Standard Node.js module resolution - looks in `node_modules`. With `moduleResolution: "bundler"`, it defers to the bundler but still needs to find types.

**Current solution**: `tsconfig.json` has explicit `paths`:

```json
{
  "compilerOptions": {
    "paths": {
      "@silvery/ansi": ["vendor/silvery/packages/ansi/src/index.ts"],
      "Silvery": ["vendor/silvery/src/index.ts"]
    }
  }
}
```

**Without paths**: TypeScript fails:

```
error TS2307: Cannot find module '@silvery/ansi' or its corresponding type declarations.
```

### 3. Vite / Vitest

**How it resolves**: Vite has its own module resolution, independent of Bun. Even with `bunx --bun vitest`, Vite's resolver doesn't use Bun's workspace knowledge.

**Current solution**: `vite-tsconfig-paths` plugin reads `tsconfig.json` paths and tells Vite how to resolve:

```typescript
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths()],
})
```

**Without the plugin**: Vite can't find workspace packages.

---

## Resolution Matrix

| Tool        | Mechanism                          | Current Solution           | Native Alternative       |
| ----------- | ---------------------------------- | -------------------------- | ------------------------ |
| Bun runtime | Internal workspace resolution      | Just works                 | N/A                      |
| TypeScript  | node_modules lookup                | tsconfig `paths`           | Symlinks in node_modules |
| Vite/Vitest | Vite's resolver                    | `vite-tsconfig-paths`      | Symlinks in node_modules |
| Knip        | Reads workspaces from package.json | Explicit workspace entries | Auto-discovery           |

---

## Native Resolution Approach

To eliminate `paths` and `vite-tsconfig-paths`, we need symlinks in root `node_modules`.

### Option A: Add to root package.json (Recommended)

Add workspace packages as devDependencies in root `package.json`:

```json
{
  "devDependencies": {
    "@silvery/ansi": "workspace:*",
    "mdspec": "workspace:*",
    "Silvery": "workspace:*"
  }
}
```

Then `bun install` creates symlinks:

- `node_modules/@silvery/ansi` → `vendor/silvery/packages/ansi`
- `node_modules/Silvery` → `vendor/silvery`

TypeScript and Vite then resolve via standard node_modules lookup.

### Option B: Postinstall script

Create symlinks manually in a postinstall script. More complex, less idiomatic.

---

## Package Naming

| Folder                 | Package Name     | Import As        |
| ---------------------- | ---------------- | ---------------- |
| `vendor/silvery/packages/ansi`  | `@silvery/ansi`  | `@silvery/ansi`  |
| `vendor/silvery`    | `Silvery`  | `Silvery`  |
| `vendor/silvery/packages/ui` | `@silvery/ag-react/ui` | `@silvery/ag-react/ui` |
| `packages/km-core`     | `@km/core`       | `@km/core`       |

Note: Folder name doesn't have to match package name. The `name` field in `package.json` is what matters.

---

## Debugging Resolution

```bash
# Check what Bun knows about workspaces
bun pm ls | grep -E "@silvery|@beorn|@km"

# Check if symlink exists
ls -la node_modules/@silvery/ansi

# Test Bun runtime resolution
bun -e "console.log(require.resolve('@silvery/ansi'))"

# Test TypeScript resolution (will fail without paths/symlinks)
echo 'import "@silvery/ansi"' > /tmp/test.ts && bun tsc --noEmit /tmp/test.ts
```

---

## Anti-patterns

### Relative vendor imports

```typescript
// BAD - hardcoded path
import { foo } from "../../../vendor/beorn-mdspec/src/types.js"

// GOOD - package name
import { foo } from "mdspec"
```

### Duplicate resolution config

If using native resolution (symlinks), do NOT also have:

- `paths` in tsconfig.json
- `vite-tsconfig-paths` plugin

Pick one approach and stick with it.

---

## See Also

- [monorepo-infra.md](../future/monorepo-infra.md) - Vision for centralizing tool configuration
- [Bun Workspaces](https://bun.com/docs/pm/workspaces) - Official docs
- [vite-tsconfig-paths](https://www.npmjs.com/package/vite-tsconfig-paths) - The plugin we currently use
