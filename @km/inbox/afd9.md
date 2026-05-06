---
mentions:
  - km
id: "@km/inbox/afd9"
aliases:
  - km-afd9
  - "@km/_orphan/afd9"
created_at: 2026-01-19T23:15:35Z
closed_at: 2026-01-20T09:09:10Z
---

# [x] InkX: Fix severe visual rendering bugs to match ink quality @km/_orphan #task #P1

## Problem

InkX examples render but have visual issues that differ from ink's behavior.

## Known Bugs (Must reproduce with tests BEFORE fixing)

### 1. Kanban: Column header background color override

- In `examples/kanban/index.tsx`, the "To Do" column header text is black-on-white
- The card's background color is overriding the column header's cyan background
- Expected: Column header should maintain cyan background
- Actual: "To Do" text area shows white background

### 2. Kanban: Cursor movement doesn't work

- In `examples/kanban/index.tsx`, pressing j/k/h/l keys doesn't move the cursor
- The selection indicator should move between cards and columns
- Expected: Arrow keys and vim keys move selection
- Actual: Cursor stays on first card

### 3. All examples lose colors after keyboard input

- Affects: kanban, task-list, dashboard
- After pressing ANY key, the entire UI loses its colors
- All text becomes white-on-black (default terminal colors)
- Expected: Colors should persist after input
- Actual: First keypress strips all ANSI color codes from output

### 4. Task-list: Layout changes after first keypress

- In `examples/task-list/index.tsx`, pressing any key changes the layout
- The task list becomes longer/different from initial render
- Expected: Layout should remain stable after input
- Actual: Re-render produces different layout dimensions

### 5. Overflow height calculation with borders (from before)

- `examples/test-overflow/index.tsx` shows 3 content lines with `height={5}` and border
- Expected: 5 content lines (height=5 is content height)
- Actual: Only 3 lines (border consumes height)

## Required Tests (Write BEFORE fixing)

Add tests in `tests/examples-bugs.test.tsx`:

```tsx
import { createTestRenderer, stripAnsi } from '../src/testing/index.tsx';

describe('Example bugs', () => {
  const render = createTestRenderer({ columns: 80, rows: 24 });

  // Bug 3: Colors lost after keyboard input
  test('colors persist after stdin.write()', () => {
    const { lastFrame, stdin, frames } = render(<Dashboard />);
    
    const initialFrame = lastFrame();
    expect(initialFrame).toContain('\x1b['); // Has ANSI codes
    
    stdin.write('l'); // Press right
    
    const afterInput = lastFrame();
    expect(afterInput).toContain('\x1b['); // Still has ANSI codes
  });

  // Bug 4: Layout stability after input
  test('task-list layout stable after input', () => {
    const { lastFrame, stdin, frames } = render(<TaskList />);
    
    const initialHeight = (lastFrame() ?? '').split('\n').length;
    
    stdin.write('j'); // Press down
    
    const afterHeight = (lastFrame() ?? '').split('\n').length;
    expect(afterHeight).toBe(initialHeight);
  });

  // Bug 2: Cursor movement
  test('kanban cursor moves on input', () => {
    const { lastFrame, stdin } = render(<KanbanBoard />);
    
    // Initial: first card selected
    let frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Design new landing page'); // First card
    
    stdin.write('j'); // Move down
    frame = lastFrame() ?? '';
    // Should have different selection highlighting
  });
});
```

## Acceptance Criteria

1. Write failing tests that reproduce each bug
2. Fix the rendering issues one by one
3. All tests pass
4. Examples render correctly with persistent colors
5. Keyboard input works correctly

