/**
 * BD Agent Command (bd agent)
 *
 * Thin shim for beads-integrated agent commands.
 * Delegates to @km/agent for core functionality.
 */

import { Command } from "commander"
import chalk from "chalk"
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
import { createRepo, runGenerator, resolvePathArg } from "@km/storage"
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
  .action((opts) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = runGenerator(createRepo(pathResolved.repoRoot, { loadFiles: true }))
    const agents = queryAgents(repo)

    if (opts.json) {
      console.log(JSON.stringify(agents, null, 2))
      return
    }

    if (agents.length === 0) {
      console.log(chalk.yellow("No agents found."))
      console.log(chalk.dim("Use 'km agent spawn <name>' to create one."))
      return
    }

    console.log(chalk.bold(`Agents (${agents.length}):\n`))
    for (const agent of agents) {
      printAgent(agent)
    }
  })

// bd agent queue <agent-id> - Show agent's assigned issues
bdAgentCommand
  .command("queue <agent-id>")
  .description("Show agent's assigned issues")
  .option("--json", "Output as JSON")
  .action((agentId, opts) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = runGenerator(createRepo(pathResolved.repoRoot, { loadFiles: true }))
    const agent = getAgent(repo, agentId)
    if (!agent) {
      console.error(chalk.red(`Agent not found: ${agentId}`))
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

    console.log(chalk.bold(`Work queue for ${agent.shortId}:\n`))

    if (agent.currentTaskId) {
      console.log(
        `  ${chalk.green("▶")} Current: ${chalk.cyan(agent.currentTaskId)}`,
      )
    }

    if (queue.length === 0 && !agent.currentTaskId) {
      console.log(chalk.dim("  No tasks assigned."))
    } else if (queue.length > 0) {
      console.log()
      for (const item of queue) {
        const isCurrent = item.issueShortId === agent.currentTaskId
        const prefix = isCurrent ? chalk.green("▶") : chalk.dim("○")
        const priority = chalk.dim(`P${item.priority}`)
        console.log(
          `  ${prefix} ${chalk.cyan(item.issueShortId)} ${priority} ${item.title}`,
        )
      }
    }
  })

// bd agent assign <agent-id> <issue-id> - Assign issue to agent
bdAgentCommand
  .command("assign <agent-id> <issue-id>")
  .description("Assign an issue to an agent's queue")
  .action((agentId, issueId) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = runGenerator(createRepo(pathResolved.repoRoot, { loadFiles: true }))
    const agent = getAgent(repo, agentId)
    if (!agent) {
      console.error(chalk.red(`Agent not found: ${agentId}`))
      process.exitCode = 1
      return
    }

    const issue = getIssue(issueId)
    if (!issue) {
      console.error(chalk.red(`Issue not found: ${issueId}`))
      process.exitCode = 1
      return
    }

    // Get the field updates needed
    const assignment = assignIssueFields(agent.shortId)
    void assignment // Will be used for persistence

    console.log(chalk.green(`Assigned ${issue.shortId} to ${agent.shortId}`))
    console.log(chalk.dim(`  ${issue.title}`))
    console.log(
      chalk.yellow("\nNote: Assignment not yet persisted to storage."),
    )
  })

// bd agent unassign <agent-id> <issue-id> - Remove assignment
bdAgentCommand
  .command("unassign <agent-id> <issue-id>")
  .description("Remove an issue from agent's queue")
  .action((agentId, issueId) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = runGenerator(createRepo(pathResolved.repoRoot, { loadFiles: true }))
    const agent = getAgent(repo, agentId)
    if (!agent) {
      console.error(chalk.red(`Agent not found: ${agentId}`))
      process.exitCode = 1
      return
    }

    const issue = getIssue(issueId)
    if (!issue) {
      console.error(chalk.red(`Issue not found: ${issueId}`))
      process.exitCode = 1
      return
    }

    // Get the field updates needed
    const assignment = unassignIssueFields()
    void assignment // Will be used for persistence

    console.log(
      chalk.green(`Unassigned ${issue.shortId} from ${agent.shortId}`),
    )
    console.log(
      chalk.yellow("\nNote: Unassignment not yet persisted to storage."),
    )
  })

// bd agent claim <agent-id> - Agent claims next ready issue
bdAgentCommand
  .command("claim <agent-id>")
  .description("Agent claims the next ready issue from the backlog")
  .option("--json", "Output as JSON")
  .action((agentId, opts) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = runGenerator(createRepo(pathResolved.repoRoot, { loadFiles: true }))
    const agent = getAgent(repo, agentId)
    if (!agent) {
      console.error(chalk.red(`Agent not found: ${agentId}`))
      process.exitCode = 1
      return
    }

    // Get ready issues sorted by priority
    const ready = queryReady()
    if (ready.length === 0) {
      console.log(chalk.yellow("No ready issues to claim."))
      return
    }

    // Claim the first one (highest priority)
    const issue = ready[0]
    if (!issue) {
      console.log(chalk.yellow("No ready issues to claim."))
      return
    }

    // Get the field updates for both agent and issue
    const { agentUpdate, issueAssignment } = claimIssueFields(
      agent.shortId,
      issue.shortId,
    )
    void agentUpdate // Will be used for persistence
    void issueAssignment // Will be used for persistence

    if (opts.json) {
      console.log(
        JSON.stringify({ agent: agent.shortId, claimed: issue }, null, 2),
      )
      return
    }

    console.log(chalk.green(`${agent.shortId} claimed ${issue.shortId}`))
    console.log(chalk.dim(`  ${issue.title}`))
    console.log(chalk.yellow("\nNote: Claim not yet persisted to storage."))
  })

// bd agent run <agent-id> - Run agent on its queue (continuous)
bdAgentCommand
  .command("run <agent-id>")
  .description("Run agent on its work queue (continuous mode)")
  .option("--max-tasks <n>", "Maximum tasks to process", parseInt)
  .option("--dry-run", "Show what would be done")
  .action((agentId, opts) => {
    const pathResolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = runGenerator(createRepo(pathResolved.repoRoot, { loadFiles: true }))
    const agent = getAgent(repo, agentId)
    if (!agent) {
      console.error(chalk.red(`Agent not found: ${agentId}`))
      process.exitCode = 1
      return
    }

    if (opts.dryRun) {
      console.log(chalk.bold("Dry run - would execute:"))
      console.log(`  Agent: ${agent.shortId}`)
      console.log(`  Mode: continuous (process work queue)`)
      if (opts.maxTasks) console.log(`  Max tasks: ${opts.maxTasks}`)
      return
    }

    console.log(chalk.yellow("Agent runtime not yet implemented."))
    console.log(chalk.dim("Use 'km agent run' for execution commands."))
  })

// Helper functions

function printAgent(agent: Agent): void {
  const status = formatStatus(agent.status)
  const task = agent.currentTaskId ? chalk.dim(` → ${agent.currentTaskId}`) : ""

  console.log(`${status} ${chalk.cyan(agent.shortId)} ${agent.name}${task}`)
}

function formatStatus(status: Agent["status"]): string {
  switch (status) {
    case "idle":
      return chalk.dim("○")
    case "running":
      return chalk.green("●")
    case "paused":
      return chalk.yellow("◐")
    case "stopped":
      return chalk.gray("○")
    case "error":
      return chalk.red("✗")
  }
}
