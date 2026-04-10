---
description: Deep research using OpenAI's deep research API. Use when user wants thorough research with web search and citations.
argument-hint: <topic>
---

**Keywords**: deep research, thorough research, web search, citations, OpenAI deep

# Deep - OpenAI Deep Research (~$2-5)

```bash
bun llm --deep -y "<topic>"
bun llm --deep --model gpt-5.4-pro -y "<topic>"          # Pro model (~$5-15)
bun llm --deep -y --context "context" "<topic>"
bun llm --deep -y --context-file ./src/module.ts "<topic>"
bun llm --deep -y --with-history "<topic>"
```

**Pro model**: Use `--model gpt-5.4-pro` for thorough analysis. The `pro` keyword does NOT
work with `--deep` (gets absorbed into topic text). Always use `--model gpt-5.4-pro`.

See `/llm` for output format, flags, and fire-and-forget pattern.

**Note**: This is OpenAI's deep research (NOT DeepSeek). Takes 2-15 minutes; interrupted calls auto-recover.

**CRITICAL — Presenting Results**: Deep research costs $2-5. After it completes, you MUST read the full output file and present a comprehensive report (~40 lines unless it warrants more) — not a brief summary. Preserve code snippets, specific recommendations, trade-offs, and citations. See `/llm` "Output & Presenting Results" for the full protocol.

## Execution Pattern

Deep research is fire-and-forget — the command prints the response ID and exits in ~5s.
Research runs server-side at OpenAI (2-15 minutes). Recover the result later.

### Launch and recover

```bash
# Step 1: Run normally — exits in ~5s after printing response ID
bun llm --deep -y "topic"
# → Response ID: resp_abc123...

# Step 2: Do other work while research runs server-side...

# Step 3: Recover result (15-30 min later)
bun llm recover resp_abc123...
# → writes output to /tmp/llm-*.txt

# Step 4: Read the output file
Read(file_path="/tmp/llm-<session>-<timestamp>-<rand>.txt")
```

If you forgot the response ID: `bun llm recover` lists all partial responses.

### Recovery (interrupted/killed processes)

Deep research runs **server-side at OpenAI**. If the local process is killed (Escape, timeout,
crash), the research **continues and completes remotely**. You do NOT need to restart it.

**NEVER restart a deep research call after interruption** — it wastes $2-5 and 15 minutes.
Instead, recover the completed response:

```bash
bun llm recover              # List incomplete responses (shows IDs + status)
bun llm recover <id>         # Retrieve completed response by ID
```

Recovery writes the output file just like a normal completion. If the response isn't ready yet,
`recover` will tell you — wait a few minutes and try again.

### Anti-patterns (NEVER do these)

```
# BAD: run_in_background — output pipe truncates and you lose the response ID
Bash(command='bun llm --deep -y "topic"', run_in_background=true)

# BAD: Restarting after interruption — wastes $$ and time, response is still completing
# Just use: bun llm recover

# BAD: Sleep-polling wastes turns and gets killed
Bash("sleep 30 && wc -c output.txt")

# BAD: Subagent without skill context
Task(subagent_type="general-purpose", prompt="run deep research on X")
```

## Pro Reviews: Do Your Own Review First

Before sending code to Pro models ($5-15 per call), **do your own thorough review first**:
1. Read the code yourself (200K context holds entire packages)
2. Run `/code clean` dry-run — fix DRY violations, complexity, consistency
3. Fix what you find — don't pay Pro for obvious issues
4. Then send cleaned code — Pro's value is what you missed (subtle bugs, architecture, edge cases)

## Context Gathering (CRITICAL for Code Questions)

**First**: Use `/recall` to search session history for prior work on the topic: `bun recall "topic"`. Read the results, extract relevant insights, and summarize them into `--context` — don't pass raw recall output.

Deep research is powerful for specific code bugs when given **complete source code and background**. The researcher has no codebase access — everything they need must be in the context.

### What to Include

**Be generous with context. More is better. 20-50KB is the sweet spot.**

1. **Full source files** — Not snippets. Include entire files involved in the problem.
2. **Type definitions and interfaces** — The types that the code depends on. If a function takes an `InkxNode`, include the full `InkxNode` type definition.
3. **The call chain** — Callers of the broken code AND callees. How does data flow through the system?
4. **Related modules** — If you're fixing phase 3 of a 5-phase pipeline, include all phases. The researcher needs to see how the phases interact.
5. **Test code** — Full test functions (passing AND failing). Passing tests constrain the solution space.
6. **Exact error output** — Copy-paste, never paraphrase. Include line numbers, coordinates, values.
7. **System description** — Architecture, invariants, data flow. Enough for someone unfamiliar to understand the code. 15-30 lines of prose.
8. **Failed approaches** — What you already tried and why it didn't work. Put these LAST (after the code) to avoid anchoring.

### What NOT to Include

- Your diagnosis or theory (put it last if at all — leads to confirmation bias)
- Summaries of code instead of the actual code ("it uses a pipeline" vs showing the pipeline)
- Trimmed snippets with "..." — the trimmed part is often where the bug is

### Asking Good Questions

**Ask discovery questions, not confirmation questions:**

| Good (discovery) | Bad (confirmation) |
|-------------------|--------------------|
| What mechanism could cause spaces in border chars? | Is my prevLayout sync correct? |
| What invariant am I violating? | Should I use a flag or a function? |
| What am I missing about how X and Y interact? | Is this the right approach? |
| Is there a simpler model that resolves both constraints? | Do you agree with my fix? |

Discovery questions let the researcher reason from first principles. Confirmation questions
anchor them on your mental model — which is the one that got you stuck.

**Lead with symptoms, not diagnosis:**
- "Border chars render as spaces after resize" (symptom) not "prevLayout isn't syncing" (diagnosis)
- "Test A passes but test B fails after the same change" (symptom) not "the skip condition is wrong" (diagnosis)

### Context Size Guidelines

| Type | Guideline |
|------|-----------|
| Bug investigation | Include **full files** involved (2000+ lines OK) + types + callers |
| Architecture question | Include full files + docs excerpts + related systems |
| API design | Include existing similar APIs for comparison |
| Refactoring | Include full before-state code + all consumers |
| Performance | Include full pipeline + benchmarks + profiling data |

**Key insight**: Deep research handles large contexts. The more complete the code, the more actionable the response. Vague context = generic advice. Full source = precise fixes. A 40KB context file with 5 full source files will get a far better answer than a 5KB file with cherry-picked snippets.

### Workflow

1. **Gather files** — Read ALL relevant files completely (not excerpts). For bugs, typically 3-8 files.
2. **Build context** — Write a context file with system description + full source code + questions.
3. **Execute** with `--context-file`:

```bash
# Build context file — preamble first, then append source files
cat > /tmp/deep-context.md << 'ENDOFFILE'
# System Description
[Architecture, data flow, key invariants — 15-30 lines]

## What Should Happen
[Correct behavior — precise, not vague]

## What Actually Happens
[Exact symptoms, error messages, test output — copy-paste]

## Questions
[Open, discovery questions]

## Source Code
ENDOFFILE

# Append full source files with clear labels
echo -e '\n### src/types.ts (142 lines)\n```typescript' >> /tmp/deep-context.md
cat src/types.ts >> /tmp/deep-context.md
echo '```' >> /tmp/deep-context.md

echo -e '\n### src/core.ts (380 lines)\n```typescript' >> /tmp/deep-context.md
cat src/core.ts >> /tmp/deep-context.md
echo '```' >> /tmp/deep-context.md

# ... append ALL relevant files

# Then launch — fire-and-forget, exits in ~5s
bun llm --deep -y --no-recover --context-file /tmp/deep-context.md "Review this rendering bug"
# → Response ID: resp_...
# Recover later: bun llm recover resp_...
```

**IMPORTANT**: Always use `--context-file` when context includes source code. The heredoc
approach (`--context "$(cat << 'EOF' ... EOF)"`) breaks when code contains backticks,
`$(...)`, or unmatched quotes — the outer `$(...)` command substitution parses the content
looking for its closing `)` and shell metacharacters in the code confuse the parser.

**IMPORTANT**: Always use `--no-recover` when you want fresh research, to avoid retrieving
stale results from a prior unrelated call.
