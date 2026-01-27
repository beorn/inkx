---
description: Search and recover content from Claude session history
argument-hint: [search-term]
allowed-tools: Bash, Read
---

# Session History Recovery

**Keywords**: session, history, recover, lost, previous session, find conversation

Search through Claude Code session history to find and recover content from past conversations.

## Quick Search

```bash
# Search all sessions for a term
grep -r "search term" ~/.claude/projects/*/sessions/*.json 2>/dev/null | head -20

# Find recent sessions
ls -lt ~/.claude/projects/*/sessions/*.json 2>/dev/null | head -10
```

## Find Project Sessions

```bash
# List all projects with sessions
ls -d ~/.claude/projects/*/sessions 2>/dev/null

# Find sessions for current project
PROJECT_HASH=$(echo -n "$(pwd)" | shasum -a 256 | cut -c1-16)
ls ~/.claude/projects/*$PROJECT_HASH*/sessions/*.json 2>/dev/null
```

## Read Session Content

```bash
# Pretty-print a session file
cat ~/.claude/projects/*/sessions/<session-id>.json | jq '.messages[] | .content' | head -50

# Search within a session
cat ~/.claude/projects/*/sessions/<session-id>.json | jq -r '.messages[].content' | grep -i "term"
```

## Common Recovery Tasks

**Find code you wrote:**

```bash
grep -r "function.*Name" ~/.claude/projects/*/sessions/*.json | head -5
```

**Find a conversation about a topic:**

```bash
grep -l "authentication" ~/.claude/projects/*/sessions/*.json
```

**Get full context from a session:**

```bash
cat <session-file> | jq -r '.messages[] | "\(.role): \(.content[0:200])..."'
```

## Session File Structure

```json
{
  "id": "session-uuid",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "createdAt": "2024-01-20T...",
  "projectPath": "/path/to/project"
}
```

## Tips

- Sessions are stored as JSON, searchable with grep/jq
- Project paths are hashed in the directory name
- Older sessions may be archived or cleaned up
- For code recovery, search for function/variable names
