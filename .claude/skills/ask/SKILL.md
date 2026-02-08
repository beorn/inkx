---
description: Quick question to GPT 5.2 (or best available model). Use when user wants a fast answer from another LLM.
argument-hint: <question>
---

**Keywords**: ask, quick question, fast answer, LLM query

# Ask - Quick LLM Query

```bash
bun llm "<question>"
```

For codebase questions, include brief context: `bun llm "Context: km (TypeScript TUI), file.ts. Question: <q>"`

See `/llm` for output format, flags, and background execution.

**CRITICAL — Presenting Results**: After the LLM responds, read the output file and present the response to the user (~40 lines unless it warrants more). Short `/ask` responses can be presented nearly verbatim. See `/llm` "Output & Presenting Results" for the full protocol.
