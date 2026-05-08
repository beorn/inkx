---
aliases:
  - km-silvery.agent-native-cli
  - km-silvery-agent-native-cli
created_at: 2026-05-08T17:07:46.391Z
---

# Agent-native CLI principles: audit silvercode/km-cli/accountly + extend @silvery/commander + MCP auto-gen #feature #P4 ^agent-native-cli

Make our CLIs (silvercode, km-cli, accountly) align with the 10 agent-native
CLI principles published by Trevin (trevinsays.com/p/10-principles-for-agent-native-clis,
2026), and extend `@silvery/commander` so the framework *encodes* those
principles by default — including auto-generating an MCP server from the
same Commander tree.

Source — Trevin's 10 principles, two tiers:

Tier 1 (table stakes)
    1. Non-interactive by default
    2. Structured, parseable output (JSON, stdout/stderr split, typed exit codes)
    3. Errors that teach and enumerate (one-shot self-correction)
    4. Safe retries + explicit mutation boundaries (idempotency, --dry-run, --force)
    5. Bounded responses at every layer (default page sizes, truncation hints)

Tier 2 (compounding)
    6. Cross-CLI vocabulary consistency (get/list, --json, --force, --wait)
    7. Three-layer introspection (--help, agent-context JSON, SKILL.md)
    8. Async-aware execution (--wait, persistent job ledger)
    9. Persistent identity through profiles (--profile, ~/.<cli>/profiles.json)
   10. Two-way I/O (--deliver=stdout|file:|webhook:, feedback command)

Trevin's load-bearing meta-point: Tier 2 consistency cannot be maintained via
manual review. The architectural foundation must be a schema/codegen pipeline
(Cloudflare's example) that emits CLI + SDK + Terraform provider + MCP server
from one schema. This bead is our version of that — but built on top of
`@silvery/commander`'s existing type-safe Commander tree, not a parallel schema.

## In scope

Three CLI surfaces — focus the audit on these:

- `apps/silvercode` — silvercode bin (silvery-native agent workspace)
- `apps/km-cli` — `km` bin (command tree: add, agent, bd, list, view, sync, doctor, …)
- `vendor/accountly` — `accountly` + `recall` bins (account manager)

Plus the framework that enables all three:

- `vendor/silvery/packages/commander` — `@silvery/commander`, the typed Commander wrapper
- Possibly a new `vendor/silvery/packages/commander-mcp` (or commander extension)
  for MCP auto-generation

Out of scope (for now): km-tui (TUI, not a CLI surface), km-repl, km-web.

## Audit checklist — 10 principles × 3 CLIs

For each principle, mark per CLI: ✓ ok · ◐ partial · ✗ gap · n/a

| #   | Principle                                             | silvercode | km-cli | accountly | Notes                                                               |
| --- | ----------------------------------------------------- | ---------- | ------ | --------- | ------------------------------------------------------------------- |
| 1   | Non-interactive by default                            | ?          | ?      | ?         | check for prompt/readline calls; honest TTY detect                  |
| 2   | Structured output (--json, stdout/stderr, typed exit) | ?          | ◐      | ?         | km-cli has --json on some commands, not uniform                     |
| 3   | Errors that teach + enumerate                         | ◐          | ◐      | ◐         | Zod errors enumerate enums; resource-not-found does not             |
| 4   | Idempotent mutations + --dry-run                      | ✗          | ◐      | ?         | km bd create --id <X> is idempotent on id collision; --dry-run rare |
| 5   | Bounded responses + pagination                        | ?          | ◐      | ?         | km bd list --limit N exists; defaults? truncation hint?             |
| 6   | Cross-CLI vocabulary consistency                      | ?          | ?      | ?         | inventory verbs/flags across all 3, find drift                      |
| 7   | Three-layer introspection (help/agent-context/skill)  | ✗          | ✗      | ✗         | --help exists; agent-context JSON does NOT exist anywhere           |
| 8   | Async-aware (--wait + job ledger)                     | ✗          | ✗      | ✗         | no shared job ledger; spawn commands are fire-and-forget            |
| 9   | Persistent identity / profiles                        | ✗          | ◐      | ✓         | accountly is profiles; km-cli has KM_REPO env; no general --profile |
| 10  | Two-way I/O (--deliver, feedback)                     | ✗          | ✗      | ✗         | no --deliver, no feedback channel anywhere                          |

(Marks above are best-effort from a quick read; phase 1 of this bead does the
real audit and fills the matrix.)

## Phase 1 — audit pass (1 day)

For silvercode, km-cli, accountly: walk the Commander tree, score every
leaf command against the 10 principles, fill the matrix above, and produce
a gap report at `hub/silvery/design/agent-native-cli-audit.md`. Output must
include:

- Inventory of every (cli × subcommand) pair
- Verb / flag drift inventory (e.g., do we use `info` anywhere where `get`
  would be agent-native? `ls` instead of `list`? `--format=json` instead of
  `--json`?)
- Per-command idempotency profile (which mutations are safe to retry, which
  generate duplicates)
- Per-command pagination profile (default size, max, truncation behavior)
- List of commands that require interactive input today

## Phase 2 — `@silvery/commander` extensions (the architectural foundation)

The big idea: encode the principles as Commander methods so every CLI built
on `@silvery/commander` gets them by default. Trevin's "must be enforced
mechanically, not by review" applies — the framework is our enforcement
mechanism.

Concrete proposed surface (subject to design pass):

```ts
// 2a. Standard JSON output as a first-class concern
new Command("posts")
  .command("list")
  .standardJSON()                              // adds --json (alias for the
                                               // pipe-detected default), wires
                                               // up stdout/stderr split, sets
                                               // exit code conventions
  .limit({ default: 20, max: 100 })            // bounded responses (#5);
                                               // adds --limit + --cursor;
                                               // emits {items, truncated, hint}
                                               // shape automatically

// 2b. Mutation boundary as a first-class concern
new Command("posts")
  .command("delete <id>")
  .mutates({                                   // marks command as destructive
    idempotent: true,                          // generated agent-context says so
    requiresForce: true,                       // adds --force, refuses w/o it in
                                               // non-interactive mode
    dryRun: true,                              // adds --dry-run; framework
                                               // captures planned mutations
                                               // and prints the plan
  })

// 2c. Async + job ledger
new Command("video")
  .command("render")
  .asyncJob({                                  // adds --wait / --no-wait,
    ledger: "~/.silvercode/jobs.jsonl",        // persists job to ledger,
    pollInterval: "exp-backoff",               // exposes `silvercode jobs
  })                                           // {list,get,prune}` automatically

// 2d. Profiles
new Command("silvercode")
  .profiles({                                  // adds --profile <name> at root,
    path: "~/.silvercode/profiles.json",       // precedence: flag > env >
    fields: ["model", "harness", "agent"],     // profile > default;
  })                                           // emits available profiles in
                                               // agent-context

// 2e. Two-way I/O
new Command("video")
  .command("render")
  .deliverable({                               // adds --deliver,
    sinks: ["stdout", "file", "webhook"],      // unknown sinks → structured
  })                                           // refusal naming supported

// 2f. Errors that teach
new Command("posts")
  .command("set-visibility")
  .option(
    "--visibility <v>",
    "Visibility",
    z.enum(["public", "private", "unlisted"]),
  )
  // Already partial today — z.enum errors enumerate. Extend to:
  //   - resource-not-found errors that suggest similar ids (Levenshtein)
  //   - "unknown subcommand" errors that list closest match
  .errorsTeach()

// 2g. Three-layer introspection — auto wired
//   Layer 1: --help (already exists)
//   Layer 2: <cli> agent-context [--json]   ← NEW, generated from Commander tree
//   Layer 3: SKILL.md packaged with skill manifest (separate concern, leave alone)
```

Each `.standardJSON()`, `.mutates()`, `.asyncJob()`, `.profiles()`,
`.deliverable()`, `.errorsTeach()` is a plugin in the existing
`@silvery/commander` style — composable, type-preserving, opt-in but easy.

Strong defaults matter. Consider making `.standardJSON()` the implicit
default when the program has a `program.agentNative()` flag set, so a CLI
opts into "all 10 principles by default" with one call and overrides per
command if needed.

## Phase 3 — MCP server auto-generation

Trevin's foundational point: "from a single authoritative schema, generate
CLI + SDK + Terraform + MCP." `@silvery/commander` already IS that schema —
type-safe Commander tree with full option/argument types, Zod schemas, and
descriptions. We just need the emitter.

Proposed approach:

```ts
// In your CLI bootstrap:
program.parse()           // existing — runs as CLI
// OR:
program.serveMCP()        // NEW — same binary, MCP stdio/http server mode

// Selected by:
silvercode --mcp                    // stdio server mode
silvercode --mcp http :7777         // http transport
silvercode <subcommand> ...         // normal CLI mode
```

Each leaf Commander command becomes one MCP tool:

Tool name: `silvercode.posts.list` (dotted path through Commander tree)
  Input schema: derived from .argument() + .option() chain (Zod → JSON Schema)
  Description: from .description() + .summary() + selected SKILL.md fragment
  Output schema: from .standardJSON() if set, otherwise text
  Side-effect annotation: from .mutates() metadata

Three orchestration modes (mirroring Press's design space):

endpoint-mirror (default): one MCP tool per leaf command — the obvious mapping
  intent: declarative composed tools defined in a manifest
  code: expose a `silvercode.shell` tool that lets the agent run any subcommand

Implementation sketch:

- New package: `vendor/silvery/packages/commander-mcp` (or extend
    `@silvery/commander` directly — TBD in design pass)
- Walks the Commander tree (already typed)
- Emits MCP tool definitions on demand
- Same binary serves both modes — no separate `<cli>-mcp` binary needed
- `agent-context` subcommand from phase 2 emits the same schema as static
    JSON for offline agents

Why one binary, not two: matches Press's `internal/store` / `internal/client`
sharing, but goes further — same Commander tree drives both surfaces. Zero
duplication. Zero schema drift. The CLI flag IS the MCP tool input.

## Phase 4 — migrate the three CLIs

Once the framework lands:

- silvercode: opt into `.agentNative()` at program root, audit each command
- km-cli: same — particularly `km bd *`, `km list`, `km query`, `km show`
- accountly: same — has profiles already, so the migration is mostly --json
  + agent-context

Deliverables per CLI:

- All commands pass the audit matrix (✓ on all 10 principles or n/a with
    documented reason)
- `<cli> agent-context --json` emits a versioned schema
- `<cli> --mcp` runs an MCP server with all commands as tools
- `~/<cli>` directory layout matches recommended defaults
    (profiles.json, jobs.jsonl)
- Verification: a smoke test where Claude is given only `<cli>
    agent-context --json` and is asked to perform a representative task —
    must succeed without `--help`

## Phase 5 — bake in via verification

Mechanical gates so we don't drift back:

- `tools/check-agent-native.ts` — lint that walks every Commander tree in
    the monorepo and checks: no `info` (use `get`), no `--format=json` (use
    `--json`), every mutation has --dry-run + --force, every list has --limit,
    every program has agent-context
- CI step that runs the lint
- Pre-publish hook for each CLI

## Acceptance criteria (close when ALL are true)

- [ ] Audit matrix at `hub/silvery/design/agent-native-cli-audit.md` is
        filled for silvercode + km-cli + accountly with concrete ✓/◐/✗ per
        principle per command.
- [ ] `@silvery/commander` ships `.standardJSON()`, `.mutates()`,
        `.asyncJob()`, `.profiles()`, `.deliverable()`, `.errorsTeach()`,
        `.agentNative()` (umbrella) — each with type-preserving inference,
        documented in commander README.
- [ ] `@silvery/commander` ships `agent-context` subcommand auto-wired at
        program root: emits versioned JSON describing the entire tree.
- [ ] MCP auto-gen lands as `program.serveMCP()` (or
        `vendor/silvery/packages/commander-mcp`) — same binary serves CLI
        and MCP stdio/http; one MCP tool per leaf command; input schema
        derived from Commander option/argument types.
- [ ] silvercode, km-cli, accountly all opt into `.agentNative()`, all
        pass the lint, all expose `agent-context` and `--mcp`.
- [ ] `tools/check-agent-native.ts` runs in CI; PRs that introduce
        non-agent-native patterns fail the lint.
- [ ] One-shot smoke test passes: a fresh Claude session given only
        `<cli> agent-context --json` performs a representative task per
        CLI without falling back to `--help`.

## Why this matters

Two reasons:

1. Direct value: silvercode + km-cli + accountly get measurably better as
   tools used by Claude/Codex/agents. Especially silvercode, which IS the
   agent workspace — eating our own dog food.
2. Strategic dogfood for Silvery's app-explosion thesis. The 10 principles
   are exactly what the catalog of 100 small apps will need to satisfy.
   Encoding them in `@silvery/commander` once means every Silvery-built app
   gets agent-native conventions for free — same "framework as substrate"
   bet as the rest of the app-explosion story. Without this, every app
   reinvents the contract; with it, the contract IS the framework.

## Related

- hub/silvery/vision/app-explosion.md — the broader thesis this serves
- ~/Bear/Journal/ref/agent-tooling/printingpress.md — Printing Press as
    the parallel arrow (their "absorb gate" + creativity ladder + agent-CLI
    conventions are essentially the same set of principles, just generated)
- @km/silvery/cli-ecosystem (closed) — original `@silvery/commander` ship
- @km/silvery/cli-commander (open) — ongoing commander work; this bead
    extends that direction
- @km/silvery/commands-commander-bridge (open) — relationship between
    @silvery/commands (TEA action tree) and @silvery/commander (CLI tree);
    relevant when MCP gen wants to expose both surfaces

## Open design questions

- Single `.agentNative()` umbrella vs explicit per-feature opt-in? Default
    on or off? Current lean: umbrella that turns ALL principles on with sane
    defaults; per-command override; off-by-default for back-compat with
    older silvery commander users; on-by-default in v1.0+.
- MCP gen as separate package (`commander-mcp`) or extension method on
    Command? Lean: extension method (`program.serveMCP()`) so the same
    binary toggles modes. Separate package only if the MCP runtime
    dependency footprint is unacceptable for non-MCP users.
- Job ledger format: shared across CLIs or per-CLI? Lean: per-CLI default
    path (`~/.<cli>/jobs.jsonl`), with an opt-in `XDG_STATE_HOME` aggregator
    for users who want one ledger across tools.
- `feedback` command: where does it ship to? Lean: `MYCLI_FEEDBACK_ENDPOINT`
    env (per Trevin), defaults to a github-issue-template URL printed for
    the user, optional webhook for hosted CLIs.

Phase 3 (MCP auto-gen via program.serveMCP) overlaps @beorn/zod-commander Tier 2 candidate in @km/all/shared-substrate-review — cloudi has ~200 LOC generateMCPTools(program) reference impl already. Coordinate before either ships (2026-05-08)

