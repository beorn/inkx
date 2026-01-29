/**
 * RepoContext - Dependency Injection for Storage Operations
 *
 * Provides the Repo domain object to TUI components via React Context.
 * This enables testing with mock repos.
 *
 * @example
 * // In component
 * const repo = useRepo();
 * const children = repo.getChildren(parentId);
 *
 * // In production
 * <RepoProvider repo={realRepo}><Board /></RepoProvider>
 *
 * // In tests
 * <RepoProvider repo={mockRepo}><Board /></RepoProvider>
 */

import React, { createContext, useContext, type ReactNode } from "react"
import type { Repo } from "@km/storage"
export type { Repo }

const RepoContext = createContext<Repo | null>(null)

/**
 * Hook to access the repo. Must be used within a RepoProvider.
 */
export function useRepo(): Repo {
  const ctx = useContext(RepoContext)
  if (!ctx) {
    throw new Error("useRepo must be used within a RepoProvider")
  }
  return ctx
}

/**
 * Provides the repo to child components.
 */
export function RepoProvider({
  repo,
  children,
}: {
  repo: Repo
  children: ReactNode
}) {
  return <RepoContext.Provider value={repo}>{children}</RepoContext.Provider>
}
