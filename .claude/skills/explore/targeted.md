# Targeted Exploration (User-Described Scenarios)

When the user describes a specific issue or scenario, **explore that scenario first** before randomized testing.

## Detecting User Scenarios

Look for patterns in user input:
- "going down after X" → Navigate to X, then press `j`
- "pressing Y on Z" → Navigate to Z, then press Y
- "switching views when..." → Specific view mode transitions
- "zoom into X and then..." → Navigate to X, zoom, then action

## Workflow for Targeted Exploration

1. **Parse the scenario** from user description
2. **Set up the exact context** (navigate to element, set view mode, etc.)
3. **Execute the described action sequence**
4. **Verify and report** what happens
5. **Expand around the scenario** with variations:
   - Same action on nearby elements
   - Same action in different view modes
   - Similar actions (j→k, h→l)
   - Same sequence after different navigation paths

### Example: "going down after Justice node"

```typescript
// 1. Set up: Navigate to "Justice" node
board.press("/")  // Open search
board.type("Justice")
board.press("Enter")  // Select result

// 2. Execute described action
const before = board.screenshot()
board.press("j")  // "going down"
const after = board.screenshot()

// 3. Verify
const cursorMoved = before !== after
const bellRang = board.bell
console.log({ cursorMoved, bellRang, before, after })

// 4. Expand with variations
const variations = [
  { action: "k", desc: "going up instead" },
  { action: "j", repeat: 5, desc: "going down 5 times" },
  { viewMode: "list", action: "j", desc: "same in list view" },
  { viewMode: "columns", action: "j", desc: "same in columns view" },
]

for (const v of variations) {
  // Reset to Justice node, apply variation, verify
}
```

### GUI Mode Targeted Exploration

```typescript
// Using existing vault with the problematic node
const { sessionId } = await mcp__tty__start({
  command: ["bun", "km", "view", userVaultPath]
})

// Navigate to the node
await mcp__tty__press({ sessionId, key: "/" })
await mcp__tty__type({ sessionId, text: "Justice" })
await mcp__tty__press({ sessionId, key: "Enter" })
await mcp__tty__wait({ sessionId, stable: 100 })

// Capture before
const beforeText = await mcp__tty__text({ sessionId })
const beforeShot = await mcp__tty__screenshot({ sessionId })

// Execute action
await mcp__tty__press({ sessionId, key: "j" })
await mcp__tty__wait({ sessionId, stable: 100 })

// Capture after
const afterText = await mcp__tty__text({ sessionId })
const afterShot = await mcp__tty__screenshot({ sessionId })

// Report findings with visual evidence
```

### Targeted Report Format

```markdown
# Targeted Exploration: [User Scenario]

## Scenario
"going down after Justice node"

## Initial Test
- **Setup**: Searched for "Justice", cursor on node
- **Action**: Press `j` (move down)
- **Result**: [describe what happened]
- **Expected**: Cursor moves to next sibling or child

## Variations Tested

| # | Variation | Result |
|---|-----------|--------|
| 1 | Press `k` (up) after Justice | [result] |
| 2 | Press `j` 5x | [result] |
| 3 | Same in list view | [result] |
| 4 | Same in columns view | [result] |
| 5 | Different node, same action | [result] |

## Findings
- [Bug/issue if found]
- [Pattern observed]

## Random Exploration (N additional iterations)
[Continue with standard randomized testing]
```

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
   find /path/to/vault -maxdepth 2 -type d | head -20
   find /path/to/vault -name "*.md" | wc -l
   ```

3. **Note expected content** for verification:
   - Top-level folders (inbox, projects, areas, etc.)
   - Key files that should appear
   - Expected node count (from sqlite query)

### TUI vs Filesystem Verification

After loading the vault in TUI mode:

```typescript
// Load vault
const repo = await runGenerator(createRepo(vaultPath, { loadFiles: true }))

// Get root and children from repo
const rootNode = repo.getRepoRootNode()
const rootChildren = repo.getChildren(rootNode.id)

console.log(`Filesystem children:`)
for (const child of rootChildren) {
  const name = child.data?.name || child.content || child.id
  console.log(`  - ${name} (${child.type})`)
}

// Render and check text output
const text = result.text

// Verify expected folders appear
const expected = ["inbox", "projects", "areas"]  // from filesystem exploration
for (const folder of expected) {
  const found = text.toLowerCase().includes(folder.toLowerCase())
  console.log(`${found ? "✓" : "✗"} "${folder}" ${found ? "visible" : "NOT visible"}`)
}
```

### Content Mismatch Detection

| Check | How | Issue If |
|-------|-----|----------|
| Node count | `repo.getAllTasks().length` vs `sqlite3 ... nodes` | Mismatch > 10% |
| Root children | `repo.getChildren(rootId)` vs `ls vault/` | Missing folders |
| Visible text | `result.text` contains folder names | Expected content hidden |
| Empty board | Text shows "Empty board" | Vault not synced |

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Empty board" | Vault not synced | `bun km sync /path` |
| 0 or 1 nodes | Database empty | `bun km sync /path` |
| Missing folders | Wrong root zoom level | Navigate with `u` to zoom out |
| ULID-like names | Raw IDs shown | Check node.data.name vs node.id |
