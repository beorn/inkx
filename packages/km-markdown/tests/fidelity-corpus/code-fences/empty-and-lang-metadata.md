# Empty fences and language metadata

Some tools emit empty fences as placeholders. Others attach extra metadata
after the language hint (file paths, line ranges).

```
a plain fence with no language hint
```

```js
// Just js
const x = 1
```

```ts title="src/foo.ts" {1,3-5}
// lang with title and line highlight metadata — Docusaurus / Astro style
const a = 1
const b = 2
const c = 3
```

```python {hl_lines="2 4"}
def foo():
    return 42

def bar():
    return 7
```

```
```

(Empty fence above — zero lines between the open and close markers.)
