/**
 * Import Auth — Asana token setup and config reset helpers
 */

import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)

import { loadConfig, saveConfig } from "../import/config.ts"

/** Delete saved Asana credentials and re-save config */
export function resetAsanaConfig(): void {
  const config = loadConfig()
  delete config.asana
  saveConfig(config)
}

/** Run interactive setup, returns token + workspace */
export async function ensureAsanaSetup(tokenOverride?: string): Promise<{ token: string; workspace?: string }> {
  const config = loadConfig()

  // If token override provided, use it directly
  if (tokenOverride) {
    return { token: tokenOverride, workspace: config.asana?.defaultWorkspace }
  }

  // If already configured, reuse
  if (config.asana?.token) {
    return { token: config.asana.token, workspace: config.asana.defaultWorkspace }
  }

  // First time — walk user through setup
  const { withTextInput, withSelect } = await import("@silvery/ag-react/ui/wrappers")

  console.log(term.cyan("First-time Asana setup"))
  console.log(term.dim("Get a Personal Access Token from: https://app.asana.com/0/developer-console"))
  console.log()

  const token = await withTextInput("Asana Personal Access Token:", {
    placeholder: "1/1234567890...",
  })

  if (!token?.trim()) {
    console.error(term.red("No token provided"))
    process.exit(1)
  }

  // Validate
  console.log(term.dim("Validating token..."))
  const { validateAsanaToken } = await import("../import/adapters/asana/asana-discovery.ts")

  let userInfo: { name: string; email: string; workspaces: Array<{ gid: string; name: string }> }
  try {
    userInfo = await validateAsanaToken(token.trim())
  } catch (err) {
    console.error(term.red((err as Error).message))
    process.exit(1)
  }

  console.log(term.green("Authenticated as"), userInfo.name, term.dim(`(${userInfo.email})`))

  // Select workspace
  let defaultWorkspace: string | undefined
  if (userInfo.workspaces.length > 1) {
    defaultWorkspace = await withSelect(
      "Default workspace:",
      userInfo.workspaces.map((w) => ({ label: w.name, value: w.name })),
    )
  } else if (userInfo.workspaces.length === 1) {
    defaultWorkspace = userInfo.workspaces[0]?.name
    console.log(term.dim(`Workspace: ${defaultWorkspace}`))
  }

  // Save for next time
  const newConfig = loadConfig()
  newConfig.asana = {
    token: token.trim(),
    ...(defaultWorkspace && { defaultWorkspace }),
  }
  saveConfig(newConfig)
  console.log(term.green("Config saved."))
  console.log()

  return { token: token.trim(), workspace: defaultWorkspace }
}
