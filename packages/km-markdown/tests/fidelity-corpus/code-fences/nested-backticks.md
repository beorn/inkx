# Nested backticks and tilde fences

When a code block contains triple-backticks, writers use tilde fences to
avoid ambiguity. This is common in markdown-about-markdown documentation.

~~~markdown
Here's an inline example:

```js
console.log("hi")
```

And more prose.
~~~

~~~~markdown
Even quadruple tildes are fine when the content has triple tildes:

~~~js
console.log("nested")
~~~

End of outer fence.
~~~~

Four-backtick fences also work:

````markdown
You can open a triple-backtick block inside:

```python
print("hello")
```

No ambiguity because the outer fence uses four backticks.
````
