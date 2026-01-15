# OpenTUI Migration Architecture

## Design Goals

1. **Testability**: Components can be tested with fake data (storybook-style)
2. **Separation of Concerns**: Logic, state, and presentation are distinct layers
3. **Type Safety**: Strong typing throughout
4. **Incremental Migration**: Can migrate view-by-view

## Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Container Layer                         │
│  (App.tsx - connects store, handles side effects)           │
├─────────────────────────────────────────────────────────────┤
│                     State Layer                             │
│  (hooks/useBoard.ts - pure state management)                │
├─────────────────────────────────────────────────────────────┤
│                   Presenter Layer                           │
│  (views/*.tsx - pure view logic, no store access)           │
├─────────────────────────────────────────────────────────────┤
│                   Component Layer                           │
│  (components/*.tsx - stateless UI primitives)               │
└─────────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

### 1. Component Layer (`components/`)

Stateless, pure UI primitives that render based on props alone.

```tsx
// components/Card.tsx - pure render, no hooks
interface CardProps {
  title: string;
  isSelected: boolean;
  childCount: number;
  color?: string;
}

function Card({ title, isSelected, childCount, color }: CardProps) {
  return (
    <box border borderColor={isSelected ? "cyan" : "white"}>
      <text color={isSelected ? "cyan" : "white"}>
        {title}
        {childCount > 0 ? ` (${childCount})` : ""}
      </text>
    </box>
  );
}
```

**Testable via**: Direct rendering with various props

### 2. Presenter Layer (`views/`)

Transforms domain data into view data. No hooks, no store access.

```tsx
// views/CardsViewPresenter.tsx
interface CardsViewProps {
  columns: ColumnViewModel[];
  selectedCol: number;
  selectedCard: number;
  onSelect: (col: number, card: number) => void;
}

interface ColumnViewModel {
  id: string;
  title: string;
  count: number;
  wipLimit?: number;
  cards: CardViewModel[];
}

interface CardViewModel {
  id: string;
  title: string;
  childCount: number;
  color?: string;
}

function CardsView({
  columns,
  selectedCol,
  selectedCard,
  onSelect,
}: CardsViewProps) {
  return (
    <box flexDirection="row">
      {columns.map((col, i) => (
        <Column
          key={col.id}
          column={col}
          isActive={i === selectedCol}
          selectedIndex={i === selectedCol ? selectedCard : -1}
        />
      ))}
    </box>
  );
}
```

**Testable via**: Rendering with mock ViewModel data

### 3. State Layer (`hooks/`)

Pure state management. Reducers and selectors, no side effects.

```tsx
// hooks/useBoardState.ts
interface BoardStateHook {
  state: BoardState;
  dispatch: (action: BoardAction) => void;

  // Computed selectors
  currentColumn: ColumnState | null;
  currentCard: CardState | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

type BoardAction =
  | { type: "MOVE_UP" }
  | { type: "MOVE_DOWN" }
  | { type: "MOVE_LEFT" }
  | { type: "MOVE_RIGHT" }
  | { type: "SELECT_CARD"; col: number; card: number }
  | { type: "SET_COLUMNS"; columns: ColumnState[] };

function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "MOVE_UP":
      return { ...state, cardIndex: Math.max(0, state.cardIndex - 1) };
    // ...
  }
}

function useBoardState(initialState: BoardState): BoardStateHook {
  const [state, dispatch] = useReducer(boardReducer, initialState);

  return {
    state,
    dispatch,
    currentColumn: state.columns[state.colIndex] ?? null,
    currentCard: state.columns[state.colIndex]?.cards[state.cardIndex] ?? null,
    canMoveUp: state.cardIndex > 0,
    canMoveDown:
      state.cardIndex < (state.columns[state.colIndex]?.cards.length ?? 0) - 1,
  };
}
```

**Testable via**: Unit tests on reducer and selectors

### 4. Container Layer (`App.tsx`)

Connects everything. Handles side effects, store access, input.

```tsx
// App.tsx
function App({ initialState, fsPath }: AppProps) {
  const { width, height } = useTerminalDimensions();
  const board = useBoardState(initialState);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  // Transform domain state to view models
  const columns = useMemo(
    () => board.state.columns.map((col) => toColumnViewModel(col)),
    [board.state.columns],
  );

  // Handle keyboard input
  useKeyboard(({ key, name }) => {
    if (name === "up" || key === "k") board.dispatch({ type: "MOVE_UP" });
    if (name === "down" || key === "j") board.dispatch({ type: "MOVE_DOWN" });
    // ... etc
  });

  // Side effect: persist changes
  useEffect(() => {
    if (board.pendingChanges) {
      persistChanges(board.pendingChanges);
    }
  }, [board.pendingChanges]);

  return (
    <box width={width} height={height}>
      {viewMode === "cards" && (
        <CardsView
          columns={columns}
          selectedCol={board.state.colIndex}
          selectedCard={board.state.cardIndex}
        />
      )}
      {/* ... other views */}
    </box>
  );
}
```

## View Models

Domain types (Node, CardState) should NOT leak into presenters.
Transform them at the container layer.

```tsx
// viewmodels/CardViewModel.ts
interface CardViewModel {
  id: string;
  title: string;
  childCount: number;
  isTask: boolean;
  taskStatus?: TaskStatus;
  color?: string;
  icon?: string;
}

function toCardViewModel(card: CardState): CardViewModel {
  return {
    id: card.node.id,
    title: getNodeDisplayName(card.node),
    childCount: card.children.length,
    isTask: !!card.node.task,
    taskStatus: card.node.task?.status,
    color: getInheritedColor(card.node),
    icon: getNodeIcon(card.node),
  };
}
```

## Testing Strategy

### Component Tests (fast, isolated)

```tsx
// __tests__/Card.test.tsx
test("Card renders selected state", () => {
  const { container } = render(
    <Card title="Test" isSelected={true} childCount={3} />,
  );
  expect(container).toMatchSnapshot();
});
```

### Presenter Tests (with mock data)

```tsx
// __tests__/CardsView.test.tsx
const mockColumns: ColumnViewModel[] = [
  { id: '1', title: 'Todo', count: 3, cards: [...] },
  { id: '2', title: 'Done', count: 2, cards: [...] },
];

test('CardsView renders columns', () => {
  const { container } = render(
    <CardsView
      columns={mockColumns}
      selectedCol={0}
      selectedCard={0}
    />
  );
  expect(container).toMatchSnapshot();
});
```

### State Tests (pure functions)

```tsx
// __tests__/boardReducer.test.ts
test("MOVE_DOWN increases cardIndex", () => {
  const state = { cardIndex: 0, columns: [{ cards: [{}, {}] }] };
  const next = boardReducer(state, { type: "MOVE_DOWN" });
  expect(next.cardIndex).toBe(1);
});
```

## Migration Plan

1. **Phase 1**: Create component layer with OpenTUI primitives
   - Card, Column, Header, StatusBar components

2. **Phase 2**: Create presenter layer
   - CardsViewPresenter (just cards view first)
   - Define ViewModels

3. **Phase 3**: Create state layer
   - Extract reducer from Board.tsx
   - Add selectors

4. **Phase 4**: Create container
   - Wire everything together
   - Test with real data

5. **Phase 5**: Migrate remaining views
   - ListView, ColumnsView, TabsView

## File Structure

```
apps/km-cli/src/tui2/
├── components/         # Stateless UI primitives
│   ├── Card.tsx
│   ├── Column.tsx
│   ├── Header.tsx
│   ├── StatusBar.tsx
│   └── ScrollableList.tsx
├── views/              # Presenters (no hooks, no store)
│   ├── CardsView.tsx
│   ├── ListView.tsx
│   ├── ColumnsView.tsx
│   └── TabsView.tsx
├── viewmodels/         # Data transformation
│   ├── CardViewModel.ts
│   ├── ColumnViewModel.ts
│   └── transformers.ts
├── hooks/              # State management
│   ├── useBoardState.ts
│   ├── useKeyboard.ts
│   └── useScrollPosition.ts
├── App.tsx             # Container
├── types.ts            # Shared types
└── index.tsx           # Entry point
```
