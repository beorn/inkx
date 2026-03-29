# Agent CLI Tests

End-to-end tests for `km agent` and `km bd agent` commands.

## Setup

```console
$ beforeAll() {
>   km() { bun run "$ROOT/apps/km-cli/src/index.ts" "$@"; }
>   export -f km
>   km init .
> }
```

## km agent - Help and Structure

### km agent --help

```console
$ km agent --help
Usage: km agent [options] [command]

AI agent lifecycle and runtime management

Options:
  -h, --help                      Display help for command
[...]
```

### km agent ls - Empty list

```console
$ km agent ls
No agents found.
[...]
```

### km agent ls --json

```console
$ km agent ls --json
[]
```

## km agent spawn - Create Agents

### Spawn with defaults

```console
$ km agent spawn "Test Agent"
Created agent: agent-...
[...]
```

### Spawn with custom model

```console
$ km agent spawn "Opus Agent" -m claude-opus-4
Created agent: agent-...
[...]
  Model: claude-opus-4
[...]
```

### Spawn with custom ID

```console
$ km agent spawn "Named Agent" --id my-worker
Created agent: agent-my-worker
[...]
```

## km agent run - Execution

### Run dry-run requires existing agent

```console
$ km agent run nonexistent "Do something" --dry-run 2>&1
Agent not found: nonexistent
[1]
```

### Run --target requires existing agent

```console
$ km agent run nonexistent --target ./nofile.md 2>&1
Agent not found: nonexistent
[1]
```

## km agent harnesses

### List available harnesses

```console
$ km agent harnesses
Available harnesses:

  general
    General-purpose agent harness
```

## km bd agent - Beads Integration

### km bd agent --help

```console
$ km bd agent --help
Usage: km bd agent [options] [command]

Assign issues to agents and manage work queues

Options:
  -h, --help[...]Display help for command
[...]
```

### bd agent ls - Alias for km agent ls

```console
$ km bd agent ls
No agents found.
[...]
```

### bd agent queue - Requires agent ID

```console
$ km bd agent queue nonexistent 2>&1
Agent not found: nonexistent
[1]
```

### bd agent assign - Requires both IDs

```console
$ km bd agent assign nonexistent km-test 2>&1
Agent not found: nonexistent
[1]
```

### bd agent claim - Requires agent ID

```console
$ km bd agent claim nonexistent 2>&1
Agent not found: nonexistent
[1]
```

## Error Handling

### Invalid subcommand

```console
$ km agent invalid 2>&1
error: unknown command 'invalid'
[1]
```

### Missing required argument

```console
$ km agent spawn 2>&1
error: missing required argument 'name'
[1]
```
