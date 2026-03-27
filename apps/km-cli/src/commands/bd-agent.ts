/**
 * BD Agent Command (bd agent)
 *
 * Thin shim for beads-integrated agent commands.
 * Delegates to @km/agent for core functionality.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import {
  queryAgents,
  getAgent,
  getAgentQueue,
  assignIssueFields,
  unassignIssueFields,
  claimIssueFields,
  type Agent,
} from "@km/agent"
import { queryReady, getIssue } from "@km/beads"
import { resolvePathArg } from "@km/storage"
import { loadRepo } from "../load-repo.ts"
import { getRootPath } from "../program.ts"

export const bdAgentCommand = new Command("agent")
  .description("Assign issues to agents and manage work queues")
  .allowUnknownOption(false)
  .addHelpText(
    "after",
    `
Agents work through assigned issues autonomously. Create agents with
'km agent spawn', then assign issues or let them auto-claim from the
backlog with 'bd agent claim'.

Example workflow:
  km agent spawn "Worker" -h code-reviewer   # Create agent
  bd agent assign agent-1 km-a1b2            # Assign issue
  bd agent run agent-1                       # Start working`,
  )

// bd agent ls - List agents (alias for km agent ls)
bdAgentCommand
  .command("ls")
  .description("List all agents")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(pathResolved.repoRoot)
    const agents = queryAgents(repo)

    if (opts.json) {
      console.log(JSON.stringify(agents, null, 2))
      return
    }

    if (agents.length === 0) {
      console.log(term.yellow("No agents found."))
      console.log(term.dim("Use 'km agent spawn <name>' to create one."))
      return
    }

    console.log(term.bold(`Agents (${agents.length}):\n`))
    for (const agent of agents) {
      printAgent(agent)
    }
  })

// bd agent queue <agent-id> - Show agent's assigned issues
bdAgentCommand
  .command("queue <agent-id>")
  .description("Show agent's assigned issues")
  .option("--json", "Output as JSON")
  .action(async (agentId, opts) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(pathResolved.repoRoot)
    const agent = getAgent(repo, agentId)
    if (!agent) {
      console.error(term.red(`Agent not found: ${agentId}`))
      process.exitCode = 1
      return
    }

    const queue = getAgentQueue(repo, agentId)

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            agent: agent.shortId,
            currentTask: agent.currentTaskId,
            queue,
          },
          null,
          2,
        ),
      )
      return
    }

    console.log(term.bold(`Work queue for ${agent.shortId}:\n`))

    if (agent.currentTaskId) {
      console.log(`  ${term.green("▶")} Current: ${term.cyan(agent.currentTaskId)}`)
    }

    if (queue.length === 0 && !agent.currentTaskId) {
      console.log(term.dim("  No tasks assigned."))
    } else if (queue.length > 0) {
      console.log()
      for (const item of queue) {
        const isCurrent = item.issueShortId === agent.currentTaskId
        const prefix = isCurrent ? term.green("▶") : term.dim("○")
        const priority = term.dim(`P${item.priority}`)
        console.log(`  ${prefix} ${term.cyan(item.issueShortId)} ${priority} ${item.title}`)
      }
    }
  })

// bd agent assign <agent-id> <issue-id> - Assign issue to agent
bdAgentCommand
  .command("assign <agent-id> <issue-id>")
  .description("Assign an issue to an agent's queue")
  .action(async (agentId, issueId) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(pathResolved.repoRoot)
    const agent = getAgent(repo, agentId)
    if (!agent) {
      console.error(term.red(`Agent not found: ${agentId}`))
      process.exitCode = 1
      return
    }

    const issue = getIssue(issueId, { repo })
    if (!issue) {
      console.error(term.red(`Issue not found: ${issueId}`))
      process.exitCode = 1
      return
    }

    // Get the field updates needed
    const assignment = assignIssueFields(agent.shortId)
    void assignment // Will be used for persistence

    console.log(term.green(`Assigned ${issue.shortId} to ${agent.shortId}`))
    console.log(term.dim(`  ${issue.title}`))
    console.log(term.yellow("\nNote: Assignment not yet persisted to storage."))
  })

// bd agent unassign <agent-id> <issue-id> - Remove assignment
bdAgentCommand
  .command("unassign <agent-id> <issue-id>")
  .description("Remove an issue from agent's queue")
  .action(async (agentId, issueId) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(pathResolved.repoRoot)
    const agent = getAgent(repo, agentId)
    if (!agent) {
      console.error(term.red(`Agent not found: ${agentId}`))
      process.exitCode = 1
      return
    }

    const issue = getIssue(issueId, { repo })
    if (!issue) {
      console.error(term.red(`Issue not found: ${issueId}`))
      process.exitCode = 1
      return
    }

    // Get the field updates needed
    const assignment = unassignIssueFields()
    void assignment // Will be used for persistence

    console.log(term.green(`Unassigned ${issue.shortId} from ${agent.shortId}`))
    console.log(term.yellow("\nNote: Unassignment not yet persisted to storage."))
  })

// bd agent claim <agent-id> - Agent claims next ready issue
bdAgentCommand
  .command("claim <agent-id>")
  .description("Agent claims the next ready issue from the backlog")
  .option("--json", "Output as JSON")
  .action(async (agentId, opts) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(pathResolved.repoRoot)
    const agent = getAgent(repo, agentId)
    if (!agent) {
      console.error(term.red(`Agent not found: ${agentId}`))
      process.exitCode = 1
      return
    }

    // Get ready issues sorted by priority
    const ready = queryReady({}, undefined, undefined, { repo })
    if (ready.length === 0) {
      console.log(term.yellow("No ready issues to claim."))
      return
    }

    // Claim the first one (highest priority)
    const issue = ready[0]
    if (!issue) {
      console.log(term.yellow("No ready issues to claim."))
      return
    }

    // Get the field updates for both agent and issue
    const { agentUpdate, issueAssignment } = claimIssueFields(agent.shortId, issue.shortId)
    void agentUpdate // Will be used for persistence
    void issueAssignment // Will be used for persistence

    if (opts.json) {
      console.log(JSON.stringify({ agent: agent.shortId, claimed: issue }, null, 2))
      return
    }

    console.log(term.green(`${agent.shortId} claimed ${issue.shortId}`))
    console.log(term.dim(`  ${issue.title}`))
    console.log(term.yellow("\nNote: Claim not yet persisted to storage."))
  })

// bd agent run <agent-id> - Run agent on its queue (continuous)
bdAgentCommand
  .command("run <agent-id>")
  .description("Run agent on its work queue (continuous mode)")
  .option("--max-tasks <n>", "Maximum tasks to process", parseInt)
  .option("--dry-run", "Show what would be done")
  .action(async (agentId, opts) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(pathResolved.repoRoot)
    const agent = getAgent(repo, agentId)
    if (!agent) {
      console.error(term.red(`Agent not found: ${agentId}`))
      process.exitCode = 1
      return
    }

    if (opts.dryRun) {
      console.log(term.bold("Dry run - would execute:"))
      console.log(`  Agent: ${agent.shortId}`)
      console.log(`  Mode: continuous (process work queue)`)
      if (opts.maxTasks) console.log(`  Max tasks: ${opts.maxTasks}`)
      return
    }

    console.log(term.yellow("Agent runtime not yet implemented."))
    console.log(term.dim("Use 'km agent run' for execution commands."))
  })

// Helper functions

function printAgent(agent: Agent): void {
  const status = formatStatus(agent.status)
  const task = agent.currentTaskId ? term.dim(` → ${agent.currentTaskId}`) : ""

  console.log(`${status} ${term.cyan(agent.shortId)} ${agent.name}${task}`)
}

function formatStatus(status: Agent["status"]): string {
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
