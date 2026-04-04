# Command API Design Research

Deep research on ergonomic API design patterns for TUI automation.

> Research conducted 2026-02-04 using OpenAI O3 Deep Research.

## Summary

The research validated our SlateJS-style plugin architecture (`withCommands`, `withKeybindings`) and provided guidance on implementation choices.

## Key Findings

### 1. Proxy vs Explicit Methods

**Recommendation**: Proxy is appropriate when you need both patterns:
- `app.cmd.down()` (method-style)
- `app.cmd['cursor_down']()` (index-style)

However, since commands are known at compile-time, explicit registration may be simpler. The trade-off:
- **Proxy**: Flexible, dynamic, but adds indirection and complicates TypeScript types
- **Explicit**: More boilerplate, but full autocomplete and static analysis

> "Use Proxy only if you need its dynamism; if not, a well-structured static API is simpler." ([Medium](https://medium.com/differential-blog/using-proxy-objects-and-typescript-to-create-dynamic-type-safe-clients-a5db3c840098))

### 2. Separation of Concerns (Validated)

Industry standard: separate command definitions from invocation methods.

> "Commands separate the semantics of an action from its logic, allowing multiple disparate sources to invoke the same command." ([WPF Commands Guide](https://www.codeproject.com/Articles/23301/WPF-A-Beginner-s-guide-Part-3-of-n))

Examples:
- **VS Code**: Commands declared separately from keybindings
- **Emacs**: Global command list + keymaps that bind to commands
- **SlateJS**: Commands as high-level user-intent actions

Benefits:
1. Avoids duplication (same command from keyboard, menu, AI)
2. Improves testability (call command directly, bypass keystrokes)
3. Aligns with hexagonal architecture (commands = use cases, UI = adapter)

### 3. AI Discoverability

Self-documenting commands with `id`, `help`, `keys` metadata matches how AI tool interfaces are designed:

> "LangChain defines tools with a name and a description so that the AI knows when to use them." ([LangChain Docs](https://docs.langchain.com/oss/python/langchain-tools))

> "OpenAI's function-calling API expects a schema with function name and description, which informs the model what it does." ([OpenAI Platform](https://platform.openai.com/docs/guides/function-calling))

The `app.getState()` pattern returning `{ screen, commands, focus }` is sufficient for AI introspection without bloating the API.

### 4. Minimal Introspection API

> "To support AI introspection without bloating the API, stick to a small number of entry points that reveal everything needed."

The research recommends:
- One method (`getState()`) that returns structured data
- Self-descriptive command metadata
- No special "AI-only" APIs needed

### 5. Layer Architecture

The `with*` plugin pattern is well-suited for building layers:
1. Base app (press, type, text)
2. `withCommands` (adds cmd object)
3. `withKeybindings` (wires input → commands)

Each layer:
- Wraps the previous
- Adds new methods/handlers
- Can intercept behavior of layers below

## Implementation Implications

### withCommands Design

```typescript
// Options pattern - caller provides context builders
interface WithCommandsOptions<TContext> {
  registry: CommandRegistry
  getContext: () => TContext
  handleAction: (action: KmOp) => void
  getKeybindings?: () => Keybinding[]
}
```

### Command Object Shape

```typescript
interface Command {
  (): Promise<void>           // Callable
  readonly id: string         // 'cursor_down'
  readonly name: string       // 'Move Down'
  readonly help: string       // 'Move cursor down'
  readonly keys: readonly string[]  // ['j', 'ArrowDown']
}
```

### Short Name Resolution

Allow both `cmd.down` and `cmd['cursor_down']`:
1. Try exact id match first
2. Fall back to short name (last segment after underscore/dot)

## Input Layer Stack (Proposed)

### Problem

Dialog input handling has a race condition: when a dialog opens, its `useInput` registers asynchronously via `useEffect`. Heavy queries can block rendering, causing keystrokes to be lost before the handler is ready.

Example: typing `/china` in the search dialog - early characters get eaten while the dialog's input handler isn't registered yet.

### Solution: DOM-style Event Bubbling

Input layer stack with event bubbling, similar to DOM event propagation:

```
InputBox layer   → handles text editing (chars, backspace, ctrl+shortcuts)
   ↓ bubbles if not handled (returns false)
dialog layer     → handles dialog-specific keys (enter=confirm, escape=cancel)
   ↓ bubbles if not handled
board layer      → handles navigation commands
   ↓ bubbles if not handled
app layer        → handles global (quit, help)
```

InputBox becomes a focusable element that receives input, similar to DOM focus. This matches the mental model of "focused input field inside a dialog inside a board".

### Key Design Points

1. **Sync registration** - Use `useLayoutEffect` instead of `useEffect` so handlers register before paint
2. **Boolean return** - Handlers return `true` if consumed, `false` to bubble
3. **Stack ordering** - Most recently pushed layer handles input first
4. **Single useInput** - Only one `useInput` at the root, dispatches to layer stack

### API Sketch

```typescript
// Context
interface InputLayer {
  id: string
  handler: (input: string, key: Key) => boolean  // true = consumed
}

interface InputLayerContextValue {
  push: (layer: InputLayer) => void
  pop: (id: string) => void
  dispatch: (input: string, key: Key) => void  // walks stack top→bottom
}

// Hook (sync registration)
function useInputLayer(id: string, handler: InputHandler) {
  const ctx = useInputLayerContext()
  useLayoutEffect(() => {
    ctx.push({ id, handler })
    return () => ctx.pop(id)
  }, [id, handler])
}
```

### Implementation

**Completed in km-silvery.driver.1**

Files created:
- `vendor/silvery/src/contexts/InputLayerContext.tsx` - Context and provider
- `vendor/silvery/src/hooks/useInputLayer.ts` - Hook re-exports
- `vendor/silvery/tests/input-layer.test.tsx` - Tests (14 passing)

Exports added to `vendor/silvery/src/index.ts`:
- `InputLayerProvider` - Wrap your app to enable the layer stack
- `useInputLayer` - Register a layer with a handler
- `useInputLayerContext` - Access dispatch and layer management

Key design decisions:
- **Child-first ordering**: Children handle input before parents (like DOM bubbling)
- **Sibling ordering**: First rendered sibling handles first
- **Sync registration**: useLayoutEffect ensures handlers are ready before first paint
- **Position preservation**: Handler updates keep the layer in its original position

### TextInput Integration

The existing `TextInput` component is not modified to preserve backward compatibility.
To use input layers with text input, create a custom component:

```tsx
function LayeredTextInput({ value, onChange }) {
  const valueRef = useRef(value)
  valueRef.current = value

  useInputLayer('text-input', (input, key) => {
    if (key.backspace && valueRef.current.length > 0) {
      onChange(valueRef.current.slice(0, -1))
      return true
    }
    if (input.length === 1 && input >= ' ') {
      onChange(valueRef.current + input)
      return true
    }
    return false  // Let escape, enter, etc. bubble
  })

  return <Text>{value}</Text>
}
```

Using a ref avoids stale closure issues while keeping the handler stable.

## Board Driver State Access

### Current State (Workaround)

The driver (`apps/km-tui/src/driver.ts`) uses `onStateCaptureREPLACE_WITH_CREATEAPP_STORE` callback to receive state from Board. This is a temporary workaround to avoid DOM parsing.

### Target State

Migrate driver to use `createApp()` from Silvery/runtime:
1. Define board state + key handlers via `createApp()`
2. Board component uses `useApp(selector)` for state
3. Driver accesses state via `app.store.getState()` directly

See bead: `km-tui.4` (refactor: Migrate Board to createApp() store pattern)

## Sources

- [SlateJS Documentation](https://docs.slatejs.org/concepts/06-commands) - Concept of commands as high-level user-intent actions
- [Medium: Using Proxy objects](https://medium.com/differential-blog/using-proxy-objects-and-typescript-to-create-dynamic-type-safe-clients-a5db3c840098) - Dynamic, ergonomic API calls
- [VS Code Extension Guide](https://code.visualstudio.com/api/extension-guides/command) - Registering commands vs. making them visible
- [WPF Commands Guide](https://www.codeproject.com/Articles/23301/WPF-A-Beginner-s-guide-Part-3-of-n) - Decoupling command semantics from invocation
- [X-CMD Project Docs](https://www.x-cmd.com/start/cli-tui-llm/) - Structured help for LLM agents
- [LangChain Documentation](https://docs.langchain.com/oss/python/langchain-tools) - Defining tools with descriptions for AI
- [OpenAI API Guide](https://platform.openai.com/docs/guides/function-calling) - Function schemas for model integration
