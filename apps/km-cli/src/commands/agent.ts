/**
 * Agent Command (km agent)
 *
 * AI agent lifecycle and runtime management.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import {
  queryAgents,
  getAgent,
  createAgentNode,
  stopAgentFields,
  loadHarness,
  listHarnesses,
  getAgentSessions,
  getSession,
  type Agent,
  type AgentStatus,
} from "@km/agent"
import { resolvePathArg, findKmRootFromPath } from "@km/storage"
import { loadRepo } from "../load-repo.ts"
import { getRootPath } from "../program.ts"

// Commander option interfaces
interface LsOptions {
  status?: string
  harness?: string
  json?: boolean
}

interface SpawnOptions {
  model?: string
  harness?: string
  id?: string
  workdir?: string
  json?: boolean
}

interface ShowOptions {
  json?: boolean
}

interface HarnessesOptions {
  json?: boolean
}

interface SessionsOptions {
  limit?: number
  json?: boolean
}

interface SessionOptions {
  json?: boolean
}

interface RunOptions {
  target?: string
  continuous?: boolean
  maxTasks?: number
  dryRun?: boolean
}

export const agentCommand = new Command("agent")
  .description("AI agent lifecycle and runtime management")
  .addHelpText(
    "after",
    `
Agents are AI assistants that can work on tasks autonomously. Each agent has:
  - A model (e.g., claude-sonnet-4) that powers its reasoning
  - A harness that defines available tools and constraints
  - A work queue of assigned issues from the beads system

Lifecycle Commands:
  km agent ls              List all agents
  km agent spawn <name>    Create a new agent
  km agent stop <id>       Stop an agent gracefully
  km agent kill <id>       Force kill an agent

Execution Commands:
  km agent run <id> [prompt]    Run agent with prompt (one-shot)
    --target <path|id|@ref>     Work on ANY task in repo
    --continuous                Process work queue continuously

Configuration:
  km agent harnesses       List available harnesses
  km agent show <id>       Show agent details

Sessions:
  km agent sessions [id]   List agent sessions
  km agent session <id>    View session transcript

Related commands:
  km bd agent queue <id>   Show agent's assigned issues
  km bd agent assign       Assign beads issues to agents
  km bd agent claim        Agent claims next ready beads issue

Target Resolution (--target):
  --target accepts any task reference that km can resolve:
    ./path/to/file.md     File path (relative or absolute)
    @next                 @ref shortcut
    01ABC123              Node ID or prefix
    km-a1b2               Beads issue short ID

Examples:
  km agent spawn "Code Assistant" -m claude-sonnet-4
  km agent run agent-1 "Review the authentication code"
  km agent run agent-1 --target ./Projects/auth.md
  km agent run agent-1 --target @next
  km agent run agent-1 --target km-a1b2
  km agent ls --status running`,
  )
  .allowUnknownOption(false)

// km agent ls - List all agents
agentCommand
  .command("ls")
  .description("List all agents")
  .option("-s, --status <status>", "Filter by status (idle, running, stopped, error)")
  .option("--harness <name>", "Filter by harness")
  .option("--json", "Output as JSON")
  .action(async (opts: LsOptions) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(pathResolved.repoRoot)

    const filter: { status?: AgentStatus; harness?: string } = {}
    if (opts.status) filter.status = opts.status as AgentStatus
    if (opts.harness) filter.harness = opts.harness

    const agents = queryAgents(repo, filter)

    if (opts.json) {
      console.log(JSON.stringify(agents, null, 2))
      return
    }

    if (agents.length === 0) {
      console.log(term.yellow("No agents found."))
      return
    }

    console.log(term.bold(`Agents (${agents.length}):\n`))
    for (const agent of agents) {
      printAgent(agent)
    }
  })

// km agent spawn <name> - Create a new agent
agentCommand
  .command("spawn <name>")
  .description("Create a new agent")
  .option("-m, --model <model>", "LLM model (default: claude-sonnet-4)")
  .option("-h, --harness <name>", "Harness name (default: general)")
  .option("--id <custom>", "Custom short ID")
  .option("--workdir <path>", "Working directory")
  .option("--json", "Output as JSON")
  .action((name: string, opts: SpawnOptions) => {
    // Validate harness exists
    if (opts.harness) {
      const harness = loadHarness(opts.harness)
      if (!harness) {
        console.error(term.red(`Harness not found: ${opts.harness}`))
        console.error(term.dim(`Available harnesses: ${listHarnesses().join(", ")}`))
        process.exitCode = 1
        return
      }
    }

    const { node, shortId } = createAgentNode(name, {
      model: opts.model,
      harness: opts.harness,
      customId: opts.id,
      workdir: opts.workdir,
    })

    if (opts.json) {
      console.log(JSON.stringify({ shortId, node }, null, 2))
      return
    }

    console.log(term.green(`Created agent: ${shortId}`))
    console.log(term.dim(`  Name: ${name}`))
    console.log(term.dim(`  Model: ${opts.model ?? "claude-sonnet-4"}`))
    console.log(term.dim(`  Harness: ${opts.harness ?? "general"}`))

    // Note: Actual persistence requires km-storage integration
    console.log(term.yellow("\nNote: Agent created in memory. Persistence pending."))
  })

// km agent stop <id> - Stop an agent
agentCommand
  .command("stop <id>")
  .description("Stop an agent gracefully")
  .action(async (id) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(pathResolved.repoRoot)
    const agent = getAgent(repo, id)
    if (!agent) {
      console.error(term.red(`Agent not found: ${id}`))
      process.exitCode = 1
      return
    }

    const updates = stopAgentFields()
    void updates // Use for persistence later

    console.log(term.green(`Stopped agent: ${agent.shortId}`))
    console.log(term.yellow("\nNote: Update created in memory. Persistence pending."))
  })

// km agent kill <id> - Force kill an agent
agentCommand
  .command("kill <id>")
  .description("Force kill an agent")
  .action(async (id) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(pathResolved.repoRoot)
    const agent = getAgent(repo, id)
    if (!agent) {
      console.error(term.red(`Agent not found: ${id}`))
      process.exitCode = 1
      return
    }

    // If agent has a PID, we could kill the process here
    if (agent.pid) {
      console.log(term.dim(`Would kill process ${agent.pid}`))
    }

    const updates = stopAgentFields()
    void updates

    console.log(term.yellow(`Killed agent: ${agent.shortId}`))
    console.log(term.yellow("\nNote: Update created in memory. Persistence pending."))
  })

// km agent show <id> - Show agent details
agentCommand
  .command("show <id>")
  .description("Show agent details")
  .option("--json", "Output as JSON")
  .action(async (id: string, opts: ShowOptions) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(pathResolved.repoRoot)
    const agent = getAgent(repo, id)
    if (!agent) {
      console.error(term.red(`Agent not found: ${id}`))
      process.exitCode = 1
      return
    }

    if (opts.json) {
      console.log(JSON.stringify(agent, null, 2))
      return
    }

    printAgentDetails(agent)
  })

// km agent harnesses - List available harnesses
agentCommand
  .command("harnesses")
  .description("List available harnesses")
  .option("--json", "Output as JSON")
  .action((opts: HarnessesOptions) => {
    const harnesses = listHarnesses()

    if (opts.json) {
      const detailed = harnesses.map((name) => {
        const h = loadHarness(name)
        return { name, description: h?.description, tools: h?.tools }
      })
      console.log(JSON.stringify(detailed, null, 2))
      return
    }

    console.log(term.bold("Available harnesses:\n"))
    for (const name of harnesses) {
      const h = loadHarness(name)
      console.log(`  ${term.cyan(name)}`)
      if (h?.description) {
        console.log(term.dim(`    ${h.description}`))
      }
    }
  })

// km agent sessions [agent-id] - List sessions
agentCommand
  .command("sessions [agent-id]")
  .description("List sessions (optionally for a specific agent)")
  .option("-n, --limit <n>", "Limit results", parseInt)
  .option("--json", "Output as JSON")
  .action((agentId: string | undefined, opts: SessionsOptions) => {
    const kmDir = findKmRootFromPath(process.cwd())
    if (!kmDir) {
      console.error(term.red("No .km directory found"))
      process.exitCode = 1
      return
    }
    const sessions = agentId ? getAgentSessions(kmDir, agentId, opts.limit) : []

    if (opts.json) {
      console.log(JSON.stringify(sessions, null, 2))
      return
    }

    if (sessions.length === 0) {
      console.log(term.yellow("No sessions found."))
      console.log(term.dim("(Session querying not yet implemented)"))
      return
    }

    console.log(term.bold(`Sessions (${sessions.length}):\n`))
    for (const session of sessions) {
      console.log(`  ${term.cyan(session.id)} - ${session.status}`)
    }
  })

// km agent session <session-id> - View session transcript
agentCommand
  .command("session <session-id>")
  .description("View session transcript")
  .option("--json", "Output as JSON")
  .action((sessionId: string, opts: SessionOptions) => {
    const kmDir = findKmRootFromPath(process.cwd())
    if (!kmDir) {
      console.error(term.red("No .km directory found"))
      process.exitCode = 1
      return
    }
    const session = getSession(kmDir, sessionId)

    if (!session) {
      console.error(term.red(`Session not found: ${sessionId}`))
      console.log(term.dim("(Session querying not yet implemented)"))
      process.exitCode = 1
      return
    }

    if (opts.json) {
      console.log(JSON.stringify(session, null, 2))
      return
    }

    console.log(term.bold(`Session: ${session.id}`))
    console.log(`  Agent: ${session.agentId}`)
    console.log(`  Status: ${session.status}`)
    if (session.taskId) console.log(`  Task: ${session.taskId}`)
  })

// km agent run <id> [prompt] - Run an agent
agentCommand
  .command("run <id> [prompt]")
  .description("Run an agent (one-shot with prompt, or continuous)")
  .option("--target <path|id|@ref>", "Work on a specific task (path, ID, or @ref)")
  .option("--continuous", "Process work queue continuously")
  .option("--max-tasks <n>", "Max tasks in continuous mode", parseInt)
  .option("--dry-run", "Show plan without executing")
  .action(async (id: string, prompt: string | undefined, opts: RunOptions) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(pathResolved.repoRoot)
    const agent = getAgent(repo, id)
    if (!agent) {
      console.error(term.red(`Agent not found: ${id}`))
      process.exitCode = 1
      return
    }

    // Resolve target task if specified
    let targetTask: { id: string; name?: string; path?: string } | null = null
    if (opts.target) {
      const resolved = repo.resolveNode(opts.target, { taskOnly: true })
      if (!resolved) {
        console.error(term.red(`Could not resolve target: ${opts.target}`))
        console.error(term.dim("Target can be a file path, node ID, or @ref"))
        process.exitCode = 1
        return
      }
      targetTask = {
        id: resolved.id,
        name: resolved.name ?? undefined,
        path: resolved.fs_path ?? undefined,
      }
    }

    if (opts.dryRun) {
      console.log(term.bold("Dry run mode - would execute:"))
      console.log(`  Agent: ${agent.shortId} (${agent.name})`)
      console.log(`  Model: ${agent.model}`)
      console.log(`  Harness: ${agent.harness}`)
      if (prompt) console.log(`  Prompt: "${prompt}"`)
      if (targetTask) {
        console.log(`  Target: ${targetTask.id}`)
        if (targetTask.name) {
          console.log(`          ${term.dim(targetTask.name)}`)
        }
        if (targetTask.path) {
          console.log(`          ${term.dim(targetTask.path)}`)
        }
      }
      if (opts.continuous) console.log(`  Mode: continuous`)
      return
    }

    console.log(term.yellow("Agent runtime not yet implemented."))
    console.log(term.dim("This will execute the agent with the Claude API."))
  })

// Helper functions

function printAgent(agent: Agent): void {
  const status = formatStatus(agent.status)
  const task = agent.currentTaskId ? term.dim(` → ${agent.currentTaskId}`) : ""

  console.log(`${status} ${term.cyan(agent.shortId)} ${agent.name}${task}`)
  console.log(term.dim(`   ${agent.model} / ${agent.harness}`))
}

function printAgentDetails(agent: Agent): void {
  console.log(term.bold(`Agent: ${agent.shortId}`))
  console.log()
  console.log(`  Name:     ${agent.name}`)
  console.log(`  Status:   ${formatStatus(agent.status)}`)
  console.log(`  Model:    ${agent.model}`)
  console.log(`  Harness:  ${agent.harness}`)

  if (agent.workdir) console.log(`  Workdir:  ${agent.workdir}`)
  if (agent.pid) console.log(`  PID:      ${agent.pid}`)
  if (agent.currentTaskId) console.log(`  Task:     ${agent.currentTaskId}`)

  console.log()
  console.log(term.dim(`  Created:  ${new Date(agent.createdAt).toISOString()}`))
  console.log(term.dim(`  Updated:  ${new Date(agent.updatedAt).toISOString()}`))
}

function formatStatus(status: AgentStatus): string {
  switch (status) {
    case "idle":
      return term.dim("○")
    case "running":
      return term.green("●")
    case "paused":
      return term.yellow("◐")
    case "stopped":
      return term.gray("○")
    case "error":
      return term.red("✗")
  }
}
