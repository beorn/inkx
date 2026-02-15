# Targeted Exploration (User-Described Scenarios)

When the user describes a specific issue or scenario, **write a test IMMEDIATELY** before randomized testing.

## Detecting User Scenarios

Look for patterns in user input:
- "going down after X" → Navigate to X, then press `j`
- "pressing Y on Z" → Navigate to Z, then press Y
- "switching views when..." → Specific view mode transitions
- "zoom into X and then..." → Navigate to X, zoom, then action

## Workflow for Targeted Exploration

1. **Write a test** that reproduces the scenario
2. **Set up the exact context** (fixture, view mode, navigation)
3. **Execute the described action sequence**
4. **Verify and report** what happens
5. **Expand around the scenario** with variations
6. **Keep the test** as a regression test

### Example: "going down after Justice node"

```typescript
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

test("cursor should move down after searching for Justice", () => {
  const { board } = testEnv(() =>
    item("board", item("col",
      item("Task A"), item("Justice"), item("Task C")))
  )

  // 1. Navigate to "Justice" node
  board.press("/")
  for (const c of "Justice") board.press(c)
  board.press("Enter")

  // 2. Execute described action
  const before = board.textContent()
  board.press("j")
  const after = board.textContent()

  // 3. Verify — cursor should be on Task C
  expect(before).not.toBe(after)
})
```

### Testing Variations

Once the base test passes/fails, expand with variations:

```typescript
describe("cursor after search", () => {
  const setup = () => testEnv(() =>
    item("board", item("col",
      item("Task A"), item("Justice"), item("Task C")))
  )

  test("j moves down", () => {
    const { board } = setup()
    board.press("/")
    for (const c of "Justice") board.press(c)
    board.press("Enter")
    board.press("j")
    // verify cursor moved down
  })

  test("k moves up", () => {
    const { board } = setup()
    board.press("/")
    for (const c of "Justice") board.press(c)
    board.press("Enter")
    board.press("k")
    // verify cursor moved up
  })
})
```

### Loading User's Real Vault

When debugging a user-reported issue on their actual data:

```bash
TEST_VAULT=/path/to/user/vault bun vitest run apps/km-tui/tests/real-vault.test.ts
```

Or write a custom test with `testEnvWithRepo`:

```typescript
import { testEnvWithRepo } from "./helpers/board-test.ts"

test("repro user bug with real vault", async () => {
  const { board } = await testEnvWithRepo("/path/to/user/vault")

  // Reproduce the user's steps
  board.press("/")
  for (const c of "Justice") board.press(c)
  board.press("Enter")
  board.press("j")

  console.log(board.textContent())
})
```

## GUI/TTY Mode (only when pixel-level verification needed)

See [interactive.md](interactive.md) for TTY tool usage and screenshot conventions.

---

## Data Source Verification (Real Vaults)

When testing a real vault (`--path`), verify the TUI matches the filesystem:

### Pre-flight Checks

1. **Ensure vault is synced** - check `.km/state.db` has nodes:
   ```bash
   sqlite3 /path/to/.km/state.db "SELECT COUNT(*) FROM nodes;"
   # If 0 or 1, run: bun km sync /path/to/vault
   ```

2. **Explore filesystem structure** before running TUI:
   ```bash
   ls -la /path/to/vault/
   find /path/to/vault -name "*.md" | wc -l
   ```

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Empty board" | Vault not synced | `bun km sync /path` |
| 0 or 1 nodes | Database empty | `bun km sync /path` |
| Missing folders | Wrong root zoom level | Navigate with `u` to zoom out |
| ULID-like names | Raw IDs shown | Check node.data.name vs node.id |
