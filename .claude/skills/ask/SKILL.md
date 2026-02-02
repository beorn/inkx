---
description: Quick question to GPT 5.2 (or best available model). Use when user wants a fast answer from another LLM.
argument-hint: <question>
---

# Ask - Quick LLM Query

Query the best available model (GPT 5.2 preferred) for a quick answer.

## Commands

| Command | What |
|---------|------|
| `/ask <question>` | Single model query (~$0.02) |
| `/ask:all <question>` | Multi-model consensus/debate (~$1-3) |

## Usage

**Single model:**
```bash
bun llm "<question>"
```

**Multi-model consensus:**
```bash
bun llm debate -y "<question>"
```

## Examples

User: `/ask what port does postgres use by default`
Run: `bun llm "what port does postgres use by default"`

User: `/ask:all should we use monorepo or polyrepo for this project`
Run: `bun llm debate -y "should we use monorepo or polyrepo for this project"`

## Cost

- `/ask`: ~$0.02 per query (single model)
- `/ask:all`: ~$1-3 per query (queries 3 models, synthesizes)
