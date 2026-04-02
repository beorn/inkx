/**
 * Ambient type declarations for mdspec (vendor submodule removed).
 *
 * mdspec was a markdown-driven test framework that lived in vendor/mdspec.
 * After removal, a stub in node_modules/mdspec provides the vitest-plugin
 * (a no-op), but several km-cli files still import types and utilities.
 * These declarations keep TypeScript happy until the imports are cleaned up.
 */

declare module "mdspec/vitest-plugin" {
  export function mdspec(): { name: string }
}

declare module "mdspec/types" {
  export interface ReplResult {
    stdout: string
    stderr: string
    exitCode: number
  }

  export interface BlockOpts {
    type: string
    content: string
    file?: string
    reset?: boolean
    cmd?: string
    minWait?: number
    maxWait?: number
    startupDelay?: number
    exit?: number
    cwd?: string
    env?: Record<string, string>
    timeout?: number
    fixture?: string
    [key: string]: unknown
  }

  export interface FileOpts {
    files: Map<string, string>
    fixture?: string
    memory?: boolean
    [key: string]: unknown
  }

  export type BlockExecutor = ((cmd: string) => Promise<ReplResult | null>) | null

  export interface Plugin {
    block(opts: BlockOpts): BlockExecutor
    beforeAll?(): Promise<void>
    afterAll?(): Promise<void>
    beforeEach?(): Promise<void>
    afterEach?(): Promise<void>
  }
}

declare module "mdspec/plugins/bash" {
  import type { FileOpts, Plugin } from "mdspec/types"
  export function bash(opts: FileOpts): Plugin
}

declare module "mdspec/cmdSession" {
  export class CmdSession {
    constructor(
      command: string,
      opts: {
        cwd?: string
        env?: Record<string, string>
        minWait?: number
        maxWait?: number
        startupDelay?: number
        useOsc133?: boolean
        envFile?: string
        cwdFile?: string
        funcFile?: string
      },
    )
    execute(cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }>
    close(): Promise<void>
  }
}

declare module "mdspec/shell" {
  export function buildScript(
    commands: string[],
    opts: {
      exit?: number
      cwd?: string
      env?: Record<string, string>
      reset?: boolean
      timeout?: number
    },
    envFile: string,
    cwdFile: string,
    funcFile: string,
  ): string

  export function buildHookScript(hookName: string, envFile: string, cwdFile: string, funcFile: string): string
}

declare module "mdspec/core" {
  export function splitNorm(text: string): string[]
}

declare module "mdspec/bun" {
  export function bunShell(
    args: string[],
    opts: { cwd: string; env: Record<string, string>; timeout?: number },
  ): Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number | null }>
}

declare module "mdspec/constants" {
  export const DEFAULTS: {
    TIMEOUT: number
  }
}
