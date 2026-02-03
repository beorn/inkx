# Peekaboo Mode (Live Terminal Inspection)

Use Peekaboo MCP to inspect your live Ghostty terminal running `km view`. This mode is interactive - you guide the exploration and Claude helps investigate.

## When to Use Peekaboo

- **Live debugging**: You have km view running and see a visual bug
- **Interactive investigation**: Want to explore an issue step-by-step with AI assistance
- **Capture evidence**: Get screenshots of rendering glitches
- **No test setup needed**: Works on your actual running app

## Setup

1. **Start km view** in a Ghostty terminal window
2. **Run** `/explore --peekaboo` (optionally with a scenario description)
3. **Claude finds Ghostty** and captures the current state

## Workflow

```
1. List windows → Find Ghostty running km view
2. Capture screenshot → Analyze current state
3. Ask user what to investigate
4. Interactive loop:
   a. User describes issue or requests action
   b. Claude captures/analyzes/suggests
   c. Claude can type/click/hotkey to interact
   d. Capture result and compare
5. Document findings
```

## Tools Reference

| Tool | Purpose | Example |
|------|---------|---------|
| `mcp__peekaboo__list` | List all windows | Find Ghostty |
| `mcp__peekaboo__see` | Get window info | Check Ghostty window ID |
| `mcp__peekaboo__image` | Capture screenshot | Get current terminal state |
| `mcp__peekaboo__app` | Focus application | Bring Ghostty to front |
| `mcp__peekaboo__type` | Type text | Enter commands |
| `mcp__peekaboo__hotkey` | Send key combo | Press j, k, v, etc. |
| `mcp__peekaboo__click` | Click at coordinates | Click on UI elements |

## Finding Ghostty

```typescript
// List all windows to find Ghostty
const windows = await mcp__peekaboo__list()
const ghostty = windows.find(w =>
  w.app === "Ghostty" || w.title.includes("km view")
)

if (!ghostty) {
  console.log("Please open Ghostty with km view running, then try again")
  return
}

// Focus Ghostty
await mcp__peekaboo__app({ app_target: "Ghostty" })
```

## Capturing Terminal State

```typescript
// Capture current screenshot
const screenshot = await mcp__peekaboo__image({
  app_target: "Ghostty"
})

// Analyze what's visible:
// - Cursor position
// - View mode (cards/list/columns/tabs)
// - Any visible errors or glitches
// - Content being displayed
```

## Interactive Actions

```typescript
// Send keypresses to Ghostty
// Navigation
await mcp__peekaboo__hotkey({ key: "j" })  // Move down
await mcp__peekaboo__hotkey({ key: "k" })  // Move up
await mcp__peekaboo__hotkey({ key: "h" })  // Move left
await mcp__peekaboo__hotkey({ key: "l" })  // Move right

// View modes
await mcp__peekaboo__hotkey({ key: "v" })  // Cycle view mode

// Zoom
await mcp__peekaboo__hotkey({ key: "o" })  // Zoom in
await mcp__peekaboo__hotkey({ key: "u" })  // Zoom out

// Special keys (use modifiers)
await mcp__peekaboo__hotkey({ key: "d", modifiers: ["control"] })  // Ctrl+D (page down)
await mcp__peekaboo__hotkey({ key: "u", modifiers: ["control"] })  // Ctrl+U (page up)
```

## Comparison Workflow

```typescript
// Before state
await mcp__peekaboo__app({ app_target: "Ghostty" })
const before = await mcp__peekaboo__image({ app_target: "Ghostty" })
// Describe what you see: cursor on X, view mode Y, etc.

// Perform action
await mcp__peekaboo__hotkey({ key: "j" })
await new Promise(r => setTimeout(r, 100))  // Wait for render

// After state
const after = await mcp__peekaboo__image({ app_target: "Ghostty" })
// Compare: did cursor move? Any visual changes? Unexpected behavior?
```

## Example: Investigate Cursor Jump

User: `/explore --peekaboo cursor jumps when pressing j on certain items`

```typescript
// 1. Find and focus Ghostty
await mcp__peekaboo__app({ app_target: "Ghostty" })

// 2. Capture initial state
const initial = await mcp__peekaboo__image({ app_target: "Ghostty" })
// "I see km view in cards mode, cursor on 'Project Alpha'"

// 3. Navigate to reproduce
await mcp__peekaboo__hotkey({ key: "/" })  // Open search
await mcp__peekaboo__type({ text: "Justice" })
await mcp__peekaboo__hotkey({ key: "Return" })
await new Promise(r => setTimeout(r, 200))

// 4. Capture state at target node
const atTarget = await mcp__peekaboo__image({ app_target: "Ghostty" })
// "Cursor now on 'Justice' node"

// 5. Perform problematic action
await mcp__peekaboo__hotkey({ key: "j" })
await new Promise(r => setTimeout(r, 100))

// 6. Capture result
const afterJ = await mcp__peekaboo__image({ app_target: "Ghostty" })
// "Cursor jumped to top of board instead of next sibling"

// 7. Report findings
console.log("BUG: Pressing 'j' on Justice node jumps cursor to top")
console.log("Expected: Move to next sibling")
console.log("Actual: Cursor jumped to first item in board")
```

## Report Format

```markdown
# Peekaboo Investigation: [Issue Description]

## Environment
- **App**: Ghostty
- **Window**: [window title]
- **View mode**: [cards/list/columns/tabs]

## Steps Performed
1. [action] → [observation]
2. [action] → [observation]
...

## Screenshots
[Before screenshot with annotation]
[After screenshot with annotation]

## Findings
- **Issue confirmed**: [yes/no]
- **Description**: [what's wrong]
- **Reproduction steps**: [how to trigger]
- **Possible cause**: [hypothesis]

## Recommended Next Steps
- [ ] Create bead for this issue
- [ ] Test in TUI mode for faster iteration
- [ ] Check related code in [file]
```

## Tips

1. **Be patient** - Allow 100-200ms between actions for renders
2. **Capture often** - Screenshots are your evidence
3. **Describe what you see** - Help Claude understand the visual state
4. **Use search** - Navigate to specific nodes with `/` + search
5. **Try variations** - Same action in different view modes
6. **Document everything** - Findings may help diagnose later
