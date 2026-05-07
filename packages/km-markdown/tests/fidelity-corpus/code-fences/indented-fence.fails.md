# Indented code fences inside lists

Code fences are common inside list items. CommonMark allows the fence to
be indented up to 3 spaces; inside a list item the fence inherits the
list-item indent.

- First bullet, contains a code block:
  ```ts
  function hello() {
    return "world"
  }
  ```
- Second bullet, no code.
5. Ordered, with fence:

```python
def square(x):
    return x * x
```

4. Next item.

> Blockquote with a fence inside:
> 
> console.log("quoted")
> 
> Prose after the fence.

