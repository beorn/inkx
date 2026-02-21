---
description: Deep research using OpenAI's deep research API. Use when user wants thorough research with web search and citations.
argument-hint: <topic>
---

**Keywords**: deep research, thorough research, web search, citations, OpenAI deep

# Deep - OpenAI Deep Research (~$2-5)

```bash
bun llm --deep -y "<topic>"
bun llm --deep -y --context "context" "<topic>"
bun llm --deep -y --context-file ./src/module.ts "<topic>"
bun llm --deep -y --with-history "<topic>"
```

See `/llm` for output format, flags, and background execution.

**Note**: This is OpenAI's deep research (NOT DeepSeek). Takes 2-15 minutes; interrupted calls auto-recover.

**CRITICAL — Presenting Results**: Deep research costs $2-5. After it completes, you MUST read the full output file and present a comprehensive report (~40 lines unless it warrants more) — not a brief summary. Preserve code snippets, specific recommendations, trade-offs, and citations. See `/llm` "Output & Presenting Results" for the full protocol.

## Execution Pattern

**IMPORTANT**: Deep research takes 2-15 minutes. **ALWAYS run in background** — foreground blocks Claude Code and makes you unresponsive to the user for the entire duration.

### Launch in background

```
# Step 1: Launch (ALWAYS background)
Bash(command='bun llm --deep -y "topic"', run_in_background=true)
# Returns task_id — tell the user you launched it

# Step 2: Do other work while waiting...

# Step 3: Check for completion
TaskOutput(task_id=<id>, block=true, timeout=600000)

# Step 4: Find the output file
ls -lt /tmp/llm-${CLAUDE_SESSION_ID:0:8}-*.txt | head -1

# Step 5: Read the OUTPUT FILE (NOT the task output — that's just streaming tokens)
Read(file_path="/tmp/llm-<session>-<timestamp>-<rand>.txt")
```

**WARNING**: Deep research streams thousands of tokens to stderr. Background task output
captures stderr+stdout combined, which can exceed 30KB and get truncated by Claude Code.
The actual response is in the OUTPUT FILE, not in the task output. Always read the file.

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
# BAD: Foreground — blocks Claude Code for 15 minutes, user can't interact
Bash(command='bun llm --deep -y "topic"', timeout=600000)

# BAD: Restarting after interruption — wastes $$ and time, response is still completing
# Just use: bun llm recover

# BAD: Sleep-polling wastes turns and gets killed
Bash("sleep 30 && wc -c output.txt")

# BAD: Subagent without skill context
Task(subagent_type="general-purpose", prompt="run deep research on X")
```

**If running from a subagent/Task**: Use foreground with `timeout=600000` as a last resort
(subagents don't block the user). But prefer background when possible.

## Context Gathering (CRITICAL for Code Questions)

**First**: Use `/recall` to search session history for prior work on the topic: `bun recall "topic"`. Read the results, extract relevant insights, and summarize them into `--context` — don't pass raw recall output.

Deep research is powerful for specific code bugs when given **complete source code**. Don't be stingy — include entire files, not snippets.

### What to Include

1. **Full source files** - Not snippets. Include the entire file(s) involved.
2. **Problem description** - Specific symptoms, error messages, reproduction steps
3. **Project context** - Brief overview (TypeScript/Bun/Ink/SQLite TUI)
4. **Specific questions** - What you want feedback on

### Context Size Guidelines

| Type | Guideline |
|------|-----------|
| Bug investigation | Include **full files** involved (2000+ lines OK) |
| Architecture question | Include full files + docs excerpts |
| API design | Include existing similar APIs for comparison |
| Refactoring | Include full before-state code |

**Key insight**: Deep research handles large contexts. The more specific code you provide, the more actionable the response. Vague context = generic advice. Full source = precise fixes.

### Workflow

1. **Gather files** — Read ALL relevant files completely (not excerpts). For bugs, typically 2-5 files.
2. **Build context** — Write a context file with problem description + full source code.
3. **Execute** with `--context-file`:

```bash
# Write context to a temp file (preamble + source files)
# Then pass it with --context-file (PREFERRED for code — avoids shell quoting issues)
bun llm --deep -y --context-file /tmp/deep-context.md "Review this rendering bug"
```

**IMPORTANT**: Always use `--context-file` when context includes source code. The heredoc
approach (`--context "$(cat << 'EOF' ... EOF)"`) breaks when code contains backticks,
`$(...)`, or unmatched quotes — the outer `$(...)` command substitution parses the content
looking for its closing `)` and shell metacharacters in the code confuse the parser.

**Building the context file**: Use Bash `cat >` with a heredoc for the preamble, then
append source files:

```bash
cat > /tmp/deep-context.md << 'ENDOFFILE'
# Problem description here
## Source Code
ENDOFFILE
cat src/module.ts >> /tmp/deep-context.md
```
